import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateExactShotSentences, validateExactShotTimepoints } from "../_shared/exact-shot-sync.ts";
...
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

function decodeBase64Audio(audioContent: string): Uint8Array {
  return base64Decode(audioContent);
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
  try {
    const voices = await listGoogleVoices(apiKey, languageCode);
    if (voices.length === 0) return requestedVoiceName?.trim() || undefined;

    const trimmedRequestedVoiceName = requestedVoiceName?.trim();
    if (trimmedRequestedVoiceName) {
      const exactMatch = voices.find((voice) => voice.name === trimmedRequestedVoiceName);
      if (exactMatch) {
        console.log(`Using user-requested voice: ${trimmedRequestedVoiceName}`);
        return exactMatch.name;
      }
      console.warn(`Requested voice unavailable for ${languageCode}: ${trimmedRequestedVoiceName}. Falling back to type resolution.`);
    }

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
      const resolvedVoice = pool[Math.max(0, Math.min(idx, pool.length - 1))].name;
      console.log(`Resolved voice from type=${voiceType || "Standard"} gender=${voiceGender}: ${resolvedVoice}`);
      return resolvedVoice;
    }

    const byGender = voices.filter((v) => v.ssmlGender === voiceGender);
    const fallbackVoice = (byGender[0] || voices[0])?.name;
    if (fallbackVoice) {
      console.log(`Falling back to available voice: ${fallbackVoice}`);
    }
    return fallbackVoice;
  } catch (error) {
    console.error("Voice resolve fallback:", error);
    return requestedVoiceName?.trim() || undefined;
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
const SHOT_BOUNDARY_BREAK_MS = 1;

/**
 * Wrap SSML content in <prosody volume="+0dB"> to force a fixed absolute
 * volume across separate TTS API calls. Using an explicit dB value (rather
 * than the keyword "medium") prevents Google TTS from applying independent
 * per-chunk loudness normalization.
 */
function applyVolumeEqualization(ssml: string, gainOffsetDb = 0): string {
  const sign = gainOffsetDb >= 0 ? "+" : "";
  const volAttr = `${sign}${gainOffsetDb.toFixed(1)}dB`;
  return ssml.replace(
    /^<speak>([\s\S]*)<\/speak>$/,
    `<speak><prosody volume="${volAttr}">$1</prosody></speak>`
  );
}

/**
 * Compute RMS loudness from LINEAR16 PCM data (16-bit signed LE, mono or stereo).
 * LINEAR16 from Google TTS is mono 24kHz/48kHz, 16-bit signed little-endian.
 * Returns RMS in the 0–32768 range and dBFS value.
 */
function computePcmRms(pcmData: Uint8Array): { rms: number; dbfs: number } {
  // Skip WAV header if present (44 bytes for standard WAV)
  let offset = 0;
  if (pcmData.length > 44 &&
      pcmData[0] === 0x52 && pcmData[1] === 0x49 &&
      pcmData[2] === 0x46 && pcmData[3] === 0x46) {
    // RIFF header — find 'data' chunk
    let pos = 12;
    while (pos < pcmData.length - 8) {
      const chunkId = String.fromCharCode(pcmData[pos], pcmData[pos+1], pcmData[pos+2], pcmData[pos+3]);
      const chunkSize = pcmData[pos+4] | (pcmData[pos+5]<<8) | (pcmData[pos+6]<<16) | (pcmData[pos+7]<<24);
      if (chunkId === "data") { offset = pos + 8; break; }
      pos += 8 + chunkSize;
    }
  }

  const sampleCount = Math.floor((pcmData.length - offset) / 2);
  if (sampleCount < 10) return { rms: 0, dbfs: -96 };

  let sumSq = 0;
  for (let i = 0; i < sampleCount; i++) {
    const idx = offset + i * 2;
    let sample = pcmData[idx] | (pcmData[idx + 1] << 8);
    if (sample >= 0x8000) sample -= 0x10000; // signed
    sumSq += sample * sample;
  }

  const rms = Math.sqrt(sumSq / sampleCount);
  const dbfs = rms > 0 ? 20 * Math.log10(rms / 32768) : -96;
  return { rms, dbfs };
}

/**
 * Analyze per-chunk PCM loudness and compute dB gain adjustments
 * to bring all chunks to the same perceived level.
 */
function computePcmGainAdjustments(pcmChunks: Uint8Array[], toleranceDb = 1.5): {
  rmsValues: number[];
  dbfsValues: number[];
  meanDbfs: number;
  adjustmentsDb: number[];
  outlierIndices: number[];
} {
  if (pcmChunks.length <= 1) {
    return { rmsValues: [], dbfsValues: [], meanDbfs: 0, adjustmentsDb: [], outlierIndices: [] };
  }

  const measurements = pcmChunks.map(c => computePcmRms(c));
  const rmsValues = measurements.map(m => m.rms);
  const dbfsValues = measurements.map(m => m.dbfs);
  const validDbfs = dbfsValues.filter(d => d > -90);
  if (validDbfs.length === 0) {
    return { rmsValues, dbfsValues, meanDbfs: -96, adjustmentsDb: new Array(pcmChunks.length).fill(0), outlierIndices: [] };
  }

  const meanDbfs = validDbfs.reduce((a, b) => a + b, 0) / validDbfs.length;
  const adjustmentsDb: number[] = [];
  const outlierIndices: number[] = [];

  for (let i = 0; i < dbfsValues.length; i++) {
    const diff = meanDbfs - dbfsValues[i]; // positive = needs boost
    if (Math.abs(diff) > toleranceDb && dbfsValues[i] > -90) {
      // Clamp to reasonable range
      const clampedDb = Math.max(-6, Math.min(6, Math.round(diff * 10) / 10));
      adjustmentsDb.push(clampedDb);
      outlierIndices.push(i);
    } else {
      adjustmentsDb.push(0);
    }
  }

  return { rmsValues, dbfsValues, meanDbfs, adjustmentsDb, outlierIndices };
}

interface Linear16WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

function readUint16Le(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readUint32Le(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) target[offset + i] = value.charCodeAt(i);
}

function writeUint16Le(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32Le(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >> 8) & 0xff;
  target[offset + 2] = (value >> 16) & 0xff;
  target[offset + 3] = (value >> 24) & 0xff;
}

function parseLinear16WavFormat(data: Uint8Array): Linear16WavFormat {
  if (data.length < 44) {
    throw new Error("Audio LINEAR16 invalide — en-tête WAV incomplet.");
  }

  const riff = String.fromCharCode(data[0], data[1], data[2], data[3]);
  const wave = String.fromCharCode(data[8], data[9], data[10], data[11]);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Audio LINEAR16 invalide — conteneur WAV attendu.");
  }

  let pos = 12;
  let channels = 1;
  let sampleRate = 24000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  while (pos + 8 <= data.length) {
    const chunkId = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
    const chunkSize = readUint32Le(data, pos + 4);
    const chunkStart = pos + 8;

    if (chunkId === "fmt ") {
      const audioFormat = readUint16Le(data, chunkStart);
      channels = readUint16Le(data, chunkStart + 2);
      sampleRate = readUint32Le(data, chunkStart + 4);
      bitsPerSample = readUint16Le(data, chunkStart + 14);
      if (audioFormat !== 1) {
        throw new Error("Audio LINEAR16 invalide — PCM requis.");
      }
    }

    if (chunkId === "data") {
      dataOffset = chunkStart;
      dataLength = Math.min(chunkSize, data.length - chunkStart);
      break;
    }

    pos = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || dataLength <= 0) {
    throw new Error("Audio LINEAR16 invalide — bloc data introuvable.");
  }

  if (bitsPerSample !== 16) {
    throw new Error(`Audio LINEAR16 invalide — 16 bits attendus, reçu ${bitsPerSample}.`);
  }

  return { sampleRate, channels, bitsPerSample, dataOffset, dataLength };
}

