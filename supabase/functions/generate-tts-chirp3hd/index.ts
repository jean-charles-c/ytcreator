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

    function parseWav(bytes: Uint8Array): {
      sampleRate: number;
      numChannels: number;
      bitsPerSample: number;
      data: Uint8Array;
    } {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const readAscii = (offset: number, length: number) =>
        String.fromCharCode(...bytes.slice(offset, offset + length));

      if (readAscii(0, 4) !== "RIFF" || readAscii(8, 4) !== "WAVE") {
        throw new Error("Le chunk audio retourné par Google n'est pas un WAV valide.");
      }

      let offset = 12;
      let fmtOffset = -1;
      let dataOffset = -1;
      let dataSize = 0;

      while (offset + 8 <= bytes.length) {
        const chunkId = readAscii(offset, 4);
        const chunkSize = view.getUint32(offset + 4, true);

        if (chunkId === "fmt ") fmtOffset = offset;
        if (chunkId === "data") {
          dataOffset = offset + 8;
          dataSize = chunkSize;
          break;
        }

        offset += 8 + chunkSize + (chunkSize % 2);
      }

      if (fmtOffset < 0 || dataOffset < 0) {
        throw new Error("Impossible de parser l'en-tête WAV retourné par Google.");
      }

      return {
        numChannels: view.getUint16(fmtOffset + 10, true),
        sampleRate: view.getUint32(fmtOffset + 12, true),
        bitsPerSample: view.getUint16(fmtOffset + 22, true),
        data: bytes.slice(dataOffset, dataOffset + dataSize),
      };
    }

    function buildWavFile(
      pcmChunks: Uint8Array[],
      sampleRate: number,
      numChannels: number,
      bitsPerSample: number
    ): Uint8Array {
      const totalDataSize = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const wav = new Uint8Array(44 + totalDataSize);
      const view = new DataView(wav.buffer);
      const encoder = new TextEncoder();
      const blockAlign = (numChannels * bitsPerSample) / 8;
      const byteRate = sampleRate * blockAlign;

      wav.set(encoder.encode("RIFF"), 0);
      view.setUint32(4, 36 + totalDataSize, true);
      wav.set(encoder.encode("WAVE"), 8);
      wav.set(encoder.encode("fmt "), 12);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      wav.set(encoder.encode("data"), 36);
      view.setUint32(40, totalDataSize, true);

      let cursor = 44;
      for (const chunk of pcmChunks) {
        wav.set(chunk, cursor);
        cursor += chunk.length;
      }

      return wav;
    }

    const textChunks = splitTextIntoChunks(text.trim());
    console.log(
      `[chirp3hd] Generating audio: voice=${resolvedVoice}, textLen=${text.length}, chunks=${textChunks.length}`
    );

    const pcmChunks: Uint8Array[] = [];
    let sampleRate: number | null = null;
    let numChannels: number | null = null;
    let bitsPerSample: number | null = null;

    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      const ttsPayload = {
        input: { text: chunk },
        voice: { languageCode, name: resolvedVoice },
        audioConfig: { audioEncoding: "LINEAR16" },
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
          errBody
        );
        return jsonResponse(
          {
            error: `Google TTS API Chirp3-HD a échoué sur le chunk ${i + 1}/${textChunks.length} [${ttsResponse.status}]`,
            details: errBody,
          },
          502
        );
      }

      const ttsData = await ttsResponse.json();
      if (!ttsData.audioContent) {
        return jsonResponse(
          { error: `Aucun contenu audio retourné pour le chunk ${i + 1}.` },
          502
        );
      }

      const bin = atob(ttsData.audioContent as string);
      const bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);

      const parsed = parseWav(bytes);
      if (sampleRate === null) {
        sampleRate = parsed.sampleRate;
        numChannels = parsed.numChannels;
        bitsPerSample = parsed.bitsPerSample;
      } else if (
        parsed.sampleRate !== sampleRate ||
        parsed.numChannels !== numChannels ||
        parsed.bitsPerSample !== bitsPerSample
      ) {
        return jsonResponse(
          { error: "Les chunks audio Google n'ont pas un format WAV homogène." },
          502
        );
      }

      pcmChunks.push(parsed.data);
      console.log(`[chirp3hd] Chunk ${i + 1}/${textChunks.length} OK`);
    }

    const audioBytes = buildWavFile(
      pcmChunks,
      sampleRate ?? 24000,
      numChannels ?? 1,
      bitsPerSample ?? 16
    );
    const fileSize = audioBytes.length;
    const byteRate = (sampleRate ?? 24000) * ((numChannels ?? 1) * (bitsPerSample ?? 16) / 8);
    const durationEstimate = Math.round((fileSize - 44) / byteRate);

    // ── Upload to storage ──
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
