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

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface AlignmentRun {
  transcript: string;
  words: WordTimestamp[];
  audioDuration: number;
  model: string;
  language: string;
  createdAt: string;
}

// ── Single Whisper call ──

async function callWhisper(
  audioBlob: Blob,
  fileExtension: string,
  groqApiKey: string,
  temperature: number
): Promise<{ words: WordTimestamp[]; transcript: string; duration: number }> {
  const formData = new FormData();
  formData.append("file", audioBlob, `audio.${fileExtension}`);
  formData.append("model", "whisper-large-v3");
  formData.append("language", "fr");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  if (temperature > 0) {
    formData.append("temperature", String(temperature));
  }

  const resp = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${groqApiKey}` },
      body: formData,
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Groq Whisper [${resp.status}]: ${errText}`);
  }

  const data = await resp.json();
  const words: WordTimestamp[] = (data.words || [])
    .map((w: { word: string; start: number; end: number }) => ({
      word: (w.word || "").trim(),
      start: Number(w.start) || 0,
      end: Number(w.end) || 0,
    }))
    .filter((w: WordTimestamp) => w.word.length > 0);

  const duration =
    typeof data.duration === "number"
      ? data.duration
      : words.length > 0
      ? words[words.length - 1].end
      : 0;

  return { words, transcript: data.text || "", duration };
}

// ── Compare two runs ──

interface WordDiff {
  index: number;
  word: string;
  startA: number;
  startB: number;
  deltaMs: number; // absolute difference in ms
  endA: number;
  endB: number;
  endDeltaMs: number;
}

function compareRuns(
  wordsA: WordTimestamp[],
  wordsB: WordTimestamp[]
): {
  diffs: WordDiff[];
  avgDeltaMs: number;
  maxDeltaMs: number;
  p95DeltaMs: number;
  wordCountA: number;
  wordCountB: number;
} {
  const minLen = Math.min(wordsA.length, wordsB.length);
  const diffs: WordDiff[] = [];

  for (let i = 0; i < minLen; i++) {
    const deltaMs = Math.abs(wordsA[i].start - wordsB[i].start) * 1000;
    const endDeltaMs = Math.abs(wordsA[i].end - wordsB[i].end) * 1000;
    diffs.push({
      index: i,
      word: wordsA[i].word,
      startA: wordsA[i].start,
      startB: wordsB[i].start,
      deltaMs: Math.round(deltaMs),
      endA: wordsA[i].end,
      endB: wordsB[i].end,
      endDeltaMs: Math.round(endDeltaMs),
    });
  }

  const deltas = diffs.map((d) => d.deltaMs);
  deltas.sort((a, b) => a - b);
  const avgDeltaMs = deltas.length > 0 ? Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length) : 0;
  const maxDeltaMs = deltas.length > 0 ? deltas[deltas.length - 1] : 0;
  const p95Idx = Math.floor(deltas.length * 0.95);
  const p95DeltaMs = deltas.length > 0 ? deltas[Math.min(p95Idx, deltas.length - 1)] : 0;

  return {
    diffs,
    avgDeltaMs,
    maxDeltaMs,
    p95DeltaMs,
    wordCountA: wordsA.length,
    wordCountB: wordsB.length,
  };
}

// ── Average two runs ──