function getLinear16WavDuration(data: Uint8Array): number {
  const format = parseLinear16WavFormat(data);
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  return format.dataLength / bytesPerSecond;
}

function computeLinear16WavRms(wavData: Uint8Array, trimEndSeconds = 0): { rms: number; dbfs: number } {
  const format = parseLinear16WavFormat(wavData);
  const bytesPerSample = format.bitsPerSample / 8;
  const trimBytes = Math.max(0, Math.round(trimEndSeconds * format.sampleRate * format.channels * bytesPerSample));
  const endOffset = Math.max(format.dataOffset, format.dataOffset + format.dataLength - trimBytes);
  const usableLength = endOffset - format.dataOffset;

  if (usableLength < 4) return { rms: 0, dbfs: -96 };

  let sumSq = 0;
  let sampleCount = 0;

  for (let i = format.dataOffset; i + 1 < endOffset; i += 2) {
    let sample = wavData[i] | (wavData[i + 1] << 8);
    if (sample >= 0x8000) sample -= 0x10000;
    sumSq += sample * sample;
    sampleCount++;
  }

  if (sampleCount < 10) return { rms: 0, dbfs: -96 };

  const rms = Math.sqrt(sumSq / sampleCount);
  const dbfs = rms > 0 ? 20 * Math.log10(rms / 32768) : -96;
  return { rms, dbfs };
}

