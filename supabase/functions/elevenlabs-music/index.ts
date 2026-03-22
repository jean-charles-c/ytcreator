import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { prompt, duration, projectId, customFileName } = await req.json();

    if (!prompt?.trim()) {
      throw new Error("Le prompt est requis");
    }
    if (!projectId) {
      throw new Error("projectId requis");
    }

    const durationSeconds = duration || 30;

    // Call ElevenLabs Music API
    const elResponse = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: durationSeconds * 1000,
      }),
    });

    if (!elResponse.ok) {
      const errBody = await elResponse.text();
      throw new Error(`ElevenLabs API error ${elResponse.status}: ${errBody}`);
    }

    const audioBuffer = await elResponse.arrayBuffer();
    const fileSize = audioBuffer.byteLength;

    // Generate file name
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = new Date().toISOString().slice(11, 16).replace(":", "h");
    const rawName = customFileName?.trim() || "music";
    // Sanitize: remove accents, replace non-alphanumeric with underscore
    const safeName = rawName
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 80);
    const fileName = `${safeName}_${dateStr}_${timeStr}.mp3`;
    const storagePath = `${userId}/${projectId}/${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("music-audio")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("music-audio")
      .getPublicUrl(storagePath);

    // Save to history
    const { error: dbError } = await supabase.from("music_history").insert({
      project_id: projectId,
      user_id: userId,
      file_name: fileName,
      file_path: storagePath,
      file_size: fileSize,
      duration_seconds: durationSeconds,
      prompt: prompt.trim(),
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
    }

    return new Response(
      JSON.stringify({
        audioUrl: urlData.publicUrl,
        fileName,
        fileSize,
        durationSeconds,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    console.error("elevenlabs-music error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur interne" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
