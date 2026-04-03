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
    if (!authHeader?.startsWith("Bearer "))
      return jsonResponse({ error: "Non autorisé" }, 401);

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

    // ── Input validation ──
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

    // ── Resolve voice name ──
    const resolvedVoice =
      voiceName && voiceName.trim().length > 0
        ? voiceName.trim()
        : "fr-FR-Chirp3-HD-Charon"; // Default: masculine Chirp3-HD

    const languageCode = "fr-FR";

    // ── Call Google TTS (chunked for texts > 4500 bytes) ──
    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!GOOGLE_TTS_API_KEY) {
      return jsonResponse(
        { error: "Clé API Google TTS non configurée." },
        500
      );
    }

    const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`;
    const MAX_BYTES = 4500; // safe margin under 5000 byte limit

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

    const textChunks = splitTextIntoChunks(text.trim());
    console.log(
      `[chirp3hd] Generating audio: voice=${resolvedVoice}, textLen=${text.length}, chunks=${textChunks.length}, speakingRate=${speakingRate}`
    );

    const audioPartsBytes: Uint8Array[] = [];

    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      const audioConfig: Record<string, unknown> = { audioEncoding: "MP3" };
      if (typeof speakingRate === "number" && speakingRate !== 1) {
        audioConfig.speakingRate = speakingRate;
      }
      // Note: Chirp3-HD voices do NOT support pitch parameter
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
          `[chirp3hd] Google TTS error chunk ${i + 1}/${textChunks.length} [${ttsResponse.status}]:`,
          errBody.slice(0, 500)
        );
        return jsonResponse(
          {
            error: `Google TTS API Chirp3-HD a échoué sur le chunk ${i + 1}/${textChunks.length} [${ttsResponse.status}]`,
            details: errBody.slice(0, 500),
          },
          502
        );
      }

      // Safely parse response — guard against HTML error pages
      const responseContentType = ttsResponse.headers.get("content-type") || "";
      let ttsData: any;
      if (responseContentType.includes("application/json")) {
        ttsData = await ttsResponse.json();
      } else {
        const bodyText = await ttsResponse.text();
        console.error(`[chirp3hd] Non-JSON response (${responseContentType}):`, bodyText.slice(0, 300));
        return jsonResponse(
          { error: `Google TTS a retourné un format inattendu pour le chunk ${i + 1}.` },
          502
        );
      }

      if (!ttsData.audioContent) {
        return jsonResponse(
          { error: `Aucun contenu audio retourné pour le chunk ${i + 1}.` },
          502
        );
      }

      const bin = atob(ttsData.audioContent as string);
      const bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      audioPartsBytes.push(bytes);
      console.log(`[chirp3hd] Chunk ${i + 1}/${textChunks.length} OK (${bytes.length} bytes)`);
    }

    // ── Concatenate MP3 chunks ──
    // Google TTS MP3 chunks are self-contained MPEG frames without ID3 headers,
    // so simple byte concatenation produces a valid MP3 stream.
    const totalSize = audioPartsBytes.reduce((sum, part) => sum + part.length, 0);
    const audioBytes = new Uint8Array(totalSize);
    let offset = 0;
    for (const part of audioPartsBytes) {
      audioBytes.set(part, offset);
      offset += part.length;
    }
    const fileSize = audioBytes.length;

    // Google TTS MP3 is at 32kbps per docs
    const durationEstimate = Math.round((fileSize * 8) / 32000);

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