function computeExactShotGainAdjustments(dbfsValues: number[], toleranceDb = 0.8): {
  targetDbfs: number;
  adjustmentsDb: number[];
  outlierIndices: number[];
} {
  const valid = dbfsValues.filter((value) => Number.isFinite(value) && value > -90).sort((a, b) => a - b);
  if (valid.length <= 1) {
    return {
      targetDbfs: valid[0] ?? -96,
      adjustmentsDb: new Array(dbfsValues.length).fill(0),
      outlierIndices: [],
    };
  }

  const middle = Math.floor(valid.length / 2);
  const targetDbfs = valid.length % 2 === 0
    ? (valid[middle - 1] + valid[middle]) / 2
    : valid[middle];

  const adjustmentsDb: number[] = [];
  const outlierIndices: number[] = [];

  for (let i = 0; i < dbfsValues.length; i++) {
    const dbfs = dbfsValues[i];
    if (!Number.isFinite(dbfs) || dbfs <= -90) {
      adjustmentsDb.push(0);
      continue;
    }

    const diff = targetDbfs - dbfs;
    if (Math.abs(diff) <= toleranceDb) {
      adjustmentsDb.push(0);
      continue;
    }

    const clamped = Math.max(-4, Math.min(4, Math.round(diff * 10) / 10));
    adjustmentsDb.push(clamped);
    outlierIndices.push(i);
  }

  return { targetDbfs, adjustmentsDb, outlierIndices };
}

function applyGainToLinear16Wav(wavData: Uint8Array, gainDb: number): Uint8Array {
  if (Math.abs(gainDb) < 0.05) return wavData;

  const format = parseLinear16WavFormat(wavData);
  const output = wavData.slice();
  const gain = Math.pow(10, gainDb / 20);
  const dataEnd = format.dataOffset + format.dataLength;

  for (let i = format.dataOffset; i + 1 < dataEnd; i += 2) {
    let sample = output[i] | (output[i + 1] << 8);
    if (sample >= 0x8000) sample -= 0x10000;

    const boosted = Math.max(-32768, Math.min(32767, Math.round(sample * gain)));
    output[i] = boosted & 0xff;
    output[i + 1] = (boosted >> 8) & 0xff;
  }

  return output;
}

