import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  rebuildTranscriptText,
  repairWhisperTranscriptWithShots,
} from "../_shared/whisper-transcript-repair.ts";

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

interface ProjectShotRow {
  id: string;
  scene_id: string;
  shot_order: number;
  source_sentence: string | null;
  source_sentence_fr: string | null;
  description: string;
}

interface ProjectSceneRow {
  id: string;
  scene_order: number;
}

function getShotText(shot: ProjectShotRow): string {
  return (
    shot.source_sentence ||
    shot.source_sentence_fr ||
    shot.description ||
    ""
  ).trim();
}

async function loadOrderedShotSources(
  supabaseService: ReturnType<typeof createClient>,
  projectId: string,
  userId: string
): Promise<{ id: string; text: string }[]> {
  const { data: project, error: projectError } = await supabaseService
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Impossible de vérifier le projet : ${projectError.message}`);
  }
  if (!project) {
    throw new Error("Projet introuvable ou non autorisé.");
  }

  const [{ data: scenes, error: scenesError }, { data: shots, error: shotsError }] = await Promise.all([
    supabaseService
      .from("scenes")
      .select("id, scene_order")
      .eq("project_id", projectId),
    supabaseService
      .from("shots")
      .select("id, scene_id, shot_order, source_sentence, source_sentence_fr, description")
      .eq("project_id", projectId),
  ]);

  if (scenesError) {
    throw new Error(`Impossible de charger les scènes : ${scenesError.message}`);
  }
  if (shotsError) {
    throw new Error(`Impossible de charger les shots : ${shotsError.message}`);
  }

  const sceneOrderMap = new Map(
    ((scenes ?? []) as ProjectSceneRow[]).map((scene) => [scene.id, scene.scene_order])
  );

  return ((shots ?? []) as ProjectShotRow[])
    .sort((a, b) => {
      const sceneOrderA = sceneOrderMap.get(a.scene_id) ?? 0;
      const sceneOrderB = sceneOrderMap.get(b.scene_id) ?? 0;
      if (sceneOrderA !== sceneOrderB) return sceneOrderA - sceneOrderB;
      return a.shot_order - b.shot_order;
    })
    .map((shot) => ({ id: shot.id, text: getShotText(shot) }))
    .filter((shot) => shot.text.length > 0);
}

function repairWhisperRun(
  run: { words: WordTimestamp[]; transcript: string; duration: number },
  orderedShots: { id: string; text: string }[]
): {
  words: WordTimestamp[];
  transcript: string;
  duration: number;
  repairCount: number;
  insertedWordCount: number;
} {
  if (orderedShots.length === 0 || run.words.length === 0) {
    return {
      words: run.words,
      transcript: run.transcript,
      duration: run.duration,
      repairCount: 0,
      insertedWordCount: 0,
    };
  }

  const repaired = repairWhisperTranscriptWithShots(
    run.words,
    orderedShots,
    run.duration
  );

  return {
    words: repaired.words,
    transcript:
      repaired.repairs.length > 0 ? rebuildTranscriptText(repaired.words) : run.transcript,
    duration: Math.max(run.duration, repaired.words[repaired.words.length - 1]?.end ?? run.duration),
    repairCount: repaired.repairs.length,
    insertedWordCount: repaired.repairs.reduce(
      (sum, repair) => sum + repair.insertedWordCount,
      0
    ),
  };
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
    } = await anonClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Non autorisé" }, 401);

    // ── Input ──
    const body = await req.json();
    const { audioUrl, projectId, dualPass, triplePass } = body as {
      audioUrl?: string;
      projectId?: string;
      dualPass?: boolean;
      triplePass?: boolean;
    };

    if (!audioUrl || typeof audioUrl !== "string") {
      return jsonResponse({ error: "Le champ 'audioUrl' est requis." }, 400);
    }
    if (!projectId || typeof projectId !== "string") {
      return jsonResponse({ error: "Le champ 'projectId' est requis." }, 400);
    }

    const orderedShots = await loadOrderedShotSources(supabaseService, projectId, user.id);

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

    const useTriplePass = triplePass === true;
    const useDualPass = !useTriplePass && dualPass === true;
    const passCount = useTriplePass ? 3 : useDualPass ? 2 : 1;
    console.log(`[whisper-align] Mode: ${passCount} pass(es)`);

    // ── Call Whisper (1, 2, or 3 passes) ──
    let finalWords: WordTimestamp[];
    let finalTranscript: string;
    let finalDuration: number;
    let comparison: ReturnType<typeof compareRuns> | null = null;
    let passAWords: WordTimestamp[] | null = null;
    let passBWords: WordTimestamp[] | null = null;
    let passCWords: WordTimestamp[] | null = null;

    let repairSummary: { repairCount: number; insertedWordCount: number } | null = null;

    if (useTriplePass) {
      const [rawRunA, rawRunB, rawRunC] = await Promise.all([
        callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0),
        callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0),
        callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0),
      ]);

      const runA = repairWhisperRun(rawRunA, orderedShots);
      const runB = repairWhisperRun(rawRunB, orderedShots);
      const runC = repairWhisperRun(rawRunC, orderedShots);

      console.log(`[whisper-align] Pass A: ${runA.words.length}, B: ${runB.words.length}, C: ${runC.words.length} words`);
      if (runA.repairCount || runB.repairCount || runC.repairCount) {
        console.log(
          `[whisper-align] Transcript repair applied — A:${runA.repairCount}/${runA.insertedWordCount}w, B:${runB.repairCount}/${runB.insertedWordCount}w, C:${runC.repairCount}/${runC.insertedWordCount}w`
        );
      }

      // Compare all pairs
      const compAB = compareRuns(runA.words, runB.words);
      const compAC = compareRuns(runA.words, runC.words);
      const compBC = compareRuns(runB.words, runC.words);

      // Use pair with lowest average delta as the "best" comparison
      const pairs = [
        { label: "A-B", comp: compAB, avgDelta: compAB.avgDeltaMs },
        { label: "A-C", comp: compAC, avgDelta: compAC.avgDeltaMs },
        { label: "B-C", comp: compBC, avgDelta: compBC.avgDeltaMs },
      ];
      pairs.sort((a, b) => a.avgDelta - b.avgDelta);
      comparison = pairs[0].comp;

      console.log(
        `[whisper-align] Best pair: ${pairs[0].label} avg=${pairs[0].avgDelta}ms, worst: ${pairs[2].label} avg=${pairs[2].avgDelta}ms`
      );

      passAWords = runA.words;
      passBWords = runB.words;
      passCWords = runC.words;
      // Use pass A as default "main" result
      finalWords = runA.words;
      finalTranscript = runA.transcript;
      finalDuration = runA.duration;
      repairSummary = {
        repairCount: runA.repairCount,
        insertedWordCount: runA.insertedWordCount,
      };
    } else if (useDualPass) {
      const [rawRunA, rawRunB] = await Promise.all([
        callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0),
        callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0),
      ]);

      const runA = repairWhisperRun(rawRunA, orderedShots);
      const runB = repairWhisperRun(rawRunB, orderedShots);

      console.log(`[whisper-align] Pass A: ${runA.words.length} words, Pass B: ${runB.words.length} words`);
      if (runA.repairCount || runB.repairCount) {
        console.log(
          `[whisper-align] Transcript repair applied — A:${runA.repairCount}/${runA.insertedWordCount}w, B:${runB.repairCount}/${runB.insertedWordCount}w`
        );
      }

      comparison = compareRuns(runA.words, runB.words);
      console.log(
        `[whisper-align] Comparison: avg=${comparison.avgDeltaMs}ms, max=${comparison.maxDeltaMs}ms, p95=${comparison.p95DeltaMs}ms`
      );

      passAWords = runA.words;
      passBWords = runB.words;
      finalWords = runA.words;
      finalTranscript = runA.transcript;
      finalDuration = runA.duration;
      repairSummary = {
        repairCount: runA.repairCount,
        insertedWordCount: runA.insertedWordCount,
      };
    } else {
      const rawRun = await callWhisper(audioBlob, fileExtension, GROQ_API_KEY, 0);
      const run = repairWhisperRun(rawRun, orderedShots);
      if (run.repairCount) {
        console.log(
          `[whisper-align] Transcript repair applied — ${run.repairCount} gap(s), ${run.insertedWordCount} word(s) inserted`
        );
      }
      finalWords = run.words;
      finalTranscript = run.transcript;
      finalDuration = run.duration;
      repairSummary = {
        repairCount: run.repairCount,
        insertedWordCount: run.insertedWordCount,
      };
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
    // Only persist whisper_words (raw word timestamps) — NOT shot_timepoints.
    // shot_timepoints are managed by the client-side "Recaler sur Whisper" button
    // to avoid overwriting carefully calibrated timepoints with raw Whisper data.
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
          whisper_words: finalWords as unknown as Record<string, unknown>[],
        })
        .eq("id", latestAudio[0].id);

      if (updateError) {
        console.error("[whisper-align] DB update error:", updateError);
      } else {
        console.log(`[whisper-align] Updated vo_audio_history ${latestAudio[0].id} (whisper_words only, shot_timepoints preserved)`);
      }
    }

    return jsonResponse({
      alignmentRun,
      wordCount: finalWords.length,
      audioDuration: finalDuration,
      ...(repairSummary && repairSummary.repairCount > 0
        ? {
            transcriptRepair: repairSummary,
          }
        : {}),
      ...(comparison && passAWords && passBWords
        ? {
            dualPassComparison: {
              avgDeltaMs: comparison.avgDeltaMs,
              maxDeltaMs: comparison.maxDeltaMs,
              p95DeltaMs: comparison.p95DeltaMs,
              wordCountA: comparison.wordCountA,
              wordCountB: comparison.wordCountB,
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
            passA: passAWords,
            passB: passBWords,
            ...(passCWords ? { passC: passCWords } : {}),
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
