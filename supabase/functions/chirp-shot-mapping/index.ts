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

// ── Normalisation ──

function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents for comparison
    .replace(/[^a-z0-9]/g, ""); // strip punctuation
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// ── Fuzzy matching ──

function wordsMatch(source: string, whisper: string): boolean {
  return normalizeWord(source) === normalizeWord(whisper);
}

/**
 * Find the best starting position in whisperWords for a sequence of sourceWords.
 * Uses a sliding window with fuzzy matching.
 * Returns { startIdx, endIdx, matchCount } or null.
 */
function findBestWindow(
  sourceWords: string[],
  whisperWords: WordTimestamp[],
  searchStart: number
): { startIdx: number; endIdx: number; matchCount: number } | null {
  if (sourceWords.length === 0) return null;

  const windowSize = sourceWords.length;
  const searchEnd = Math.min(
    whisperWords.length,
    searchStart + windowSize * 3 + 10 // generous search range
  );

  let bestStart = -1;
  let bestMatchCount = 0;

  for (let i = searchStart; i <= searchEnd - 1; i++) {
    let matchCount = 0;
    let whisperIdx = i;

    for (let s = 0; s < sourceWords.length && whisperIdx < whisperWords.length; s++) {
      if (wordsMatch(sourceWords[s], whisperWords[whisperIdx].word)) {
        matchCount++;
        whisperIdx++;
      } else {
        // Try skipping one whisper word (insertion by Whisper)
        if (
          whisperIdx + 1 < whisperWords.length &&
          wordsMatch(sourceWords[s], whisperWords[whisperIdx + 1].word)
        ) {
          matchCount++;
          whisperIdx += 2;
        } else {
          // Skip source word (deletion by Whisper)
          whisperIdx++;
        }
      }
    }

    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestStart = i;
    }

    // Perfect match — stop early
    if (bestMatchCount >= sourceWords.length * 0.9) break;
  }

  if (bestStart < 0 || bestMatchCount === 0) return null;

  // Determine endIdx by replaying the best match
  let endIdx = bestStart;
  let whisperIdx = bestStart;
  for (let s = 0; s < sourceWords.length && whisperIdx < whisperWords.length; s++) {
    if (wordsMatch(sourceWords[s], whisperWords[whisperIdx].word)) {
      endIdx = whisperIdx;
      whisperIdx++;
    } else if (
      whisperIdx + 1 < whisperWords.length &&
      wordsMatch(sourceWords[s], whisperWords[whisperIdx + 1].word)
    ) {
      endIdx = whisperIdx + 1;
      whisperIdx += 2;
    } else {
      whisperIdx++;
    }
  }

  return { startIdx: bestStart, endIdx, matchCount: bestMatchCount };
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

      const window = findBestWindow(sourceTokens, whisperWords, searchCursor);

      if (!window || window.matchCount === 0) {
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
        status: confidence >= 0.7 ? "exact" : "partial",
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

    const mappedWordIndices = new Set<number>();
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

      // Convert to the shot_timepoints format used by the existing pipeline
      const shotTimepoints = shotTimelines
        .filter((s) => s.status !== "missing")
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