function buildLinear16Wav(payload: Uint8Array, sampleRate: number, channels: number, bitsPerSample: number): Uint8Array {
  const header = new Uint8Array(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  writeAscii(header, 0, "RIFF");
  writeUint32Le(header, 4, 36 + payload.length);
  writeAscii(header, 8, "WAVE");
  writeAscii(header, 12, "fmt ");
  writeUint32Le(header, 16, 16);
  writeUint16Le(header, 20, 1);
  writeUint16Le(header, 22, channels);
  writeUint32Le(header, 24, sampleRate);
  writeUint32Le(header, 28, byteRate);
  writeUint16Le(header, 32, blockAlign);
  writeUint16Le(header, 34, bitsPerSample);
  writeAscii(header, 36, "data");
  writeUint32Le(header, 40, payload.length);

  const output = new Uint8Array(header.length + payload.length);
  output.set(header, 0);
  output.set(payload, header.length);
  return output;
}

function concatLinear16Wavs(wavChunks: Uint8Array[]): { wav: Uint8Array; durationSeconds: number } {
  if (wavChunks.length === 0) {
    return { wav: buildLinear16Wav(new Uint8Array(0), 24000, 1, 16), durationSeconds: 0 };
  }

  const firstFormat = parseLinear16WavFormat(wavChunks[0]);
  const payloads = wavChunks.map((chunk, index) => {
    const format = parseLinear16WavFormat(chunk);
    if (
      format.sampleRate !== firstFormat.sampleRate ||
      format.channels !== firstFormat.channels ||
      format.bitsPerSample !== firstFormat.bitsPerSample
    ) {
      throw new Error(`Audio exact invalide — format WAV incohérent au segment ${index + 1}.`);
    }
    return chunk.slice(format.dataOffset, format.dataOffset + format.dataLength);
  });

  const totalPayloadLength = payloads.reduce((sum, payload) => sum + payload.length, 0);
  const combinedPayload = new Uint8Array(totalPayloadLength);
  let offset = 0;
  for (const payload of payloads) {
    combinedPayload.set(payload, offset);
    offset += payload.length;
  }

  const wav = buildLinear16Wav(
    combinedPayload,
    firstFormat.sampleRate,
    firstFormat.channels,
    firstFormat.bitsPerSample
  );
  const bytesPerSecond = firstFormat.sampleRate * firstFormat.channels * (firstFormat.bitsPerSample / 8);

  return { wav, durationSeconds: combinedPayload.length / bytesPerSecond };
}

function endsWithSentenceTerminal(text: string): boolean {
  return /[.!?]["')\]]*\s*$/.test(text.trim());
}

/**
 * Build SSML with <mark> tags between shot sentences for precise timepointing.
 * Returns SSML string with marks named "s_0", "s_1", etc.
 */
function buildMarkedSsml(
  shotSentences: { id: string; text: string; isNewScene?: boolean }[],
  pauseAfterSentences: number,
  pauseBetweenParagraphs: number,
  sentenceStartBoost: number,
  sentenceEndSlow: number,
  commaPauseMs = 0,
  dynamicPauseEnabled = false,
  dynamicPauseVariation = 0,
  emphasisBoost = 0
): string {
  const parts = shotSentences.map((shot, idx) => {
    const mark = `<mark name="${shot.id}"/>`;
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

  // Join with sentence pauses (with continuity and scene/paragraph awareness)
  const joined = parts.map((p, i) => {
    if (i < parts.length - 1) {
      // Use paragraph pause at scene boundaries, sentence pause otherwise
      const nextShot = shotSentences[i + 1];
      const isSceneBreak = nextShot?.isNewScene === true;
      const endsSentence = endsWithSentenceTerminal(p.text);
      const basePause = isSceneBreak ? pauseBetweenParagraphs : pauseAfterSentences;

      if (!isSceneBreak && !endsSentence) {
        return `${p.ssml}<break time="${SHOT_BOUNDARY_BREAK_MS}ms"/>`;
      }

      if (basePause > 0) {
        let pause = jitterPause(basePause, dynamicPauseVariation, dynamicPauseEnabled);
        // Reduce pause for prosodic continuity (only for non-scene-breaks)
        if (!isSceneBreak && shouldReducePause(p.text, parts[i + 1].text)) {
          pause = Math.max(50, Math.round(pause * CONTINUITY_PAUSE_RATIO));
        }
        return `${p.ssml}<break time="${pause}ms"/>`;
      }
    }
    return p.ssml;
  }).join(" ");

  const endMark = `<mark name="__end"/>`;
  return `<speak>${joined}${endMark}</speak>`;
}

function computeShotBoundaryPauseMs(
  currentText: string,
  nextShot: { text: string; isNewScene?: boolean } | undefined,
  pauseAfterSentences: number,
  pauseBetweenParagraphs: number,
  dynamicPauseEnabled: boolean,
  dynamicPauseVariation: number
): number {
  if (!nextShot) return 0;

  const isSceneBreak = nextShot.isNewScene === true;
  const endsSentence = endsWithSentenceTerminal(currentText);
  const basePause = isSceneBreak ? pauseBetweenParagraphs : pauseAfterSentences;

  if (!isSceneBreak && !endsSentence) {
    return SHOT_BOUNDARY_BREAK_MS;
  }

  if (basePause <= 0) return 0;

  let pause = jitterPause(basePause, dynamicPauseVariation, dynamicPauseEnabled);
  if (!isSceneBreak && shouldReducePause(currentText, nextShot.text)) {
    pause = Math.max(50, Math.round(pause * CONTINUITY_PAUSE_RATIO));
  }

  return pause;
}

function buildExactShotSsml(
  shot: { text: string; isNewScene?: boolean },
  nextShot: { text: string; isNewScene?: boolean } | undefined,
  pauseAfterSentences: number,
  pauseBetweenParagraphs: number,
  sentenceStartBoost: number,
  sentenceEndSlow: number,
  commaPauseMs = 0,
  dynamicPauseEnabled = false,
  dynamicPauseVariation = 0,
  emphasisBoost = 0
): { ssml: string; pauseMs: number } {
  let processed = escapeXml(shot.text.trim());

  if (sentenceStartBoost > 0 || sentenceEndSlow > 0) {
    processed = processSentenceProsody(processed, sentenceStartBoost, sentenceEndSlow);
  }

  processed = applyEmphasis(processed, emphasisBoost);
  if (commaPauseMs > 0) {
    processed = injectCommaPauses(processed, commaPauseMs);
  }

  const pauseMs = computeShotBoundaryPauseMs(
    shot.text,
    nextShot,
    pauseAfterSentences,
    pauseBetweenParagraphs,
    dynamicPauseEnabled,
    dynamicPauseVariation
  );

  const breakTag = pauseMs > 0 ? `<break time="${pauseMs}ms"/>` : "";
  return { ssml: `<speak>${processed}${breakTag}</speak>`, pauseMs };
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
  maxSsmlBytes: number;
}

const ssmlByteLength = (value: string) => new TextEncoder().encode(value).length;

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

  const fits = (input: string) => ssmlByteLength(buildSsml(input)) <= options.maxSsmlBytes;
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (!trimmed) return;
    chunks.push(buildSsml(trimmed));
    current = "";
  };

  const pushOversizedWordSafely = (word: string) => {
    const maxSliceLength = Math.max(20, Math.floor(options.maxSsmlBytes / 4));
    const safeSlices = word.match(new RegExp(`.{1,${maxSliceLength}}`, "g")) ?? [word];

    for (let i = 0; i < safeSlices.length; i++) {
      const slice = safeSlices[i];
      if (fits(slice)) {
        if (i === safeSlices.length - 1) {
          current = slice;
        } else {
          chunks.push(buildSsml(slice));
        }
        continue;
      }

      const chars = [...slice];
      let partial = "";
      for (const char of chars) {
        const candidate = partial + char;
        if (!partial || fits(candidate)) {
          partial = candidate;
        } else {
          chunks.push(buildSsml(partial));
          partial = char;
        }
      }

      if (partial) {
        if (i === safeSlices.length - 1) {
          current = partial;
        } else {
          chunks.push(buildSsml(partial));
        }
      }
    }
  };

  const addUnit = (unit: string, separator: string) => {
    const trimmedUnit = unit.trim();
    if (!trimmedUnit) return;

    const candidate = current ? `${current}${separator}${trimmedUnit}` : trimmedUnit;
    if (fits(candidate)) {
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
      if (fits(partialCandidate)) {
        partial = partialCandidate;
        continue;
      }

      if (partial) {
        chunks.push(buildSsml(partial));
        partial = "";
      }

      if (fits(word)) {
        partial = word;
      } else {
        pushOversizedWordSafely(word);
      }
    }

    current = partial.trim() || current;
  };

  const paragraphs = rawText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  for (const paragraph of paragraphs) {
    const paragraphCandidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (fits(paragraphCandidate)) {
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
 * Marks are named with shot IDs (UUIDs or _missing_N).
 * Returns array of {ssml, shotIds} where shotIds tracks which shot IDs are in each chunk.
 */
function chunkMarkedSsml(
  ssml: string,
  maxChars: number
): { ssml: string; shotIds: string[] }[] {
  const inner = ssml.replace(/^<speak>/, "").replace(/<\/speak>$/, "");

  // Find all marks (shot IDs or __end)
  const markRegex = /<mark name="([^"]+)"\/>/g;
  const allMarks: { name: string; pos: number }[] = [];
  let segMatch: RegExpExecArray | null;
  while ((segMatch = markRegex.exec(inner)) !== null) {
    allMarks.push({ name: segMatch[1], pos: segMatch.index });
  }

  // Build segments: each is mark + text until next mark
  const segmentPairs: { markName: string; text: string; isShotMark: boolean }[] = [];
  for (let i = 0; i < allMarks.length; i++) {
    const markTag = `<mark name="${allMarks[i].name}"/>`;
    const startAfterMark = allMarks[i].pos + markTag.length;
    const text = inner.slice(startAfterMark, i + 1 < allMarks.length ? allMarks[i + 1].pos : inner.length);
    const isShotMark = allMarks[i].name !== "__end" && allMarks[i].name !== "__chunk_end";
    segmentPairs.push({ markName: allMarks[i].name, text, isShotMark });
  }

  // Group segments into chunks under maxChars
  const chunks: { ssml: string; shotIds: string[] }[] = [];
  let currentParts: string[] = [];
  let currentIds: string[] = [];
  let currentLen = "<speak></speak>".length;

  for (const seg of segmentPairs) {
    const segText = `<mark name="${seg.markName}"/>${seg.text}`;
    if (currentLen + segText.length > maxChars && currentParts.length > 0) {
      currentParts.push(`<mark name="__chunk_end"/>`);
      chunks.push({
        ssml: `<speak>${currentParts.join("")}</speak>`,
        shotIds: currentIds,
      });
      currentParts = [];
      currentIds = [];
      currentLen = "<speak></speak>".length;
    }
    currentParts.push(segText);
    if (seg.isShotMark) currentIds.push(seg.markName);
    currentLen += segText.length;
  }

  if (currentParts.length > 0) {
    chunks.push({
      ssml: `<speak>${currentParts.join("")}</speak>`,
      shotIds: currentIds,
    });
  }

  return chunks;
}

/**
 * Parse actual MP3 duration by reading frame headers.
 * Google TTS outputs MPEG1 Layer 3 CBR — we read the first valid frame
 * to get bitrate, then compute duration = totalBits / bitrate.
 * This is critical for accurate cumulativeOffset across chunks.
 */
function parseMp3Duration(data: Uint8Array): number {
  // MPEG1 Layer 3 bitrate table (index 0 and 15 are invalid)
  const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0];
  // MPEG2/2.5 Layer 3 bitrate table
  const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const MPEG2_SAMPLE_RATES = [22050, 24000, 16000, 0];
  const MPEG25_SAMPLE_RATES = [11025, 12000, 8000, 0];

  // Scan for first valid frame sync (0xFF followed by 0xE0+ mask)
  const scanLimit = Math.min(data.length - 4, 16384);
  for (let i = 0; i < scanLimit; i++) {
    if (data[i] !== 0xFF || (data[i + 1] & 0xE0) !== 0xE0) continue;

    const versionBits = (data[i + 1] >> 3) & 0x03;   // 00=2.5, 01=reserved, 10=2, 11=1
    const layerBits = (data[i + 1] >> 1) & 0x03;       // 01=Layer3
    const bitrateIndex = (data[i + 2] >> 4) & 0x0F;
    const sampleRateIndex = (data[i + 2] >> 2) & 0x03;

    if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) continue;
    if (layerBits === 0x00) continue; // reserved layer

    let bitrateKbps: number;
    let sampleRate: number;

    if (versionBits === 0x03 && layerBits === 0x01) {
      // MPEG1 Layer 3
      bitrateKbps = MPEG1_L3_BITRATES[bitrateIndex];
      sampleRate = MPEG1_SAMPLE_RATES[sampleRateIndex];
    } else if ((versionBits === 0x02 || versionBits === 0x00) && layerBits === 0x01) {
      // MPEG2 or MPEG2.5 Layer 3
      bitrateKbps = MPEG2_L3_BITRATES[bitrateIndex];
      sampleRate = versionBits === 0x02
        ? MPEG2_SAMPLE_RATES[sampleRateIndex]
        : MPEG25_SAMPLE_RATES[sampleRateIndex];
    } else {
      continue;
    }

    if (bitrateKbps > 0 && sampleRate > 0) {
      // For CBR: duration = (dataSize * 8) / (bitrate * 1000)
      // Subtract header offset to only count audio data
      const audioBytes = data.length - i;
      const duration = (audioBytes * 8) / (bitrateKbps * 1000);
      return duration;
    }
  }

  // Fallback: assume 32kbps (Google TTS typical for low quality MP3)
  console.warn("MP3 frame header not found, falling back to byte estimation");
  return (data.length * 8) / 32000;
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

    // Chirp-HD, Studio and Polyglot voices do not support pitch, volumeGainDb, effectsProfileId, or <emphasis> tags
    const isRestrictedVoice = resolvedVoiceName && /Chirp|Studio|Polyglot/i.test(resolvedVoiceName);
    const stripEmphasisTags = (ssml: string) => ssml.replace(/<\/?emphasis[^>]*>/g, "");
    const audioConfig: Record<string, unknown> = { audioEncoding: "MP3", speakingRate };
    if (!isRestrictedVoice) {
      if (pitch !== 0) audioConfig.pitch = pitch;
      if (volumeGainDb !== 0) audioConfig.volumeGainDb = volumeGainDb;
      if (effectsProfileId) audioConfig.effectsProfileId = [effectsProfileId];
    }

    if (mode === "preview") {
      let ssmlText = textToSsml(text, pauseBetweenParagraphs, pauseAfterSentences, sentenceStartBoost, sentenceEndSlow, pauseAfterComma, dynamicPauseEnabled, dynamicPauseVariation, mod.emphasisBoost);
      if (isRestrictedVoice) ssmlText = stripEmphasisTags(ssmlText);
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

    // ── Strict shot-sync validation ──
    // Fetch current shots from DB to validate alignment (must match frontend sort: scene_order → shot_order)
    const { data: dbShots, error: shotsError } = await supabaseAdmin
      .from("shots")
      .select("id, shot_order, scene_id")
      .eq("project_id", projectId);

    if (shotsError) {
      console.error("Failed to fetch project shots:", shotsError);
      return new Response(
        JSON.stringify({ error: "Impossible de vérifier les shots du projet." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch scenes to get scene_order for proper sorting
    const { data: dbScenes } = await supabaseAdmin
      .from("scenes")
      .select("id, scene_order")
      .eq("project_id", projectId);

    const sceneOrderMap = new Map((dbScenes ?? []).map((s: any) => [s.id, s.scene_order as number]));
    const sortedShots = (dbShots ?? []).sort((a: any, b: any) => {
      const oa = sceneOrderMap.get(a.scene_id) ?? 0;
      const ob = sceneOrderMap.get(b.scene_id) ?? 0;
      if (oa !== ob) return oa - ob;
      return a.shot_order - b.shot_order;
    });

    const expectedShotIds = sortedShots.map((s: any) => s.id);

    // Neural2, Standard, Wavenet and Journey voices support <mark> SSML tags
    const supportsMarks = !resolvedVoiceName || /Neural2|Standard|Wavenet|Journey/i.test(resolvedVoiceName);

    // STRICT: shot_marked mode REQUIRES mark-compatible voice — no silent fallback
    if (syncMode === "shot_marked" && !supportsMarks) {
      return new Response(
        JSON.stringify({
          error: `La voix "${resolvedVoiceName}" ne supporte pas les balises <mark> requises pour la synchronisation exacte. Utilisez une voix Neural2, Standard, Wavenet ou Journey.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const useMarkedMode = syncMode === "shot_marked" && shotSentences && shotSentences.length > 0 && supportsMarks;

    // STRICT: validate shotSentences match DB shots exactly before generating
    if (useMarkedMode) {
      const sentenceValidation = validateExactShotSentences(expectedShotIds, shotSentences!);
      if (!sentenceValidation.ok) {
        console.error("Shot-sentence validation failed:", sentenceValidation.errors);
        return new Response(
          JSON.stringify({
            error: `Synchronisation bloquée — ${sentenceValidation.errors[0]}`,
            validationErrors: sentenceValidation.errors,
            missingIds: sentenceValidation.missingIds,
            unexpectedIds: sentenceValidation.unexpectedIds,
            placeholderIds: sentenceValidation.placeholderIds,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`Shot-sentence validation passed: ${expectedShotIds.length} shots aligned`);
    }
    const MAX_CHARS = 4800;

    let audioBuffers: Uint8Array[] = [];
    let allTimepoints: { shotIndex: number; timeSeconds: number; shotId: string }[] = [];
    let cumulativeOffset = 0;

    if (useMarkedMode) {
      // ── Marked mode: batched SSML with <mark> tags in LINEAR16 for sample-accurate sync ──
      // This uses ~5-6 API calls instead of 162 individual per-shot calls.
      console.log(`Generating marked LINEAR16 TTS with ${shotSentences!.length} shots`);

      const sceneBreakIndices = shotSentences!
        .map((s, i) => s.isNewScene ? i : -1)
        .filter(i => i >= 0);
      console.log(`Scene/paragraph breaks at indices: [${sceneBreakIndices.join(",")}] (para pause=${pauseBetweenParagraphs}ms, sent pause=${pauseAfterSentences}ms)`);

      // Build full marked SSML
      let fullMarkedSsml = buildMarkedSsml(
        shotSentences!,
        pauseAfterSentences,
        pauseBetweenParagraphs,
        sentenceStartBoost,
        sentenceEndSlow,
        pauseAfterComma,
        dynamicPauseEnabled,
        dynamicPauseVariation,
        mod.emphasisBoost
      );
      if (isRestrictedVoice) fullMarkedSsml = stripEmphasisTags(fullMarkedSsml);

      // Apply volume equalization wrapper
      if (!isRestrictedVoice) {
        fullMarkedSsml = applyVolumeEqualization(fullMarkedSsml, 0);
      }

      // Chunk the marked SSML to stay under Google API limits
      const markedChunks = chunkMarkedSsml(fullMarkedSsml, MAX_CHARS);
      console.log(`Split into ${markedChunks.length} marked chunks for LINEAR16 render`);

      const linear16Config = { ...audioConfig, audioEncoding: "LINEAR16" };
      const chunkWavs: Uint8Array[] = [];
      const rawChunkTimepoints: { chunkIndex: number; shotId: string; timeSeconds: number }[] = [];
      const MARKED_BATCH_SIZE = 3;

      // Generate chunks in small parallel batches to reduce wall time without overloading the runtime
      for (let start = 0; start < markedChunks.length; start += MARKED_BATCH_SIZE) {
        const batch = markedChunks.slice(start, start + MARKED_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (chunk, batchIndex) => {
            const result = await callGoogleTTS(
              chunk.ssml,
              GOOGLE_TTS_API_KEY,
              voice,
              linear16Config,
              true,
              true
            );

            const wavData = decodeBase64Audio(result.audioContent);
            return {
              chunkIndex: start + batchIndex,
              wavData,
              timepoints: result.timepoints ?? [],
              shotCount: chunk.shotIds.length,
            };
          })
        );

        batchResults.sort((a, b) => a.chunkIndex - b.chunkIndex);
        for (const batchResult of batchResults) {
          chunkWavs.push(batchResult.wavData);
          for (const tp of batchResult.timepoints) {
            const markName = tp.markName;
            if (markName === "__end" || markName === "__chunk_end") continue;
            rawChunkTimepoints.push({
              chunkIndex: batchResult.chunkIndex,
              shotId: markName,
              timeSeconds: tp.timeSeconds,
            });
          }
          console.log(`Rendered marked chunk ${batchResult.chunkIndex + 1}/${markedChunks.length} (${batchResult.shotCount} shots, timepoints=${batchResult.timepoints.length})`);
        }
      }

      // Measure per-chunk volume for cross-chunk normalization
      const chunkDbfs = chunkWavs.map((wav) => computeLinear16WavRms(wav, 0.1).dbfs);
      const volumeAnalysis = computeExactShotGainAdjustments(chunkDbfs, 0.8);
      console.log(`Chunk volume analysis: dBFS=[${chunkDbfs.map(d => d.toFixed(1)).join(",")}], target=${volumeAnalysis.targetDbfs.toFixed(1)}dB, adjustments=[${volumeAnalysis.adjustmentsDb.map(v => v.toFixed(1)).join(",")}]`);

      // Apply gain normalization per chunk
      const normalizedChunkWavs = chunkWavs.map((wav, index) =>
        applyGainToLinear16Wav(wav, volumeAnalysis.adjustmentsDb[index])
      );

      // Compute chunk durations for offset calculation
      const chunkDurations = normalizedChunkWavs.map((wav) => getLinear16WavDuration(wav));
      const chunkStartOffsets: number[] = [];
      let runningOffset = 0;
      for (const dur of chunkDurations) {
        chunkStartOffsets.push(runningOffset);
        runningOffset += dur;
      }

      // Build final timepoints with absolute offsets
      for (const rtp of rawChunkTimepoints) {
        const absoluteTime = chunkStartOffsets[rtp.chunkIndex] + rtp.timeSeconds;
        const shotIdx = shotSentences!.findIndex((s) => s.id === rtp.shotId);
        allTimepoints.push({
          shotIndex: shotIdx >= 0 ? shotIdx : -1,
          timeSeconds: absoluteTime,
          shotId: rtp.shotId,
        });
      }

      // Sort timepoints by time to ensure order
      allTimepoints.sort((a, b) => a.timeSeconds - b.timeSeconds);

      // Concatenate all WAV chunks sample-accurately
      const exactCombinedAudio = concatLinear16Wavs(normalizedChunkWavs);
      audioBuffers = [exactCombinedAudio.wav];
      cumulativeOffset = exactCombinedAudio.durationSeconds;

      console.log(`Marked sync locked: ${allTimepoints.length} timepoints, totalDuration=${cumulativeOffset.toFixed(3)}s`);

      // ── Post-generation strict validation ──
      const postValidation = validateExactShotTimepoints(expectedShotIds, allTimepoints);
      if (!postValidation.ok) {
        console.error("Post-generation timepoint validation FAILED:", postValidation.errors);
        // Log which shots are missing for debugging
        if (postValidation.missingIds.length > 0) {
          console.error(`Missing shot IDs: ${postValidation.missingIds.map(id => id.slice(0, 8)).join(", ")}`);
        }
        return new Response(
          JSON.stringify({
            error: `Génération audio terminée mais synchronisation incomplète — ${postValidation.errors[0]}. L'audio n'a pas été sauvegardé. Réessayez.`,
            validationErrors: postValidation.errors,
            missingIds: postValidation.missingIds,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("Post-generation timepoint validation PASSED ✓");
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
            maxSsmlBytes: 4500,
          });

      console.log(`Split into ${chunks.length} legacy chunks`);

      // ── Legacy volume normalization: LINEAR16 pre-pass ──
      let legacyGainDb: number[] = new Array(chunks.length).fill(0);
      if (chunks.length > 1) {
        console.log(`Legacy volume pre-pass: generating ${chunks.length} chunks as LINEAR16…`);
        const pcmChunks: Uint8Array[] = [];
        for (let ci = 0; ci < chunks.length; ci++) {
          let chunk = chunks[ci];
          if (!isRestrictedVoice && chunk.startsWith("<speak>")) {
            chunk = applyVolumeEqualization(chunk, 0);
          }
          if (isRestrictedVoice) chunk = stripEmphasisTags(chunk);
          const linear16Config = { ...audioConfig, audioEncoding: "LINEAR16" };
          try {
            const result = await callGoogleTTS(chunk, GOOGLE_TTS_API_KEY, voice, linear16Config, chunk.startsWith("<speak>"));
            pcmChunks.push(decodeBase64Audio(result.audioContent));
          } catch {
            pcmChunks.push(new Uint8Array(0));
          }
        }
        const analysis = computePcmGainAdjustments(pcmChunks, 1.5);
        console.log(`Legacy PCM analysis: dBFS=[${analysis.dbfsValues.map(d => d.toFixed(1)).join(",")}], mean=${analysis.meanDbfs.toFixed(1)}dB, outliers=[${analysis.outlierIndices.join(",")}]`);
        legacyGainDb = analysis.adjustmentsDb;
      }

      // ── Generate final MP3 chunks with corrections ──
      for (let ci = 0; ci < chunks.length; ci++) {
        let chunk = chunks[ci];
        if (!isRestrictedVoice && chunk.startsWith("<speak>")) {
          chunk = applyVolumeEqualization(chunk, legacyGainDb[ci]);
        }
        if (isRestrictedVoice) chunk = stripEmphasisTags(chunk);
        const chunkIsSsml = chunk.startsWith("<speak>");
        const suffix = legacyGainDb[ci] !== 0 ? ` (gainOffset=${legacyGainDb[ci].toFixed(1)}dB)` : "";
        console.log(`Legacy chunk ${ci + 1}${suffix}: ssml=${chunkIsSsml}, len=${chunk.length}`);

        try {
          const result = await callGoogleTTS(chunk, GOOGLE_TTS_API_KEY, voice, audioConfig, chunkIsSsml);
          const raw = decodeBase64Audio(result.audioContent);
          audioBuffers.push(raw);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (chunkIsSsml && message.includes("Invalid SSML")) {
            console.warn(`Legacy chunk ${ci + 1} invalid SSML, retrying as plain text fallback`);
            const fallbackText = ssmlToPlainText(chunk);
            const fallbackResult = await callGoogleTTS(fallbackText, GOOGLE_TTS_API_KEY, voice, audioConfig, false);
            const raw = decodeBase64Audio(fallbackResult.audioContent);
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
    const exactAudioFormat = allTimepoints.length > 0 ? "wav" : "mp3";
    const sanitized = body.customFileName
      ? body.customFileName.replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "_").slice(0, 80)
      : null;
    const fileName = sanitized ? `${sanitized}.${exactAudioFormat}` : `vo_${timestamp}.${exactAudioFormat}`;
    const filePath = `${user.id}/${projectId}/${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from("vo-audio")
      .upload(filePath, combined, {
        contentType: exactAudioFormat === "wav" ? "audio/wav" : "audio/mpeg",
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
