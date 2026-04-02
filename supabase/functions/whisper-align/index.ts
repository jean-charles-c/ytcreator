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
  /** Full transcript returned by Whisper */
  transcript: string;
  /** Word-level timestamps */
  words: WordTimestamp[];
  /** Total audio duration in seconds */
  audioDuration: number;
  /** Model used */
  model: string;
  /** Language detected */
  language: string;
  /** Timestamp of this run */
  createdAt: string;
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
    const { audioUrl, projectId } = body as {
      audioUrl?: string;
      projectId?: string;
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
    const audioDurationEstimate = audioBlob.size * 8 / 128000; // rough fallback only

    console.log(
      `[whisper-align] Audio downloaded: ${audioBlob.size} bytes, ~${audioDurationEstimate.toFixed(1)}s, type=${contentType}`
    );

    // ── Call Groq Whisper ──
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return jsonResponse(
        { error: "Clé API Groq non configurée." },
        500
      );
    }

    const formData = new FormData();
    formData.append("file", audioBlob, `audio.${fileExtension}`);
    formData.append("model", "whisper-large-v3");
    formData.append("language", "fr");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");

    console.log("[whisper-align] Calling Groq Whisper…");

    const whisperResponse = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: formData,
      }
    );

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      console.error(
        `[whisper-align] Groq error [${whisperResponse.status}]:`,
        errText
      );
      return jsonResponse(
        {
          error: `Groq Whisper a échoué [${whisperResponse.status}]`,
          details: errText,
        },
        502
      );
    }

    const whisperData = await whisperResponse.json();

    // ── Extract word timestamps ──
    const rawWords: WordTimestamp[] = (whisperData.words || []).map(
      (w: { word: string; start: number; end: number }) => ({
        word: (w.word || "").trim(),
        start: Number(w.start) || 0,
        end: Number(w.end) || 0,
      })
    );

    // Filter out empty words
    const words = rawWords.filter((w) => w.word.length > 0);

    const audioDuration =
      typeof whisperData.duration === "number"
        ? whisperData.duration
        : words.length > 0
        ? words[words.length - 1].end
        : audioDurationEstimate;

    const alignmentRun: AlignmentRun = {
      transcript: whisperData.text || "",
      words,
      audioDuration,
      model: "whisper-large-v3",
      language: whisperData.language || "fr",
      createdAt: new Date().toISOString(),
    };

    console.log(
      `[whisper-align] Success: ${words.length} words, duration=${audioDuration.toFixed(1)}s, transcript=${alignmentRun.transcript.slice(0, 80)}…`
    );

    // ── Persist alignment in vo_audio_history (update latest entry) ──
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the latest chirp3hd audio for this project
    const { data: latestAudio } = await supabaseService
      .from("vo_audio_history")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .eq("style", "chirp3hd")
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestAudio && latestAudio.length > 0) {
      // Store alignment run as JSON in shot_timepoints temporarily
      // This will be remapped to proper shot_timepoints in Prompt 5
      const { error: updateError } = await supabaseService
        .from("vo_audio_history")
        .update({
          duration_estimate: audioDuration,
          shot_timepoints: { alignmentRun } as unknown as Record<string, unknown>,
        })
        .eq("id", latestAudio[0].id);

      if (updateError) {
        console.error("[whisper-align] DB update error:", updateError);
      } else {
        console.log(
          `[whisper-align] Updated vo_audio_history ${latestAudio[0].id} with alignment data`
        );
      }
    }

    return jsonResponse({
      alignmentRun,
      wordCount: words.length,
      audioDuration,
    });
  } catch (err) {
    console.error("[whisper-align] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      500
    );
  }
});
