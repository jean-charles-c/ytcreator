import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TTSRequest {
  text: string;
  languageCode?: string;
  voiceGender?: "MALE" | "FEMALE" | "NEUTRAL";
  voiceName?: string;
  voiceType?: string;
  style?: string;
  narrationProfile?: "standard" | "storytelling" | "educational";
  speakingRate?: number;
  pitch?: number;
  volumeGainDb?: number;
  effectsProfileId?: string;
  pauseBetweenParagraphs?: number;
  pauseAfterSentences?: number;
  pauseAfterComma?: number;
  dynamicPauseEnabled?: boolean;
  dynamicPauseVariation?: number;
  sentenceStartBoost?: number;
  sentenceEndSlow?: number;
  mode?: "preview" | "full";
  projectId?: string;
  customFileName?: string;
  shotSentences?: { id: string; text: string }[];
  syncMode?: "standard" | "shot_marked";
}

/**
 * Narration profile modulation: applies additive offsets to user settings.
 * These are combined with (not replacing) the user's manual controls.
 */
const NARRATION_MODULATION: Record<string, {
  pauseAfterSentencesAdd: number;
  pauseBetweenParagraphsAdd: number;
  pauseAfterCommaAdd: number;
  dynamicPauseForce: boolean;
  dynamicPauseVariationMin: number;
  emphasisBoost: number; // 0 = normal, 1 = allow more emphasis per sentence
  sentenceStartBoostAdd: number;
  sentenceEndSlowAdd: number;
  rateOffset: number;
}> = {
  standard: {
    pauseAfterSentencesAdd: 0,
    pauseBetweenParagraphsAdd: 0,
    pauseAfterCommaAdd: 0,
    dynamicPauseForce: false,
    dynamicPauseVariationMin: 0,
    emphasisBoost: 0,
    sentenceStartBoostAdd: 0,
    sentenceEndSlowAdd: 0,
    rateOffset: 0,
  },
  storytelling: {
    pauseAfterSentencesAdd: 100,
    pauseBetweenParagraphsAdd: 200,
    pauseAfterCommaAdd: 50,
    dynamicPauseForce: true,
    dynamicPauseVariationMin: 300,
    emphasisBoost: 1,
    sentenceStartBoostAdd: 10,
    sentenceEndSlowAdd: 15,
    rateOffset: -0.03,
  },
  educational: {
    pauseAfterSentencesAdd: 150,
    pauseBetweenParagraphsAdd: 300,
    pauseAfterCommaAdd: 75,
    dynamicPauseForce: false,
    dynamicPauseVariationMin: 0,
    emphasisBoost: 0,
    sentenceStartBoostAdd: 0,
    sentenceEndSlowAdd: 5,
    rateOffset: -0.05,
  },
};

interface Timepoint {
  markName: string;
  timeSeconds: number;
}

interface TTSResponse {
  audioContent: string;
  timepoints?: Timepoint[];
}

async function callGoogleTTS(
  text: string,
  apiKey: string,
  voice: Record<string, unknown>,
  audioConfig: Record<string, unknown>,
  useSsml = false,
  enableTimePointing = false
): Promise<TTSResponse> {
  const input = useSsml ? { ssml: text } : { text };
  const body: Record<string, unknown> = { input, voice, audioConfig };
  if (enableTimePointing) {
    body.enableTimePointing = ["SSML_MARK"];
  }

  // Use v1beta1 for enableTimePointing support (not available in v1)
  const apiVersion = enableTimePointing ? "v1beta1" : "v1";
  const response = await fetch(
    `https://texttospeech.googleapis.com/${apiVersion}/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorData = await response.text();
    console.error("Google TTS API error:", errorData);
    throw new Error(`Google TTS API failed [${response.status}]: ${errorData}`);
  }

  const data = await response.json();
  return {
    audioContent: data.audioContent,
    timepoints: data.timepoints ?? [],
  };
}

interface GoogleVoice {
  name: string;
  languageCodes: string[];
  ssmlGender?: "MALE" | "FEMALE" | "NEUTRAL";
}

const VOICES_CACHE = new Map<string, { voices: GoogleVoice[]; cachedAt: number }>();
const VOICES_TTL_MS = 60 * 60 * 1000;

async function listGoogleVoices(apiKey: string, languageCode: string): Promise<GoogleVoice[]> {
  const cacheKey = languageCode;
  const cached = VOICES_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < VOICES_TTL_MS) return cached.voices;

  const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google voices API failed [${response.status}]: ${err}`);
  }

  const payload = await response.json();
  const voices = ((payload.voices ?? []) as GoogleVoice[])
    .filter((v) => Array.isArray(v.languageCodes) && v.languageCodes.includes(languageCode));

  VOICES_CACHE.set(cacheKey, { voices, cachedAt: Date.now() });
  return voices;
}

