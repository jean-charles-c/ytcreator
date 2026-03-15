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
  speakingRate?: number;
  pitch?: number;
  volumeGainDb?: number;
  mode?: "preview" | "full";
  projectId?: string;
}

async function callGoogleTTS(
  text: string,
  apiKey: string,
  voice: Record<string, unknown>,
  audioConfig: Record<string, unknown>
): Promise<string> {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { text }, voice, audioConfig }),
    }
  );

  if (!response.ok) {
    const errorData = await response.text();
    console.error("Google TTS API error:", errorData);
    throw new Error(`Google TTS API failed [${response.status}]: ${errorData}`);
  }

  const data = await response.json();
  return data.audioContent; // base64 encoded
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
      speakingRate = 1.0,
      pitch = 0,
      volumeGainDb = 0,
      mode = "preview",
      projectId,
    } = body;

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Le texte est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const voice: Record<string, unknown> = { languageCode, ssmlGender: voiceGender };
    if (voiceName) voice.name = voiceName;

    const audioConfig = { audioEncoding: "MP3", speakingRate, pitch, volumeGainDb };

    if (mode === "preview") {
      // Simple preview: return base64 audio directly
      const audioContent = await callGoogleTTS(text, GOOGLE_TTS_API_KEY, voice, audioConfig);
      return new Response(
        JSON.stringify({ audioContent }),
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

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client for storage operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Decode user from JWT
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

    // Google TTS has a 5000 byte limit per request — split if needed
    const MAX_CHARS = 4800;
    const chunks: string[] = [];
    if (text.length <= MAX_CHARS) {
      chunks.push(text);
    } else {
      // Split at sentence boundaries
      const sentences = text.split(/(?<=[.!?])\s+/);
      let current = "";
      for (const sentence of sentences) {
        if ((current + " " + sentence).length > MAX_CHARS && current.length > 0) {
          chunks.push(current.trim());
          current = sentence;
        } else {
          current = current ? current + " " + sentence : sentence;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }

    // Generate audio for all chunks
    const audioBuffers: Uint8Array[] = [];
    for (const chunk of chunks) {
      const b64 = await callGoogleTTS(chunk, GOOGLE_TTS_API_KEY, voice, audioConfig);
      // Decode base64 to binary
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      audioBuffers.push(raw);
    }

    // Concatenate all MP3 buffers (MP3 is appendable)
    const totalLength = audioBuffers.reduce((sum, b) => sum + b.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of audioBuffers) {
      combined.set(buf, offset);
      offset += buf.length;
    }

    // Generate file name
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `vo_${timestamp}.m4a`;
    const filePath = `${user.id}/${projectId}/${fileName}`;

    // Upload to storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from("vo-audio")
      .upload(filePath, combined, {
        contentType: "audio/mp4",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from("vo-audio")
      .getPublicUrl(filePath);

    // Estimate duration: ~150 words/min at 1x speed, average 5 chars/word
    const wordCount = text.trim().split(/\s+/).length;
    const durationEstimate = (wordCount / 150) * 60 / speakingRate;

    // Save to history table
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
        chunks: chunks.length,
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
