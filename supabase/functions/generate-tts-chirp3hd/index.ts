import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { concatLinear16Wavs } from "../_shared/linear16-wav.ts";

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

function decodeBase64Audio(audioContent: string): Uint8Array {
  const bin = atob(audioContent);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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
      console.error("[chirp3hd] Auth error:", authError);
      return jsonResponse({ error: "Non autorisé" }, 401);
    }

    const body = await req.json();
    const { text, projectId, voiceName, customFileName, speakingRate, pitch } = body as {
      text?: string;
      projectId?: string;
      voiceName?: string;
      customFileName?: string;
      speakingRate?: number;
      pitch?: number;
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

    const resolvedVoice =
      voiceName && voiceName.trim().length > 0
        ? voiceName.trim()
        : "fr-FR-Chirp3-HD-Charon";

    const languageCode = "fr-FR";
    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!GOOGLE_TTS_API_KEY) {
      return jsonResponse({ error: "Clé API Google TTS non configurée." }, 500);
    }

    const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`;
    const MAX_BYTES = 4500;

    function splitTextIntoChunks(fullText: string): string[] {
      const encoder = new TextEncoder();
      if (encoder.encode(fullText).length <= MAX_BYTES) return [fullText];

      const sentences = fullText.split(/(?<=[.!?…])\s+/);
      const chunks: string[] = [];
      let current = "";

      for (const sentence of sentences) {
        const candidate = current ? `${current} ${sentence}` : sentence;
        if (encoder.encode(candidate).length > MAX_BYTES) {
          if (current) chunks.push(current);
          if (encoder.encode(sentence).length > MAX_BYTES) {
            const words = sentence.split(/\s+/);
            let wordChunk = "";
            for (const word of words) {
              const wordCandidate = wordChunk ? `${wordChunk} ${word}` : word;
              if (encoder.encode(wordCandidate).length > MAX_BYTES) {
                if (wordChunk) chunks.push(wordChunk);
                wordChunk = word;
              } else {
                wordChunk = wordCandidate;
              }
            }
            current = wordChunk;
          } else {
            current = sentence;
          }
        } else {
          current = candidate;
        }
      }

      if (current) chunks.push(current);
      return chunks;
    }

    const normalizedText = text.trim()
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+([.!?…,;:»\u00BB])/g, "$1")
      .replace(/\bn['']y\b/gi, "ni")
      .replace(/\bc['']est\b/gi, "sait")
      .replace(/([ldnscjmtLDNSCJMT])['']([a-zA-ZÀ-ÖØ-öø-ÿ])/gi, "$1$2")
      .replace(/([Qq]u)['']([a-zA-ZÀ-ÖØ-öø-ÿ])/gi, "$1$2");

    const textChunks = splitTextIntoChunks(normalizedText);
    console.log(
      `[chirp3hd] Generating audio: voice=${resolvedVoice}, textLen=${text.length}, chunks=${textChunks.length}, speakingRate=${speakingRate}, normalizedSample="${normalizedText.slice(0, 200)}"`
    );
    for (let ci = 0; ci < textChunks.length; ci++) {
      const chunk = textChunks[ci];
      const first80 = chunk.slice(0, 80).replace(/\n/g, "\\n");
      const last80 = chunk.slice(-80).replace(/\n/g, "\\n");
      console.log(
        `[chirp3hd] Chunk ${ci + 1}/${textChunks.length}: bytes=${new TextEncoder().encode(chunk).length}, start="${first80}", end="${last80}"`
      );
    }

    const PARALLEL_BATCH = 5;
    const audioChunkWavs: Uint8Array[] = new Array(textChunks.length);

    async function synthesizeChunk(chunk: string, index: number): Promise<string | null> {
      const audioConfig: Record<string, unknown> = { audioEncoding: "LINEAR16" };
      if (typeof speakingRate === "number" && speakingRate !== 1) {
        audioConfig.speakingRate = speakingRate;
      }
      void pitch;

      const ttsPayload = {
        input: { text: chunk },
        voice: { languageCode, name: resolvedVoice },
        audioConfig,
      };

      const ttsResponse = await fetch(ttsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ttsPayload),
      });

      if (!ttsResponse.ok) {
        const errBody = await ttsResponse.text();
        console.error(
          `[chirp3hd] Google TTS error chunk ${index + 1}/${textChunks.length} [${ttsResponse.status}]:`,
          errBody.slice(0, 500)
        );
        return `Google TTS API Chirp3-HD a échoué sur le chunk ${index + 1}/${textChunks.length} [${ttsResponse.status}]: ${errBody.slice(0, 300)}`;
      }

      const responseContentType = ttsResponse.headers.get("content-type") || "";
      let ttsData: { audioContent?: string };
      if (responseContentType.includes("application/json")) {
        ttsData = await ttsResponse.json();
      } else {
        const bodyText = await ttsResponse.text();
        console.error(
          `[chirp3hd] Non-JSON response chunk ${index + 1} (${responseContentType}):`,
          bodyText.slice(0, 300)
        );
        return `Google TTS a retourné un format inattendu pour le chunk ${index + 1}.`;
      }

      if (!ttsData.audioContent) {
        return `Aucun contenu audio retourné pour le chunk ${index + 1}.`;
      }

      const wavBytes = decodeBase64Audio(ttsData.audioContent);
      audioChunkWavs[index] = wavBytes;
      console.log(`[chirp3hd] Chunk ${index + 1}/${textChunks.length} OK (${wavBytes.length} bytes WAV)`);
      return null;
    }

    for (let batchStart = 0; batchStart < textChunks.length; batchStart += PARALLEL_BATCH) {
      const batchEnd = Math.min(batchStart + PARALLEL_BATCH, textChunks.length);
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(synthesizeChunk(textChunks[i], i));
      }
      const results = await Promise.all(batchPromises);
      const firstError = results.find((result) => result !== null);
      if (firstError) {
        return jsonResponse({ error: firstError }, 502);
      }
    }

    const resolvedChunkCount = audioChunkWavs.filter((part) => part instanceof Uint8Array).length;
    if (resolvedChunkCount !== textChunks.length) {
      console.error(
        `[chirp3hd] Missing audio chunk after synthesis: expected=${textChunks.length}, received=${resolvedChunkCount}`
      );
      return jsonResponse(
        {
          error: `Audio incomplet après synthèse : ${resolvedChunkCount}/${textChunks.length} chunk(s) reçus.`,
        },
        500
      );
    }

    const exactCombinedAudio = concatLinear16Wavs(audioChunkWavs);
    const audioBytes = exactCombinedAudio.wav;
    const fileSize = audioBytes.length;
    const durationEstimate = exactCombinedAudio.durationSeconds;

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const safeName = customFileName?.trim()
      ? customFileName.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
      : "chirp3hd";
    const fileName = `${safeName}_${timestamp}.wav`;
    const storagePath = `${user.id}/${projectId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vo-audio")
      .upload(storagePath, audioBytes, {
        contentType: "audio/wav",
        upsert: false,
      });

    if (uploadError) {
      console.error("[chirp3hd] Upload error:", uploadError);
      return jsonResponse({ error: `Erreur upload : ${uploadError.message}` }, 500);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("vo-audio").getPublicUrl(storagePath);

    const { error: insertError } = await supabase.from("vo_audio_history").insert({
      project_id: projectId,
      user_id: user.id,
      file_name: fileName,
      file_path: storagePath,
      file_size: fileSize,
      duration_estimate: durationEstimate,
      language_code: languageCode,
      voice_gender: resolvedVoice.toLowerCase().includes("féminin") ? "FEMALE" : "MALE",
      speaking_rate: null,
      style: "chirp3hd",
      text_length: text.length,
      shot_timepoints: null,
    });

    if (insertError) {
      console.error("[chirp3hd] DB insert error:", insertError);
    }

    console.log(
      `[chirp3hd] Success: ${fileName}, ${fileSize} bytes WAV, ${durationEstimate.toFixed(3)}s`
    );

    return jsonResponse({
      audioUrl: publicUrl,
      fileName,
      fileSize,
      durationEstimate,
      voiceName: resolvedVoice,
      pipeline: "chirp3hd",
      chunks: textChunks.length,
      audioFormat: "wav",
    });
  } catch (err) {
    console.error("[chirp3hd] Unexpected error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      500
    );
  }
});