async function resolveVoiceName(
  apiKey: string,
  languageCode: string,
  requestedVoiceName: string | undefined,
  voiceType: string | undefined,
  voiceGender: "MALE" | "FEMALE" | "NEUTRAL"
): Promise<string | undefined> {
  // If user explicitly selected a voice name, always respect it
  if (requestedVoiceName && requestedVoiceName.trim().length > 0) {
    console.log(`Using user-requested voice: ${requestedVoiceName}`);
    return requestedVoiceName;
  }

  // No explicit voice name — resolve from type + gender
  try {
    const voices = await listGoogleVoices(apiKey, languageCode);
    if (voices.length === 0) return undefined;

    const normalizedType = (voiceType || "Standard").toLowerCase();

    const typeVoices = voices
      .filter((v) => v.name.toLowerCase().includes(`-${normalizedType}-`))
      .sort((a, b) => a.name.localeCompare(b.name));

    const genderTypeVoices = typeVoices.filter((v) => v.ssmlGender === voiceGender);
    const pool = (genderTypeVoices.length > 0 ? genderTypeVoices : typeVoices);

    if (pool.length > 0) {
      const idx = normalizedType === "wavenet"
        ? pool.length - 1
        : normalizedType === "neural2"
          ? Math.floor(pool.length / 2)
          : 0;
      return pool[Math.max(0, Math.min(idx, pool.length - 1))].name;
    }

    const byGender = voices.filter((v) => v.ssmlGender === voiceGender);
    return (byGender[0] || voices[0])?.name;
  } catch (error) {
    console.error("Voice resolve fallback:", error);
    return undefined;
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Emphasis heuristics ──

/** High-impact French narrative words that benefit from moderate emphasis. */
const EMPHASIS_WORDS_FR = new Set([
  "jamais", "toujours", "absolument", "exactement", "fondamental", "essentiel",
  "crucial", "unique", "extraordinaire", "remarquable", "incroyable", "terrible",
  "immense", "énorme", "radical", "profond", "décisif", "capital", "vital",
  "dramatique", "tragique", "historique", "révolutionnaire", "spectaculaire",
  "impossible", "inévitable", "irréversible", "définitivement", "totalement",
  "véritablement", "réellement", "surtout", "notamment", "paradoxalement",
  "never", "always", "absolutely", "crucial", "essential", "extraordinary",
  "remarkable", "incredible", "dramatic", "revolutionary", "impossible",
  "fundamental", "critical", "devastating", "unprecedented", "ultimately",
]);

/** Dramatic opener words — get a lighter emphasis. */
const EMPHASIS_OPENERS_FR = new Set([
  "mais", "or", "pourtant", "cependant", "néanmoins", "toutefois",
  "soudain", "alors", "ainsi", "désormais", "enfin", "finalement",
  "but", "however", "yet", "suddenly", "finally", "therefore",
]);

/**
 * Apply heuristic emphasis to a sentence (already XML-escaped).
 * Rules:
 * - Max 2 emphasized words per sentence to avoid over-accentuation.
 * - Opener words at position 0 get level="reduced" (subtle lift).
 * - High-impact words get level="moderate".
 * - Skip words already inside SSML tags.
 */
function applyEmphasis(sentence: string, emphasisBoost = 0): string {
  // Don't process very short sentences
  const wordCount = sentence.split(/\s+/).filter(w => w.trim()).length;
  if (wordCount < 4) return sentence;

  let emphasisCount = 0;
  const MAX_EMPHASIS = 2 + emphasisBoost; // storytelling allows more

  // Split into tokens preserving whitespace and existing SSML tags
  const parts = sentence.split(/(<[^>]+>)/);
  let insideTag = false;
  let wordPosition = 0;

  const result = parts.map((part) => {
    // Track SSML tag depth
    if (part.startsWith("<")) return part;

    // Process text segments word by word
    return part.replace(/\b([a-zA-ZÀ-ÿ''-]+)\b/g, (match, word) => {
      if (emphasisCount >= MAX_EMPHASIS) return match;

      const lower = word.toLowerCase().replace(/['']/g, "'");
      const isFirst = wordPosition === 0;
      wordPosition++;

      if (isFirst && EMPHASIS_OPENERS_FR.has(lower)) {
        emphasisCount++;
        return `<emphasis level="reduced">${match}</emphasis>`;
      }

      if (EMPHASIS_WORDS_FR.has(lower)) {
        emphasisCount++;
        return `<emphasis level="moderate">${match}</emphasis>`;
      }

      return match;
    });
  });

  return result.join("");
}

/**
 * Prosodic continuity: soften breaks between closely linked sentences.
 * When a sentence ends with a colon, semicolon, or dash followed by another sentence,
 * reduce the inter-sentence pause to create smoother flow.
 * Returns the processed array with continuity hints.
 */
function shouldReducePause(currentSentence: string, _nextSentence: string): boolean {
  // Sentences ending with continuation markers should flow into the next
  const trimmed = currentSentence.trim();
  return /[:;–—]\s*$/.test(trimmed) || /[,]\s*$/.test(trimmed);
}

const CONTINUITY_PAUSE_RATIO = 0.4; // reduce pause to 40% of normal

/**
 * Build SSML with <mark> tags between shot sentences for precise timepointing.
 * Returns SSML string with marks named "s_0", "s_1", etc.
 */
function buildMarkedSsml(
  shotSentences: { id: string; text: string }[],
  pauseAfterSentences: number,
  sentenceStartBoost: number,
  sentenceEndSlow: number,
  commaPauseMs = 0,
  dynamicPauseEnabled = false,
  dynamicPauseVariation = 0,
  emphasisBoost = 0
): string {
  const parts = shotSentences.map((shot, idx) => {
    const mark = `<mark name="s_${idx}"/>`;
    let processed = escapeXml(shot.text.trim());

    // Prosody MUST run first on clean escaped text (splits by whitespace)
    if (sentenceStartBoost > 0 || sentenceEndSlow > 0) {
      processed = processSentenceProsody(processed, sentenceStartBoost, sentenceEndSlow);
    }

    // Emphasis runs second — it's tag-aware (splits by <tag> boundaries)
    processed = applyEmphasis(processed, emphasisBoost);
    if (commaPauseMs > 0) {
      processed = injectCommaPauses(processed, commaPauseMs);
    }

    return { ssml: `${mark}${processed}`, text: shot.text.trim() };
  });

  // Join with sentence pauses (with continuity awareness)
  const joined = parts.map((p, i) => {
    if (i < parts.length - 1 && pauseAfterSentences > 0) {
      let pause = jitterPause(pauseAfterSentences, dynamicPauseVariation, dynamicPauseEnabled);
      // Reduce pause for prosodic continuity
      if (shouldReducePause(p.text, parts[i + 1].text)) {
        pause = Math.max(50, Math.round(pause * CONTINUITY_PAUSE_RATIO));
      }
      return `${p.ssml}<break time="${pause}ms"/>`;
    }
    return p.ssml;
  }).join(" ");

  const endMark = `<mark name="__end"/>`;
  return `<speak>${joined}${endMark}</speak>`;
}

function processSentenceProsody(sentence: string, startBoostPct: number, endSlowPct: number): string {
  // Detect interrogative/exclamatory sentences: ? or ! at end, or .? / .! (common in scripts)
  const endsWithExclamOrQuestion = /[!?]\s*$/.test(sentence) || /\.\s*[?!]\s*$/.test(sentence);
  // For questions/exclamations: disable ALL prosody to preserve natural TTS intonation
  // Neural2/WaveNet voices produce correct rising intonation only without prosody interference
  if (endsWithExclamOrQuestion) return sentence;
  const effectiveEndSlow = endSlowPct;
  const words = sentence.split(/(\s+)/);
  const actualWords = words.filter(w => w.trim());

  if (actualWords.length <= 2) {
    if (startBoostPct > 0) return `<prosody rate="${100 + startBoostPct}%">${sentence}</prosody>`;
    if (effectiveEndSlow > 0) return `<prosody rate="${Math.max(20, 100 - effectiveEndSlow)}%">${sentence}</prosody>`;
    return sentence;
  }

  let headCount = 0, headIdx = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].trim()) headCount++;
    if (headCount >= 3) { headIdx = i + 1; break; }
  }
  if (headIdx === 0) headIdx = words.length;

  let tailCount = 0, tailIdx = words.length;
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].trim()) tailCount++;
    if (tailCount >= 3) { tailIdx = i; break; }
  }

  if (tailIdx <= headIdx) {
    const mid = Math.floor(words.length / 2);
    if (startBoostPct > 0 && effectiveEndSlow > 0) {
      const head = words.slice(0, mid).join("");
      const tail = words.slice(mid).join("");
      return `<prosody rate="${100 + startBoostPct}%">${head}</prosody><prosody rate="${Math.max(20, 100 - effectiveEndSlow)}%">${tail}</prosody>`;
    }
    headIdx = mid;
    tailIdx = mid;
  }

  if (startBoostPct > 0 && effectiveEndSlow > 0) {
    const head = words.slice(0, headIdx).join("");
    const middle = words.slice(headIdx, tailIdx).join("");
    const tail = words.slice(tailIdx).join("");
    return `<prosody rate="${100 + startBoostPct}%">${head}</prosody>${middle}<prosody rate="${Math.max(20, 100 - effectiveEndSlow)}%">${tail}</prosody>`;
  } else if (startBoostPct > 0) {
    const head = words.slice(0, headIdx).join("");
    const tail = words.slice(headIdx).join("");
    return `<prosody rate="${100 + startBoostPct}%">${head}</prosody>${tail}`;
  } else if (effectiveEndSlow > 0) {
    const head = words.slice(0, tailIdx).join("");
    const tail = words.slice(tailIdx).join("");
    return `${head}<prosody rate="${Math.max(20, 100 - effectiveEndSlow)}%">${tail}</prosody>`;
  }

  return sentence;
}

