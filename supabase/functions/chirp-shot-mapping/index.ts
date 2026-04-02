import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Types ──

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface ShotSource {
  shotId: string;
  text: string;
}

interface ShotTimeline {
  shotId: string;
  startTime: number;
  endTime: number;
  displayDuration: number;
  alignmentConfidence: number; // 0–1
  matchedWordCount: number;
  expectedWordCount: number;
  status: "exact" | "partial" | "missing";
}

interface ShotMappingResult {
  shotTimelines: ShotTimeline[];
  totalDuration: number;
  averageConfidence: number;
  unmappedWordCount: number;
  createdAt: string;
}

// ── Number-to-French-words converter ──

const UNITS = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function numberToFrench(n: number): string {
  if (n < 0) return "moins " + numberToFrench(-n);
  if (n === 0) return "zero";
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 1 && t !== 8) return TENS[t] + " et un";
    return u === 0 ? TENS[t] : TENS[t] + " " + UNITS[u];
  }
  if (n < 80) {
    // 70-79: soixante-dix, soixante et onze, ...
    const u = n - 60;
    if (u === 11) return "soixante et onze";
    return "soixante " + UNITS[u];
  }
  if (n < 100) {
    // 80-99: quatre-vingt, quatre-vingt-un, quatre-vingt-dix, quatre-vingt-onze, ...
    const u = n - 80;
    if (u === 0) return "quatre vingts";
    if (u < 20) return "quatre vingt " + UNITS[u];
    return "quatre vingt " + UNITS[u]; // shouldn't happen for valid n<100
  }
  if (n < 200) {
    const r = n - 100;
    return r === 0 ? "cent" : "cent " + numberToFrench(r);
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const prefix = UNITS[h] + " cent";
    return r === 0 ? prefix + "s" : prefix + " " + numberToFrench(r);
  }
  if (n < 2000) {
    const r = n - 1000;
    return r === 0 ? "mille" : "mille " + numberToFrench(r);
  }
  if (n < 1000000) {
    const t = Math.floor(n / 1000);
    const r = n % 1000;
    const prefix = numberToFrench(t) + " mille";
    return r === 0 ? prefix : prefix + " " + numberToFrench(r);
  }
  // For very large numbers, just return digit-by-digit
  return String(n).split("").map(d => UNITS[parseInt(d)] || d).join(" ");
}

/**
 * Expand a token containing digits into French words.
 * Handles pure numbers (959 → neuf cent cinquante neuf)
 * and alphanumeric (F40 → F quarante).
 */
function expandNumberToken(token: string): string[] {
  // Pure number
  if (/^\d+$/.test(token)) {
    const n = parseInt(token, 10);
    if (n <= 999999) {
      return numberToFrench(n).split(/[\s-]+/);
    }
    return [token];
  }
  // Mixed alphanumeric: split into letter/digit groups, expand digit groups
  const parts = token.match(/[a-zA-ZÀ-ÿ]+|\d+/g);
  if (!parts) return [token];
  const result: string[] = [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) {
      const n = parseInt(p, 10);
      if (n <= 999999) {
        result.push(...numberToFrench(n).split(/[\s-]+/));
      } else {
        result.push(p);
      }
    } else {
      result.push(p);
    }
  }
  return result;
}

// ── Normalisation ──

function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents for comparison
    .replace(/[^a-z0-9]/g, ""); // strip punctuation & special chars
}

