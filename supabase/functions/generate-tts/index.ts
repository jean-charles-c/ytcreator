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
  effectsProfileId?: string;
  pauseBetweenParagraphs?: number; // ms
  pauseAfterSentences?: number; // ms
  mode?: "preview" | "full";
  projectId?: string;
  customFileName?: string;
}

async function callGoogleTTS(
  text: string,
  apiKey: string,
  voice: Record<string, unknown>,
  audioConfig: Record<string, unknown>,
  useSsml = false
): Promise<string> {
  const input = useSsml ? { ssml: text } : { text };
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, voice, audioConfig }),
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


interface GoogleVoice {
  name: string;
  languageCodes: string[];
  ssmlGender?: "MALE" | "FEMALE" | "NEUTRAL";
}

const VOICES_CACHE = new Map<string, { voices: GoogleVoice[]; cachedAt: number }>();
const VOICES_TTL_MS = 60 * 60 * 1000;

async function listGoogleVoices(apiKey: string, languageCode: string): Promise<GoogleVoice[]> {
  const cacheKey = languageCode;
  const cached = VOICES_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < VOICES_TTL_MS) return cached.voices;

  const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google voices API failed [${response.status}]: ${err}`);
  }

  const payload = await response.json();
  const voices = ((payload.voices ?? []) as GoogleVoice[])
    .filter((v) => Array.isArray(v.languageCodes) && v.languageCodes.includes(languageCode));

  VOICES_CACHE.set(cacheKey, { voices, cachedAt: Date.now() });
  return voices;
}

async function resolveVoiceName(
  apiKey: string,
  languageCode: string,
  requestedVoiceName: string | undefined,
  voiceType: string | undefined,
  voiceGender: "MALE" | "FEMALE" | "NEUTRAL"
): Promise<string | undefined> {
  try {
    const voices = await listGoogleVoices(apiKey, languageCode);
    if (voices.length === 0) return requestedVoiceName;

    const inferredType = requestedVoiceName?.match(/-(Standard|Wavenet|Neural2)-/i)?.[1];
    const normalizedType = (voiceType || inferredType || "Standard").toLowerCase();

    const exactRequested = requestedVoiceName
      ? voices.find((v) => v.name === requestedVoiceName)
      : undefined;

    // Keep exact requested only when voiceType is not explicitly requested
    if (!voiceType && exactRequested) return exactRequested.name;

    const typeVoices = voices
      .filter((v) => v.name.toLowerCase().includes(`-${normalizedType}-`))
      .sort((a, b) => a.name.localeCompare(b.name));

    const genderTypeVoices = typeVoices.filter((v) => v.ssmlGender === voiceGender);
    const pool = (genderTypeVoices.length > 0 ? genderTypeVoices : typeVoices);

    if (pool.length > 0) {
      const idx = normalizedType === "wavenet"
        ? pool.length - 1
        : normalizedType === "neural2"
          ? Math.floor(pool.length / 2)
          : 0;
      return pool[Math.max(0, Math.min(idx, pool.length - 1))].name;
    }

    const byGender = voices.filter((v) => v.ssmlGender === voiceGender);
    return (byGender[0] || voices[0])?.name;
  } catch (error) {
    console.error("Voice resolve fallback:", error);
    return requestedVoiceName;
  }
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
      voiceType,
      speakingRate = 1.0,
      pitch = 0,
      volumeGainDb = 0,
      effectsProfileId,
      pauseBetweenParagraphs = 0,
      pauseAfterSentences = 0,
      mode = "preview",
      projectId,
    } = body;

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Le texte est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolvedVoiceName = await resolveVoiceName(
      GOOGLE_TTS_API_KEY,
      languageCode,
      voiceName,
      voiceType,
      voiceGender
    );

    const voice: Record<string, unknown> = { languageCode };
    if (resolvedVoiceName) {
      voice.name = resolvedVoiceName;
    } else {
      voice.ssmlGender = voiceGender;
    }

    const audioConfig: Record<string, unknown> = { audioEncoding: "MP3", speakingRate, pitch, volumeGainDb };
    if (effectsProfileId) {
      audioConfig.effectsProfileId = [effectsProfileId];
    }

    // Convert text to SSML if pauses are configured
    function escapeXml(s: string): string {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function textToSsml(rawText: string, paraPauseMs: number, sentPauseMs: number): string {
      if (paraPauseMs <= 0 && sentPauseMs <= 0) return rawText;

      const paragraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim());
      const paraBreak = paraPauseMs > 0 ? `<break time="${paraPauseMs}ms"/>` : "";
      const sentBreak = sentPauseMs > 0 ? `<break time="${sentPauseMs}ms"/>` : "";

      const processedParagraphs = paragraphs.map((p) => {
        const escaped = escapeXml(p.trim());
        if (sentPauseMs <= 0) return escaped;
        // Insert break after sentence-ending punctuation (. ! ?)
        return escaped.replace(/([.!?])\s+/g, `$1${sentBreak} `);
      });

      if (processedParagraphs.length <= 1 && !paraBreak) {
        return `<speak>${processedParagraphs[0] || ""}</speak>`;
      }

      const inner = processedParagraphs.join(paraBreak ? `${paraBreak}\n` : "\n");
      return `<speak>${inner}</speak>`;
    }

    if (mode === "preview") {
      const ssmlText = textToSsml(text, pauseBetweenParagraphs, pauseAfterSentences);
      const isSsml = ssmlText.startsWith("<speak>");
      const audioContent = await callGoogleTTS(ssmlText, GOOGLE_TTS_API_KEY, voice, audioConfig, isSsml);
      return new Response(
        JSON.stringify({ audioContent, usedVoiceName: resolvedVoiceName ?? null }),
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

    // Convert text to SSML with pauses
    const ssmlText = textToSsml(text, pauseBetweenParagraphs);
    const isSsml = ssmlText.startsWith("<speak>");

    // Google TTS has a 5000 byte limit per request — split if needed
    const MAX_CHARS = 4800;
    const chunks: string[] = [];
    if (ssmlText.length <= MAX_CHARS) {
      chunks.push(ssmlText);
    } else {
      // For SSML, split by paragraphs; for plain text, split at sentence boundaries
      if (isSsml) {
        // Strip <speak> wrapper, split on <break>, re-wrap each chunk
        const inner = ssmlText.replace(/^<speak>/, "").replace(/<\/speak>$/, "");
        const parts = inner.split(/(<break[^/]*\/>)/);
        let current = "<speak>";
        for (const part of parts) {
          if ((current + part + "</speak>").length > MAX_CHARS && current !== "<speak>") {
            chunks.push(current + "</speak>");
            current = "<speak>" + part;
          } else {
            current += part;
          }
        }
        if (current !== "<speak>") chunks.push(current + "</speak>");
      } else {
        const sentences = ssmlText.split(/(?<=[.!?])\s+/);
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
    }

    // Generate audio for all chunks
    const audioBuffers: Uint8Array[] = [];
    for (const chunk of chunks) {
      const chunkIsSsml = chunk.startsWith("<speak>");
      const b64 = await callGoogleTTS(chunk, GOOGLE_TTS_API_KEY, voice, audioConfig, chunkIsSsml);
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
    const sanitized = body.customFileName
      ? body.customFileName.replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "_").slice(0, 80)
      : null;
    const fileName = sanitized ? `${sanitized}.m4a` : `vo_${timestamp}.m4a`;
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
        usedVoiceName: resolvedVoiceName ?? null,
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
