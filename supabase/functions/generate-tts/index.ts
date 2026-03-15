import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TTSRequest {
  text: string;
  languageCode?: string;   // e.g. "fr-FR", "en-US"
  voiceGender?: "MALE" | "FEMALE" | "NEUTRAL";
  voiceName?: string;      // e.g. "fr-FR-Neural2-A"
  speakingRate?: number;    // 0.25 to 4.0, default 1.0
  pitch?: number;           // -20.0 to 20.0, default 0
  volumeGainDb?: number;    // -96.0 to 16.0, default 0
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
    } = body;

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Le texte est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build voice selection
    const voice: Record<string, unknown> = {
      languageCode,
      ssmlGender: voiceGender,
    };
    if (voiceName) {
      voice.name = voiceName;
    }

    // Call Google Cloud TTS API
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice,
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate,
            pitch,
            volumeGainDb,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Google TTS API error:", errorData);
      throw new Error(`Google TTS API failed [${response.status}]: ${errorData}`);
    }

    const data = await response.json();

    // Google TTS returns base64-encoded audio in data.audioContent
    return new Response(
      JSON.stringify({ audioContent: data.audioContent }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: unknown) {
    console.error("TTS generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
