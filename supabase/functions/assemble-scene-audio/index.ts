import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { concatLinear16Wavs, parseLinear16WavFormat, createSilenceWav } from "../_shared/linear16-wav.ts";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Non autorisé" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Non autorisé" }, 401);
    }

    const body = await req.json();
    const { projectId, pauseBetweenScenes, customFileName } = body as {
      projectId?: string;
      pauseBetweenScenes?: number;
      customFileName?: string;
    };

    if (!projectId) {
      return jsonResponse({ error: "Le champ 'projectId' est requis." }, 400);
    }

    // Load all scene audio ordered by scene_order
    const { data: sceneAudios, error: fetchError } = await supabase
      .from("scene_vo_audio")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .order("scene_order", { ascending: true });

    if (fetchError) {
      console.error("[assemble] DB fetch error:", fetchError);
      return jsonResponse({ error: `Erreur DB : ${fetchError.message}` }, 500);
    }

    if (!sceneAudios || sceneAudios.length === 0) {
      return jsonResponse({ error: "Aucun audio de scène trouvé pour ce projet." }, 404);
    }

    console.log(`[assemble] Assembling ${sceneAudios.length} scene audio files for project ${projectId}`);

    // Download all scene WAV files
    const wavParts: Uint8Array[] = [];
    const sceneOffsets: { sceneId: string; sceneOrder: number; offsetSeconds: number; durationSeconds: number }[] = [];
    const pauseMs = typeof pauseBetweenScenes === "number" ? Math.max(0, Math.min(pauseBetweenScenes, 5000)) : 0;
    let currentOffsetSeconds = 0;

    // Determine sample rate from first scene
    let sampleRate = 24000;

    for (let i = 0; i < sceneAudios.length; i++) {
      const scene = sceneAudios[i];

      // Download WAV from storage
      const { data: fileData, error: dlError } = await supabase.storage
        .from("vo-audio")
        .download(scene.file_path);

      if (dlError || !fileData) {
        console.error(`[assemble] Failed to download scene ${scene.scene_id}:`, dlError);
        return jsonResponse({
          error: `Erreur téléchargement audio scène ${scene.scene_order + 1} : ${dlError?.message ?? "fichier introuvable"}`,
        }, 500);
      }

      const wavBytes = new Uint8Array(await fileData.arrayBuffer());

      // Get sample rate from first file
      if (i === 0) {
        try {
          const fmt = parseLinear16WavFormat(wavBytes);
          sampleRate = fmt.sampleRate;
        } catch { /* fallback 24000 */ }
      }

      // Insert silence between scenes (not before first)
      if (i > 0 && pauseMs > 0) {
        const silenceWav = createSilenceWav(pauseMs, sampleRate);
        wavParts.push(silenceWav);
        currentOffsetSeconds += pauseMs / 1000;
      }

      // Record offset for this scene
      const sceneDuration = scene.duration_seconds ?? 0;
      sceneOffsets.push({
        sceneId: scene.scene_id,
        sceneOrder: scene.scene_order,
        offsetSeconds: currentOffsetSeconds,
        durationSeconds: sceneDuration,
      });

      wavParts.push(wavBytes);
      currentOffsetSeconds += sceneDuration;

      console.log(`[assemble] Scene ${i + 1}/${sceneAudios.length} (order=${scene.scene_order}): ${wavBytes.length} bytes, ${sceneDuration.toFixed(3)}s`);
    }

    // Concatenate all WAVs
    const assembled = concatLinear16Wavs(wavParts);
    const audioBytes = assembled.wav;
    const durationEstimate = assembled.durationSeconds;

    console.log(`[assemble] Final audio: ${audioBytes.length} bytes, ${durationEstimate.toFixed(3)}s`);

    // Upload assembled audio
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const safeName = customFileName?.trim()
      ? customFileName.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
      : "chirp3hd";
    const fileName = `${safeName}_assembled_${timestamp}.wav`;
    const storagePath = `${user.id}/${projectId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vo-audio")
      .upload(storagePath, audioBytes, {
        contentType: "audio/wav",
        upsert: false,
      });

    if (uploadError) {
      console.error("[assemble] Upload error:", uploadError);
      return jsonResponse({ error: `Erreur upload : ${uploadError.message}` }, 500);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("vo-audio").getPublicUrl(storagePath);

    // Insert into vo_audio_history (assembled = full project audio)
    const { error: insertError } = await supabase.from("vo_audio_history").insert({
      project_id: projectId,
      user_id: user.id,
      file_name: fileName,
      file_path: storagePath,
      file_size: audioBytes.length,
      duration_estimate: durationEstimate,
      language_code: "fr-FR",
      voice_gender: "MALE",
      speaking_rate: null,
      style: "chirp3hd-assembled",
      text_length: null,
      shot_timepoints: null,
    });

    if (insertError) {
      console.error("[assemble] DB insert error:", insertError);
    }

    console.log(`[assemble] Success: ${fileName}, ${audioBytes.length} bytes, ${durationEstimate.toFixed(3)}s, ${sceneAudios.length} scenes`);

    return jsonResponse({
      audioUrl: publicUrl,
      fileName,
      fileSize: audioBytes.length,
      durationEstimate,
      sceneCount: sceneAudios.length,
      sceneOffsets,
      pipeline: "chirp3hd-assembled",
      audioFormat: "wav",
    });
  } catch (err) {
    console.error("[assemble] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      500
    );
  }
});