function averageWords(
  wordsA: WordTimestamp[],
  wordsB: WordTimestamp[]
): WordTimestamp[] {
  const minLen = Math.min(wordsA.length, wordsB.length);
  const result: WordTimestamp[] = [];

  for (let i = 0; i < minLen; i++) {
    result.push({
      word: wordsA[i].word,
      start: (wordsA[i].start + wordsB[i].start) / 2,
      end: (wordsA[i].end + wordsB[i].end) / 2,
    });
  }

  return result;
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
    const { audioUrl, projectId, dualPass } = body as {
      audioUrl?: string;
      projectId?: string;
      dualPass?: boolean;
    };

    if (!audioUrl || typeof audioUrl !== "string") {
      return jsonResponse({ error: "Le champ 'audioUrl' est requis." }, 400);
    }
    if (!projectId || typeof projectId !== "string") {
      return jsonResponse({ error: "Le champ 'projectId' est requis." }, 400);
    }

    // ── Download audio ──
    console.log(`[whisper-align] Downloading audio: ${audioUrl.slice(0, 80)}…`);
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return jsonResponse(
        { error: `Impossible de télécharger l'audio (${audioResponse.status})` },
        502
      );
    }

    const contentType = audioResponse.headers.get("content-type") || "audio/mpeg";
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: contentType });
    const fileExtension = contentType.includes("wav") || audioUrl.toLowerCase().includes(".wav")
      ? "wav"
      : contentType.includes("mpeg") || audioUrl.toLowerCase().includes(".mp3")
        ? "mp3"
        : "audio";

    console.log(`[whisper-align] Audio: ${audioBlob.size} bytes, type=${contentType}`);

    // ── Groq key ──
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return jsonResponse({ error: "Clé API Groq non configurée." }, 500);
    }

    const useDualPass = dualPass === true;
    console.log(`[whisper-align] Mode: ${useDualPass ? "DUAL PASS" : "single pass"}`);

    // ── Call Whisper (1 or 2 passes) ──
    let finalWords: WordTimestamp[];
    let finalTranscript: string;
    let finalDuration: number;
    let comparison: ReturnType<typeof compareRuns> | null = null;

    if (useDualPass) {
      // Launch 2 passes in parallel with slightly different temperatures
      const [runA, runB] = await Promise.all([
        callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0),
        callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0),
      ]);

      console.log(`[whisper-align] Pass A: ${runA.words.length} words, Pass B: ${runB.words.length} words`);

      comparison = compareRuns(runA.words, runB.words);
      console.log(
        `[whisper-align] Comparison: avg=${comparison.avgDeltaMs}ms, max=${comparison.maxDeltaMs}ms, p95=${comparison.p95DeltaMs}ms`
      );

      // Use averaged words for the final result
      finalWords = averageWords(runA.words, runB.words);
      finalTranscript = runA.transcript;
      finalDuration = (runA.duration + runB.duration) / 2;
    } else {
      const run = await callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0);
      finalWords = run.words;
      finalTranscript = run.transcript;
      finalDuration = run.duration;
    }

    const alignmentRun: AlignmentRun = {
      transcript: finalTranscript,
      words: finalWords,
      audioDuration: finalDuration,
      model: "whisper-large-v3",
      language: "fr",
      createdAt: new Date().toISOString(),
    };

    console.log(
      `[whisper-align] Final: ${finalWords.length} words, duration=${finalDuration.toFixed(1)}s`
    );

    // ── Persist alignment in vo_audio_history ──
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: latestAudio } = await supabaseService
      .from("vo_audio_history")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("style", "chirp3hd")
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestAudio && latestAudio.length > 0) {
      const { error: updateError } = await supabaseService
        .from("vo_audio_history")
        .update({
          duration_estimate: finalDuration,
          shot_timepoints: { alignmentRun } as unknown as Record<string, unknown>,
        })
        .eq("id", latestAudio[0].id);

      if (updateError) {
        console.error("[whisper-align] DB update error:", updateError);
      } else {
        console.log(`[whisper-align] Updated vo_audio_history ${latestAudio[0].id}`);
      }
    }

    return jsonResponse({
      alignmentRun,
      wordCount: finalWords.length,
      audioDuration: finalDuration,
      ...(comparison
        ? {
            dualPassComparison: {
              avgDeltaMs: comparison.avgDeltaMs,
              maxDeltaMs: comparison.maxDeltaMs,
              p95DeltaMs: comparison.p95DeltaMs,
              wordCountA: comparison.wordCountA,
              wordCountB: comparison.wordCountB,
              // Include top 20 biggest diffs for diagnosis
              biggestDiffs: comparison.diffs
                .sort((a, b) => b.deltaMs - a.deltaMs)
                .slice(0, 20)
                .map((d) => ({
                  word: d.word,
                  index: d.index,
                  startA: d.startA,
                  startB: d.startB,
                  deltaMs: d.deltaMs,
                })),
            },
          }
        : {}),
    });
  } catch (err) {
    console.error("[whisper-align] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      500
    );
  }
});