/**
 * Inject <break> after commas in already-escaped text.
 */
function injectCommaPauses(text: string, commaMs: number): string {
  if (commaMs <= 0) return text;
  // Insert break after commas (but not inside SSML tags)
  return text.replace(/,(?![^<]*>)/g, `,<break time="${commaMs}ms"/>`);
}

/**
 * Add random variation to a pause value (returns jittered ms).
 */
function jitterPause(baseMs: number, variationMs: number, enabled: boolean): number {
  if (!enabled || variationMs <= 0 || baseMs <= 0) return baseMs;
  const jitter = Math.round((Math.random() * 2 - 1) * variationMs);
  return Math.max(50, baseMs + jitter);
}

function textToSsml(
  rawText: string,
  paraPauseMs: number,
  sentPauseMs: number,
  startBoostPct: number,
  endSlowPct: number,
  commaPauseMs = 0,
  dynamicPauseEnabled = false,
  dynamicPauseVariation = 0,
  emphasisBoost = 0
): string {
  if (paraPauseMs <= 0 && sentPauseMs <= 0 && startBoostPct <= 0 && endSlowPct <= 0 && commaPauseMs <= 0) return `<speak>${escapeXml(rawText)}</speak>`;

  const paragraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim());

  const processedParagraphs = paragraphs.map((p) => {
    const escaped = escapeXml(p.trim());
    const sentences = escaped.split(/(?<=[.!?])\s+/);
    const processed = sentences.map((s) => {
      // Prosody first (splits by whitespace, needs clean text)
      let result = processSentenceProsody(s, startBoostPct, endSlowPct);
      // Emphasis second (tag-aware)
      result = applyEmphasis(result, emphasisBoost);
      if (commaPauseMs > 0) result = injectCommaPauses(result, commaPauseMs);
      return result;
    });
    if (sentPauseMs > 0) {
      return processed.map((s, i) => {
        if (i < processed.length - 1) {
          let pause = jitterPause(sentPauseMs, dynamicPauseVariation, dynamicPauseEnabled);
          // Prosodic continuity: reduce pause between linked sentences
          if (shouldReducePause(sentences[i], sentences[i + 1] || "")) {
            pause = Math.max(50, Math.round(pause * CONTINUITY_PAUSE_RATIO));
          }
          return `${s}<break time="${pause}ms"/>`;
        }
        return s;
      }).join(" ");
    }
    return processed.join(" ");
  });

  const paraBreakParts = processedParagraphs.map((p, i) => {
    if (i < processedParagraphs.length - 1 && paraPauseMs > 0) {
      const pause = jitterPause(paraPauseMs, dynamicPauseVariation, dynamicPauseEnabled);
      return `${p}<break time="${pause}ms"/>`;
    }
    return p;
  });

  return `<speak>${paraBreakParts.join("\n")}</speak>`;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function ssmlToPlainText(ssml: string): string {
  return unescapeXml(
    ssml
      .replace(/^<speak>/, "")
      .replace(/<\/speak>$/, "")
      .replace(/<break[^>]*\/>/g, " ")
      .replace(/<mark[^>]*\/>/g, " ")
      .replace(/<\/?(?:prosody|emphasis)[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

interface LegacyChunkOptions {
  paraPauseMs: number;
  sentPauseMs: number;
  startBoostPct: number;
  endSlowPct: number;
  commaPauseMs: number;
  dynamicPauseEnabled: boolean;
  dynamicPauseVariation: number;
  emphasisBoost: number;
  maxSsmlChars: number;
}

function chunkTextForLegacySsml(rawText: string, options: LegacyChunkOptions): string[] {
  const buildSsml = (input: string) => textToSsml(
    input,
    options.paraPauseMs,
    options.sentPauseMs,
    options.startBoostPct,
    options.endSlowPct,
    options.commaPauseMs,
    options.dynamicPauseEnabled,
    options.dynamicPauseVariation,
    options.emphasisBoost
  );

  const fits = (input: string) => buildSsml(input).length <= options.maxSsmlChars;
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (!trimmed) return;
    chunks.push(buildSsml(trimmed));
    current = "";
  };

  const addUnit = (unit: string, separator: string) => {
    const trimmedUnit = unit.trim();
    if (!trimmedUnit) return;

    const candidate = current ? `${current}${separator}${trimmedUnit}` : trimmedUnit;
    if (!current || fits(candidate)) {
      current = candidate;
      return;
    }

    flush();
    if (fits(trimmedUnit)) {
      current = trimmedUnit;
      return;
    }

    const words = trimmedUnit.split(/\s+/).filter(Boolean);
    let partial = "";

    for (const word of words) {
      const partialCandidate = partial ? `${partial} ${word}` : word;
      if (!partial || fits(partialCandidate)) {
        partial = partialCandidate;
        continue;
      }

      chunks.push(buildSsml(partial.trim()));
      partial = word;

      if (!fits(partial)) {
        const safeSlices = word.match(new RegExp(`.{1,${Math.max(50, Math.floor(options.maxSsmlChars / 2))}}`, "g")) ?? [word];
        for (let i = 0; i < safeSlices.length - 1; i++) {
          chunks.push(buildSsml(safeSlices[i]));
        }
        partial = safeSlices[safeSlices.length - 1];
      }
    }

    current = partial.trim();
  };

  const paragraphs = rawText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  for (const paragraph of paragraphs) {
    const paragraphCandidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (!current || fits(paragraphCandidate)) {
      current = paragraphCandidate;
      continue;
    }

    flush();
    if (fits(paragraph)) {
      current = paragraph;
      continue;
    }

    const sentences = paragraph.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    for (const sentence of sentences) {
      addUnit(sentence, " ");
    }
    flush();
  }

  flush();
  return chunks.length > 0 ? chunks : [buildSsml(rawText)];
}

/**
 * Split marked SSML into chunks of ~MAX_CHARS, keeping mark+sentence pairs together.
 * Returns array of {ssml, markIndices} where markIndices tracks which s_N marks are in each chunk.
 */
function chunkMarkedSsml(
  ssml: string,
  maxChars: number
): { ssml: string; markIndices: number[] }[] {
  // Extract inner content between <speak> and </speak>
  const inner = ssml.replace(/^<speak>/, "").replace(/<\/speak>$/, "");

  // Split by marks: each segment starts with <mark name="s_N"/> or <mark name="__end"/>
  const markPattern = /(<mark name="[^"]+"\/>)/g;
  const parts: string[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = markPattern.exec(inner)) !== null) {
    if (match.index > lastIdx) {
      // Content before the first mark (shouldn't happen but safety)
      parts.push(inner.slice(lastIdx, match.index));
    }
    lastIdx = match.index;
  }
  if (lastIdx < inner.length) {
    parts.push(inner.slice(lastIdx));
  }

  // Now split into mark+content pairs
  const segments: { mark: string; content: string; index: number }[] = [];
  const segPattern = /<mark name="(s_(\d+)|__end)"\/>([^<]*(?:<(?!mark)[^<]*)*)/g;
  let segMatch: RegExpExecArray | null;
  const fullContent = inner;

  // Simpler approach: split by mark tags
  const markRegex = /<mark name="(s_\d+|__end)"\/>/g;
  const allMarks: { name: string; pos: number }[] = [];
  while ((segMatch = markRegex.exec(fullContent)) !== null) {
    allMarks.push({ name: segMatch[1], pos: segMatch.index });
  }

  // Build segments: each is mark + text until next mark
  const segmentPairs: { markName: string; text: string; idx: number }[] = [];
  for (let i = 0; i < allMarks.length; i++) {
    const markTag = `<mark name="${allMarks[i].name}"/>`;
    const startAfterMark = allMarks[i].pos + markTag.length;
    const endPos = i + 1 < allMarks.length ? allMarks[i].pos + markTag.length + (allMarks[i + 1].pos - startAfterMark) : fullContent.length;
    const text = fullContent.slice(startAfterMark, i + 1 < allMarks.length ? allMarks[i + 1].pos : fullContent.length);
    const idx = allMarks[i].name.startsWith("s_") ? parseInt(allMarks[i].name.replace("s_", "")) : -1;
    segmentPairs.push({ markName: allMarks[i].name, text, idx });
  }

  // Now chunk: group segments into chunks under maxChars
  const chunks: { ssml: string; markIndices: number[] }[] = [];
  let currentParts: string[] = [];
  let currentIndices: number[] = [];
  let currentLen = "<speak></speak>".length;

  for (const seg of segmentPairs) {
    const segText = `<mark name="${seg.markName}"/>${seg.text}`;
    if (currentLen + segText.length > maxChars && currentParts.length > 0) {
      // Add chunk end marker for duration measurement
      currentParts.push(`<mark name="__chunk_end"/>`);
      chunks.push({
        ssml: `<speak>${currentParts.join("")}</speak>`,
        markIndices: currentIndices,
      });
      currentParts = [];
      currentIndices = [];
      currentLen = "<speak></speak>".length;
    }
    currentParts.push(segText);
    if (seg.idx >= 0) currentIndices.push(seg.idx);
    currentLen += segText.length;
  }

  if (currentParts.length > 0) {
    // Don't need chunk_end on last chunk since __end is already there
    chunks.push({
      ssml: `<speak>${currentParts.join("")}</speak>`,
      markIndices: currentIndices,
    });
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!GOOGLE_TTS_API_KEY) {
      throw new Error("GOOGLE_TTS_API_KEY is not configured");
    }

    const body: TTSRequest = await req.json();
    const {
      text,
      languageCode = "fr-FR",
      voiceGender = "FEMALE",
      voiceName,
      voiceType,
      narrationProfile = "standard",
      mode = "preview",
      projectId,
      shotSentences,
      syncMode = "standard",
    } = body;

    // Apply narration profile modulation on top of user settings
    const mod = NARRATION_MODULATION[narrationProfile] ?? NARRATION_MODULATION.standard;
    const speakingRate = (body.speakingRate ?? 1.0) + mod.rateOffset;
    const pitch = body.pitch ?? 0;
    const volumeGainDb = body.volumeGainDb ?? 0;
    const effectsProfileId = body.effectsProfileId;
    const pauseBetweenParagraphs = (body.pauseBetweenParagraphs ?? 0) + mod.pauseBetweenParagraphsAdd;
    const pauseAfterSentences = (body.pauseAfterSentences ?? 0) + mod.pauseAfterSentencesAdd;
    const pauseAfterComma = (body.pauseAfterComma ?? 0) + mod.pauseAfterCommaAdd;
    const dynamicPauseEnabled = (body.dynamicPauseEnabled ?? false) || mod.dynamicPauseForce;
    const dynamicPauseVariation = Math.max(body.dynamicPauseVariation ?? 0, mod.dynamicPauseVariationMin);
    const sentenceStartBoost = (body.sentenceStartBoost ?? 0) + mod.sentenceStartBoostAdd;
    const sentenceEndSlow = (body.sentenceEndSlow ?? 0) + mod.sentenceEndSlowAdd;

    console.log(`NarrationProfile: ${narrationProfile}, effective pauses: sent=${pauseAfterSentences}, para=${pauseBetweenParagraphs}, comma=${pauseAfterComma}, dynamic=${dynamicPauseEnabled}/${dynamicPauseVariation}`);

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Le texte est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolvedVoiceName = await resolveVoiceName(
      GOOGLE_TTS_API_KEY,
      languageCode,
      voiceName,
      voiceType,
      voiceGender
    );

    const voice: Record<string, unknown> = { languageCode };
    if (resolvedVoiceName) {
      voice.name = resolvedVoiceName;
    } else {
      voice.ssmlGender = voiceGender;
    }

    const audioConfig: Record<string, unknown> = { audioEncoding: "MP3", speakingRate, pitch, volumeGainDb };
    if (effectsProfileId) {
      audioConfig.effectsProfileId = [effectsProfileId];
    }

    if (mode === "preview") {
      const ssmlText = textToSsml(text, pauseBetweenParagraphs, pauseAfterSentences, sentenceStartBoost, sentenceEndSlow, pauseAfterComma, dynamicPauseEnabled, dynamicPauseVariation, mod.emphasisBoost);
      const isSsml = ssmlText.startsWith("<speak>");
      const result = await callGoogleTTS(ssmlText, GOOGLE_TTS_API_KEY, voice, audioConfig, isSsml);
      return new Response(
        JSON.stringify({ audioContent: result.audioContent, usedVoiceName: resolvedVoiceName ?? null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === FULL GENERATION MODE ===
    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId requis pour la génération complète" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader! } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const useMarkedMode = syncMode === "shot_marked" && shotSentences && shotSentences.length > 0;
    const MAX_CHARS = 4800;

    let audioBuffers: Uint8Array[] = [];
    let allTimepoints: { shotIndex: number; timeSeconds: number; shotId: string }[] = [];
    let cumulativeOffset = 0;

    if (useMarkedMode) {
      // ── Marked mode: SSML with <mark> tags for precise shot timing ──
      console.log(`Generating TTS with ${shotSentences!.length} shot marks`);
      const markedSsml = buildMarkedSsml(
        shotSentences!,
        pauseAfterSentences,
        sentenceStartBoost,
        sentenceEndSlow,
        pauseAfterComma,
        dynamicPauseEnabled,
        dynamicPauseVariation,
        mod.emphasisBoost
      );

      const chunks = chunkMarkedSsml(markedSsml, MAX_CHARS);
      console.log(`Split into ${chunks.length} chunks, total shots: ${shotSentences!.length}`);

      // cumulativeOffset is declared at outer scope

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        console.log(`Chunk ${ci + 1}: marks=[${chunk.markIndices.join(",")}], ${chunk.ssml.length} chars`);

        const result = await callGoogleTTS(
          chunk.ssml,
          GOOGLE_TTS_API_KEY,
          voice,
          audioConfig,
          true, // isSsml
          true  // enableTimePointing
        );

        // Decode audio
        const raw = Uint8Array.from(atob(result.audioContent), (c) => c.charCodeAt(0));
        audioBuffers.push(raw);

        // Process timepoints
        let chunkDuration = 0;
        const chunkTimepoints: { name: string; time: number }[] = [];
        if (result.timepoints) {
          for (const tp of result.timepoints) {
            chunkTimepoints.push({ name: tp.markName, time: tp.timeSeconds });
            if (tp.markName === "__chunk_end" || tp.markName === "__end") {
              chunkDuration = tp.timeSeconds;
              continue;
            }
            if (tp.markName.startsWith("s_")) {
              const idx = parseInt(tp.markName.replace("s_", ""));
              allTimepoints.push({
                shotIndex: idx,
                timeSeconds: Math.round((tp.timeSeconds + cumulativeOffset) * 1000) / 1000,
                shotId: shotSentences![idx]?.id ?? "",
              });
            }
          }
        }

        console.log(`Chunk ${ci + 1} timepoints: ${JSON.stringify(chunkTimepoints)}`);

        // If no end marker found, estimate from audio byte size (MP3 ~16kbps)
        if (chunkDuration === 0) {
          // Use last timepoint + 2s as fallback
          if (result.timepoints && result.timepoints.length > 0) {
            const lastTp = result.timepoints[result.timepoints.length - 1];
            chunkDuration = lastTp.timeSeconds + 2;
          } else {
            // Very rough: MP3 at ~128kbps = 16KB/s
            chunkDuration = raw.length / 16000;
          }
        }

        cumulativeOffset += chunkDuration;
        console.log(`Chunk ${ci + 1} duration: ${chunkDuration.toFixed(3)}s, cumulative: ${cumulativeOffset.toFixed(3)}s`);
      }

      console.log(`Total timepoints generated: ${allTimepoints.length}, expected: ${shotSentences!.length}`);
      console.log(`Timepoints: ${JSON.stringify(allTimepoints.map(tp => ({ idx: tp.shotIndex, t: tp.timeSeconds, id: tp.shotId.slice(0, 8) })))}`);
    } else {
      // ── Legacy mode: no marks, plain text/SSML ──
      const ssmlText = textToSsml(text, pauseBetweenParagraphs, pauseAfterSentences, sentenceStartBoost, sentenceEndSlow, pauseAfterComma, dynamicPauseEnabled, dynamicPauseVariation);
      const isSsml = ssmlText.startsWith("<speak>");

      console.log(`Legacy mode: isSsml=${isSsml}, totalLen=${ssmlText.length}`);

      const chunks = ssmlText.length <= MAX_CHARS
        ? [ssmlText]
        : chunkTextForLegacySsml(text, {
            paraPauseMs: pauseBetweenParagraphs,
            sentPauseMs: pauseAfterSentences,
            startBoostPct: sentenceStartBoost,
            endSlowPct: sentenceEndSlow,
            commaPauseMs: pauseAfterComma,
            dynamicPauseEnabled,
            dynamicPauseVariation,
            emphasisBoost: mod.emphasisBoost,
            maxSsmlChars: MAX_CHARS,
          });

      console.log(`Split into ${chunks.length} legacy chunks`);

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const chunkIsSsml = chunk.startsWith("<speak>");
        console.log(`Legacy chunk ${ci + 1}: ssml=${chunkIsSsml}, len=${chunk.length}, start=${chunk.slice(0, 120)}...`);

        try {
          const result = await callGoogleTTS(chunk, GOOGLE_TTS_API_KEY, voice, audioConfig, chunkIsSsml);
          const raw = Uint8Array.from(atob(result.audioContent), (c) => c.charCodeAt(0));
          audioBuffers.push(raw);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (chunkIsSsml && message.includes("Invalid SSML")) {
            console.warn(`Legacy chunk ${ci + 1} invalid SSML, retrying as plain text fallback`);
            const fallbackText = ssmlToPlainText(chunk);
            const fallbackResult = await callGoogleTTS(fallbackText, GOOGLE_TTS_API_KEY, voice, audioConfig, false);
            const raw = Uint8Array.from(atob(fallbackResult.audioContent), (c) => c.charCodeAt(0));
            audioBuffers.push(raw);
            continue;
          }
          throw error;
        }
      }
    }

    // Concatenate all MP3 buffers
    const totalLength = audioBuffers.reduce((sum, b) => sum + b.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of audioBuffers) {
      combined.set(buf, offset);
      offset += buf.length;
    }

    // Generate file name
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitized = body.customFileName
      ? body.customFileName.replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "_").slice(0, 80)
      : null;
    const fileName = sanitized ? `${sanitized}.mp3` : `vo_${timestamp}.mp3`;
    const filePath = `${user.id}/${projectId}/${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from("vo-audio")
      .upload(filePath, combined, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("vo-audio")
      .getPublicUrl(filePath);

    // Estimate duration: use cumulative offset from timepoints if available, else word count
    const wordCount = text.trim().split(/\s+/).length;
    const durationEstimate = allTimepoints.length > 0
      ? cumulativeOffset
      : (wordCount / 150) * 60 / speakingRate;

    // Save to history table (with timepoints if available)
    const { data: historyEntry, error: historyError } = await supabaseAdmin
      .from("vo_audio_history")
      .insert({
        project_id: projectId,
        user_id: user.id,
        file_name: fileName,
        file_path: filePath,
        file_size: combined.length,
        duration_estimate: durationEstimate,
        language_code: languageCode,
        voice_gender: voiceGender,
        style: `${body.voiceType || "Standard"}:${body.style || "neutral"}`,
        speaking_rate: speakingRate,
        text_length: text.length,
        ...(allTimepoints.length > 0 ? { shot_timepoints: allTimepoints } : {}),
      })
      .select()
      .single();

    if (historyError) {
      console.error("History insert error:", historyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        audioUrl: urlData.publicUrl,
        fileName,
        filePath,
        fileSize: combined.length,
        durationEstimate,
        historyId: historyEntry?.id ?? null,
        chunks: audioBuffers.length,
        usedVoiceName: resolvedVoiceName ?? null,
        shotTimepoints: allTimepoints.length > 0 ? allTimepoints : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("TTS generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
