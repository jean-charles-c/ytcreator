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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Non autorisé" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await anonClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Non autorisé" }, 401);

    // ── Input validation ──
    const body = await req.json();
    const { text, projectId, voiceName, customFileName } = body as {
      text?: string;
      projectId?: string;
      voiceName?: string;
      customFileName?: string;
    };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return jsonResponse({ error: "Le champ 'text' est requis." }, 400);
    }
    if (!projectId || typeof projectId !== "string") {
      return jsonResponse({ error: "Le champ 'projectId' est requis." }, 400);
    }
    if (text.length > 100_000) {
      return jsonResponse(
        { error: "Le texte dépasse la limite de 100 000 caractères." },
        400
      );
    }

    // ── Resolve voice name ──
    const resolvedVoice =
      voiceName && voiceName.trim().length > 0
        ? voiceName.trim()
        : "fr-FR-Chirp3-HD-Charon"; // Default: masculine Chirp3-HD

    const languageCode = "fr-FR";

    // ── Call Google TTS ──
    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!GOOGLE_TTS_API_KEY) {
      return jsonResponse(
        { error: "Clé API Google TTS non configurée." },
        500
      );
    }

    const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`;

    // Chirp3-HD: plain text only, no SSML, no speakingRate/pitch
    const ttsPayload = {
      input: { text: text.trim() },
      voice: {
        languageCode,
        name: resolvedVoice,
      },
      audioConfig: {
        audioEncoding: "MP3",
      },
    };

    console.log(
      `[chirp3hd] Generating audio: voice=${resolvedVoice}, textLen=${text.length}`
    );

    const ttsResponse = await fetch(ttsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ttsPayload),
    });

    if (!ttsResponse.ok) {
      const errBody = await ttsResponse.text();
      console.error(`[chirp3hd] Google TTS error [${ttsResponse.status}]:`, errBody);
      return jsonResponse(
        {
          error: `Google TTS API Chirp3-HD a échoué [${ttsResponse.status}]`,
          details: errBody,
        },
        502
      );
    }

    const ttsData = await ttsResponse.json();
    const audioContent = ttsData.audioContent as string; // base64

    if (!audioContent) {
      return jsonResponse(
        { error: "Aucun contenu audio retourné par Google TTS." },
        502
      );
    }

    // ── Decode and measure ──
    const binaryString = atob(audioContent);
    const audioBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      audioBytes[i] = binaryString.charCodeAt(i);
    }
    const fileSize = audioBytes.length;

    // Rough duration estimate: MP3 at ~128kbps
    const durationEstimate = Math.round((fileSize * 8) / 128000);

    // ── Upload to storage ──
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const safeName = customFileName?.trim()
      ? customFileName.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
      : "chirp3hd";
    const fileName = `${safeName}_${timestamp}.mp3`;
    const storagePath = `${user.id}/${projectId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vo-audio")
      .upload(storagePath, audioBytes, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("[chirp3hd] Upload error:", uploadError);
      return jsonResponse(
        { error: `Erreur upload : ${uploadError.message}` },
        500
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("vo-audio").getPublicUrl(storagePath);

    // ── Save to history ──
    const { error: insertError } = await supabase
      .from("vo_audio_history")
      .insert({
        project_id: projectId,
        user_id: user.id,
        file_name: fileName,
        file_path: storagePath,
        file_size: fileSize,
        duration_estimate: durationEstimate,
        language_code: languageCode,
        voice_gender: resolvedVoice.toLowerCase().includes("féminin")
          ? "FEMALE"
          : "MALE",
        speaking_rate: null,
        style: "chirp3hd",
        text_length: text.length,
        shot_timepoints: null, // Will be filled by alignment step (Prompt 4+)
      });

    if (insertError) {
      console.error("[chirp3hd] DB insert error:", insertError);
      // Non-blocking: audio is still usable
    }

    console.log(
      `[chirp3hd] Success: ${fileName}, ${fileSize} bytes, ~${durationEstimate}s`
    );

    return jsonResponse({
      audioUrl: publicUrl,
      fileName,
      fileSize,
      durationEstimate,
      voiceName: resolvedVoice,
      pipeline: "chirp3hd",
    });
  } catch (err) {
    console.error("[chirp3hd] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      500
    );
  }
});
