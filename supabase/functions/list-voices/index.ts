import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GoogleVoice {
  name: string;
  languageCodes: string[];
  ssmlGender: "MALE" | "FEMALE" | "NEUTRAL";
  naturalSampleRateHertz: number;
}

interface VoiceInfo {
  name: string;
  gender: string;
  type: string; // Standard, Wavenet, Neural2, Studio, Polyglot
  letter: string; // A, B, C...
  sampleRate: number;
}

// Cache voices per language for 1 hour
const cache = new Map<string, { voices: VoiceInfo[]; at: number }>();
const TTL = 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!GOOGLE_TTS_API_KEY) {
      throw new Error("GOOGLE_TTS_API_KEY is not configured");
    }

    const { languageCode = "fr-FR" } = await req.json();

    // Check cache
    const cached = cache.get(languageCode);
    if (cached && Date.now() - cached.at < TTL) {
      return new Response(JSON.stringify({ voices: cached.voices }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?languageCode=${languageCode}&key=${GOOGLE_TTS_API_KEY}`
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google API error [${response.status}]: ${err}`);
    }

    const data = await response.json();
    const rawVoices: GoogleVoice[] = data.voices ?? [];

    // Parse and structure voices
    const voices: VoiceInfo[] = rawVoices
      .filter((v) => v.languageCodes.includes(languageCode))
      .map((v) => {
        // Voice name format: fr-FR-Wavenet-A or fr-FR-Chirp3-HD-Achernar
        // Extract: lang prefix (2 parts), then type (middle), then letter (last)
        const parts = v.name.split("-");
        const letter = parts[parts.length - 1]; // A, B, Achernar, etc.
        // Type is everything between lang prefix (first 2 parts) and letter (last part)
        const typeRaw = parts.slice(2, parts.length - 1).join("-"); // "Standard", "Wavenet", "Chirp3-HD"
        return {
          name: v.name,
          gender: v.ssmlGender,
          type: typeRaw,
          letter,
          sampleRate: v.naturalSampleRateHertz,
        };
      })
      .sort((a, b) => {
        // Sort by type priority then letter
        const typePriority: Record<string, number> = { Standard: 0, Wavenet: 1, Neural2: 2, Studio: 3, Polyglot: 4 };
        const pa = typePriority[a.type] ?? 5;
        const pb = typePriority[b.type] ?? 5;
        if (pa !== pb) return pa - pb;
        return a.letter.localeCompare(b.letter);
      });

    cache.set(languageCode, { voices, at: Date.now() });

    return new Response(JSON.stringify({ voices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("List voices error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