function tokenize(text: string): string[] {
  const raw = text
    // Normalize all apostrophe variants to simple quote then split on it
    .replace(/[\u2019\u2018\u0060\u00B4]/g, "'")
    // Split hyphenated words into separate tokens (Et-surtout → Et surtout)
    .replace(/-/g, " ")
    // Normalize spaces around punctuation
    .replace(/\s*([,;:!?.])\s*/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Expand numbers to French words for matching with Whisper transcription
  const expanded: string[] = [];
  for (const t of raw) {
    if (/\d/.test(t)) {
      expanded.push(...expandNumberToken(t));
    } else {
      expanded.push(t);
    }
  }
  return expanded;
}

// ── Fuzzy matching ──

function wordsMatch(source: string, whisper: string): boolean {
  return normalizeWord(source) === normalizeWord(whisper);
}

/**
 * Find the best starting position in whisperWords for a sequence of sourceWords.
 * Tolerant sequential matching — allows up to 2 skipped/mismatched words
 * to handle minor transcription differences from Whisper.
 * Returns { startIdx, endIdx, matchCount } or null.
 */
function findBestWindow(
  sourceWords: string[],
  whisperWords: WordTimestamp[],
  searchStart: number
): { startIdx: number; endIdx: number; matchCount: number } | null {
  if (sourceWords.length === 0) return null;

  const windowSize = sourceWords.length;
  // Very wide search window to handle cursor drift
  const searchEnd = Math.min(
    whisperWords.length,
    searchStart + windowSize * 8 + 80
  );

  let bestStart = -1;
  let bestMatchCount = 0;
  let bestEndIdx = -1;

  for (let i = searchStart; i <= searchEnd - 1; i++) {
    // Try matching with tolerance for skips
    let sIdx = 0; // source index
    let wIdx = i; // whisper index
    let matchCount = 0;
    let skips = 0;
    const MAX_SKIPS = 3;

    while (sIdx < sourceWords.length && wIdx < whisperWords.length && wIdx < searchEnd) {
      if (wordsMatch(sourceWords[sIdx], whisperWords[wIdx].word)) {
        matchCount++;
        sIdx++;
        wIdx++;
        skips = 0; // reset skip counter on successful match
      } else {
        skips++;
        if (skips > MAX_SKIPS) break;
        // Try advancing whisper index (Whisper has extra word)
        // or source index (Whisper missed a word)
        // Peek ahead to decide which to skip
        const whisperSkipMatch = wIdx + 1 < whisperWords.length &&
          wordsMatch(sourceWords[sIdx], whisperWords[wIdx + 1].word);
        const sourceSkipMatch = sIdx + 1 < sourceWords.length &&
          wordsMatch(sourceWords[sIdx + 1], whisperWords[wIdx].word);

        if (whisperSkipMatch) {
          wIdx++; // skip extra whisper word
        } else if (sourceSkipMatch) {
          sIdx++; // skip missing source word
        } else {
          // Skip both
          sIdx++;
          wIdx++;
        }
      }
    }

    if (matchCount > bestMatchCount && matchCount >= Math.max(1, Math.floor(sourceWords.length * 0.3))) {
      bestMatchCount = matchCount;
      bestStart = i;
      bestEndIdx = wIdx - 1;
    }

    // Perfect match — stop early
    if (bestMatchCount === sourceWords.length) break;
  }

  if (bestStart < 0 || bestMatchCount === 0) return null;

  return { startIdx: bestStart, endIdx: bestEndIdx, matchCount: bestMatchCount };
}

/**
 * Fallback: anchor search using first + last word of the source.
 * Scans a wider range to find the shot when sequential matching fails.
 */
function anchorFallbackSearch(
  sourceWords: string[],
  whisperWords: WordTimestamp[],
  searchStart: number
): { startIdx: number; endIdx: number; matchCount: number } | null {
  if (sourceWords.length < 2) return null;

  const firstWord = sourceWords[0];
  const lastWord = sourceWords[sourceWords.length - 1];
  const maxSearch = Math.min(whisperWords.length, searchStart + sourceWords.length * 10 + 60);

  for (let i = searchStart; i < maxSearch; i++) {
    if (!wordsMatch(firstWord, whisperWords[i].word)) continue;

    // Found first word anchor — now look for last word within expected range
    const expectedEnd = i + sourceWords.length;
    const scanEnd = Math.min(whisperWords.length, expectedEnd + Math.max(10, sourceWords.length));

    for (let j = Math.max(i + 1, expectedEnd - Math.max(5, sourceWords.length)); j < scanEnd; j++) {
      if (!wordsMatch(lastWord, whisperWords[j].word)) continue;

      // Count actual matches in this range
      let matchCount = 0;
      let sIdx = 0;
      for (let wIdx = i; wIdx <= j && sIdx < sourceWords.length; wIdx++) {
        if (wordsMatch(sourceWords[sIdx], whisperWords[wIdx].word)) {
          matchCount++;
          sIdx++;
        }
      }

      if (matchCount >= Math.max(2, Math.floor(sourceWords.length * 0.3))) {
        return { startIdx: i, endIdx: j, matchCount };
      }
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Non autorisé" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await anonClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Non autorisé" }, 401);

    // ── Input ──
    const body = await req.json();
    const { alignmentRun, shots, projectId, audioHistoryId } = body as {
      alignmentRun?: {
        words: WordTimestamp[];
        audioDuration: number;
        transcript: string;
      };
      shots?: ShotSource[];
      projectId?: string;
      audioHistoryId?: string;
    };

    if (!alignmentRun || !Array.isArray(alignmentRun.words)) {
      return jsonResponse({ error: "Le champ 'alignmentRun' est requis." }, 400);
    }
    if (!shots || !Array.isArray(shots) || shots.length === 0) {
      return jsonResponse({ error: "Le champ 'shots' est requis." }, 400);
    }
    if (!projectId) {
      return jsonResponse({ error: "Le champ 'projectId' est requis." }, 400);
    }

    const whisperWords = alignmentRun.words;
    const audioDuration = alignmentRun.audioDuration || 0;

    console.log(
      `[shot-mapping] Mapping ${shots.length} shots to ${whisperWords.length} whisper words`
    );

    // ── Map each shot ──
    let searchCursor = 0;
    const shotTimelines: ShotTimeline[] = [];

    for (const shot of shots) {
      const sourceTokens = tokenize(shot.text);
      if (sourceTokens.length === 0) {
        shotTimelines.push({
          shotId: shot.shotId,
          startTime: 0,
          endTime: 0,
          displayDuration: 0,
          alignmentConfidence: 0,
          matchedWordCount: 0,
          expectedWordCount: 0,
          status: "missing",
        });
        continue;
      }

      let window = findBestWindow(sourceTokens, whisperWords, searchCursor);

      // Fallback: anchor-based search if sequential matching failed
      if (!window || window.matchCount === 0) {
        window = anchorFallbackSearch(sourceTokens, whisperWords, searchCursor);
        if (window) {
          console.log(`[shot-mapping] Fallback anchor matched shot ${shot.shotId.slice(0, 8)} with ${window.matchCount}/${sourceTokens.length} words`);
        }
      }

      if (!window || window.matchCount === 0) {
        console.warn(`[shot-mapping] MISS shot ${shot.shotId.slice(0, 8)}: "${sourceTokens.slice(0, 5).join(" ")}…" (${sourceTokens.length} words)`);
        shotTimelines.push({
          shotId: shot.shotId,
          startTime: 0,
          endTime: 0,
          displayDuration: 0,
          alignmentConfidence: 0,
          matchedWordCount: 0,
          expectedWordCount: sourceTokens.length,
          status: "missing",
        });
        // Do NOT advance cursor on miss — let next shot search from same position
        continue;
      }

      const startTime = whisperWords[window.startIdx].start;
      const endTime = whisperWords[window.endIdx].end;
      const confidence = window.matchCount / sourceTokens.length;

      shotTimelines.push({
        shotId: shot.shotId,
        startTime,
        endTime,
        displayDuration: Math.max(0, endTime - startTime),
        alignmentConfidence: Math.round(confidence * 100) / 100,
        matchedWordCount: window.matchCount,
        expectedWordCount: sourceTokens.length,
        status: confidence === 1 ? "exact" : "partial",
      });

      // Advance cursor past this match
      searchCursor = window.endIdx + 1;
    }

    // ── Fill gaps: ensure contiguous coverage ──
    for (let i = 0; i < shotTimelines.length; i++) {
      const current = shotTimelines[i];
      if (current.status === "missing") continue;

      // Extend endTime to next shot's startTime to avoid gaps
      if (i < shotTimelines.length - 1) {
        const next = shotTimelines.slice(i + 1).find((s) => s.status !== "missing");
        if (next && next.startTime > current.endTime) {
          // Gap exists — extend current shot to fill it
          current.endTime = next.startTime;
          current.displayDuration = current.endTime - current.startTime;
        }
      } else {
        // Last shot: extend to audio duration
        if (audioDuration > current.endTime) {
          current.endTime = audioDuration;
          current.displayDuration = current.endTime - current.startTime;
        }
      }
    }

    // ── Stats ──
    const mappedShots = shotTimelines.filter((s) => s.status !== "missing");
    const averageConfidence =
      mappedShots.length > 0
        ? mappedShots.reduce((sum, s) => sum + s.alignmentConfidence, 0) /
          mappedShots.length
        : 0;

    const _mappedWordIndices = new Set<number>();
    // Count approximate unmapped words
    let unmappedWordCount = 0;
    if (searchCursor < whisperWords.length) {
      unmappedWordCount = whisperWords.length - searchCursor;
    }

    const result: ShotMappingResult = {
      shotTimelines,
      totalDuration: audioDuration,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      unmappedWordCount,
      createdAt: new Date().toISOString(),
    };

    console.log(
      `[shot-mapping] Result: ${mappedShots.length}/${shots.length} mapped, avg confidence=${result.averageConfidence}, unmapped words=${unmappedWordCount}`
    );

    // ── Persist shot_timepoints in vo_audio_history ──
    if (audioHistoryId) {
      const supabaseService = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Persist shots with exact OR partial match (≥30% confidence)
      const shotTimepoints = shotTimelines
        .filter((s) => s.status === "exact" || (s.status === "partial" && s.alignmentConfidence >= 0.3))
        .map((s, idx) => ({
          shotId: s.shotId,
          shotIndex: idx,
          timeSeconds: s.startTime,
        }));

      const { error: updateError } = await supabaseService
        .from("vo_audio_history")
        .update({
          shot_timepoints: shotTimepoints as unknown as Record<string, unknown>[],
          duration_estimate: audioDuration,
        })
        .eq("id", audioHistoryId);

      if (updateError) {
        console.error("[shot-mapping] DB update error:", updateError);
      } else {
        console.log(
          `[shot-mapping] Updated vo_audio_history ${audioHistoryId} with ${shotTimepoints.length} shot timepoints`
        );
      }
    }

    return jsonResponse(result);
  } catch (err) {
    console.error("[shot-mapping] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      500
    );
  }
});
