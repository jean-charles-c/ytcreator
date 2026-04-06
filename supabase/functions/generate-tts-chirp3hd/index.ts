import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { concatLinear16Wavs, parseLinear16WavFormat } from "../_shared/linear16-wav.ts";

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
    const { text, projectId, voiceName, customFileName, speakingRate, pitch, customPronunciations: userPronunciations, pauseBetweenParagraphs, pauseAfterSentences, pauseAfterComma } = body as {
      text?: string;
      projectId?: string;
      voiceName?: string;
      customFileName?: string;
      speakingRate?: number;
      pitch?: number;
      customPronunciations?: { phrase: string; pronunciation: string }[];
      pauseBetweenParagraphs?: number;
      pauseAfterSentences?: number;
      pauseAfterComma?: number;
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

    // Step 1: normalize unicode quotes and punctuation spacing
    const preNormalized = text.trim()
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+([.!?…,;:»\u00BB])/g, "$1")
      // Step 1b: elision — fuse l' with following word (l'écran → lécran)
      .replace(/\bl[''](?=[aeéèêëiîïoôuùûüyàâæœ])/gi, "l");

    // Step 2: Build customPronunciations — built-in + user overrides
    const BUILT_IN_PRONUNCIATIONS = [
      { phrase: "c'est",   pronunciation: "sɛ" },
      { phrase: "n'est",   pronunciation: "nɛ" },
      { phrase: "l'est",   pronunciation: "lɛ" },
      { phrase: "s'est",   pronunciation: "sɛ" },
      { phrase: "c'était", pronunciation: "setɛ" },
      { phrase: "n'était", pronunciation: "netɛ" },
      { phrase: "n'y",     pronunciation: "ni" },
      { phrase: "qu'est",  pronunciation: "kɛ" },
      { phrase: "qu'il",   pronunciation: "kil" },
      { phrase: "qu'elle", pronunciation: "kɛl" },
      { phrase: "qu'une",  pronunciation: "kyn" },
      { phrase: "d'une",   pronunciation: "dyn" },
    ];

    // Merge: user pronunciations override built-in ones (match by lowercase phrase)
    const mergedMap = new Map<string, { phrase: string; pronunciation: string }>();
    for (const p of BUILT_IN_PRONUNCIATIONS) {
      mergedMap.set(p.phrase.toLowerCase(), p);
    }
    if (Array.isArray(userPronunciations)) {
      for (const p of userPronunciations) {
        if (p.phrase && p.pronunciation) {
          mergedMap.set(p.phrase.toLowerCase(), { phrase: p.phrase, pronunciation: p.pronunciation });
        }
      }
    }

    const CUSTOM_PRONUNCIATIONS = Array.from(mergedMap.values()).map(p => ({
      phrase: p.phrase,
      phoneticEncoding: "PHONETIC_ENCODING_IPA" as const,
      pronunciation: p.pronunciation,
    }));

    // ── Split by paragraphs first, then by byte-size chunks within each paragraph ──
    const paragraphs = preNormalized.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    // If no paragraph breaks, treat as single paragraph
    const effectiveParagraphs = paragraphs.length > 0 ? paragraphs : [preNormalized];

    // Build flat chunk list with paragraph boundary markers
    interface ChunkMeta { text: string; paragraphIndex: number; }
    const allChunks: ChunkMeta[] = [];
    for (let pi = 0; pi < effectiveParagraphs.length; pi++) {
      const paraChunks = splitTextIntoChunks(effectiveParagraphs[pi]);
      for (const chunk of paraChunks) {
        allChunks.push({ text: chunk, paragraphIndex: pi });
      }
    }

    const userCount = Array.isArray(userPronunciations) ? userPronunciations.length : 0;
    const paragraphPauseMs = typeof pauseBetweenParagraphs === "number" ? Math.max(0, Math.min(pauseBetweenParagraphs, 5000)) : 0;
    console.log(
      `[chirp3hd] Generating audio: voice=${resolvedVoice}, textLen=${text.length}, paragraphs=${effectiveParagraphs.length}, chunks=${allChunks.length}, speakingRate=${speakingRate}, pauseBetweenParagraphs=${paragraphPauseMs}ms, builtIn=${BUILT_IN_PRONUNCIATIONS.length}, userCustom=${userCount}, total=${CUSTOM_PRONUNCIATIONS.length}`
    );
    for (let ci = 0; ci < allChunks.length; ci++) {
      const chunk = allChunks[ci].text;
      const first80 = chunk.slice(0, 80).replace(/\n/g, "\\n");
      const last80 = chunk.slice(-80).replace(/\n/g, "\\n");
      console.log(
        `[chirp3hd] Chunk ${ci + 1}/${allChunks.length} (para ${allChunks[ci].paragraphIndex + 1}): bytes=${new TextEncoder().encode(chunk).length}, start="${first80}", end="${last80}"`
      );
    }

    const PARALLEL_BATCH = 5;
    const audioChunkWavs: Uint8Array[] = new Array(allChunks.length);

    async function synthesizeChunk(chunk: string, index: number): Promise<string | null> {
      const audioConfig: Record<string, unknown> = { audioEncoding: "LINEAR16" };
      if (typeof speakingRate === "number" && speakingRate !== 1) {
        audioConfig.speakingRate = speakingRate;
      }
      void pitch;

      const ttsPayload = {
        input: {
          text: chunk,
          customPronunciations: {
            pronunciations: CUSTOM_PRONUNCIATIONS,
          },
        },
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
          `[chirp3hd] Google TTS error chunk ${index + 1}/${allChunks.length} [${ttsResponse.status}]:`,
          errBody.slice(0, 500)
        );
        return `Google TTS API Chirp3-HD a échoué sur le chunk ${index + 1}/${allChunks.length} [${ttsResponse.status}]: ${errBody.slice(0, 300)}`;
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
      console.log(`[chirp3hd] Chunk ${index + 1}/${allChunks.length} OK (${wavBytes.length} bytes WAV)`);
      return null;
    }

    for (let batchStart = 0; batchStart < allChunks.length; batchStart += PARALLEL_BATCH) {
      const batchEnd = Math.min(batchStart + PARALLEL_BATCH, allChunks.length);
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(synthesizeChunk(allChunks[i].text, i));
      }
      const results = await Promise.all(batchPromises);
      const firstError = results.find((result) => result !== null);
      if (firstError) {
        return jsonResponse({ error: firstError }, 502);
      }
    }

    const resolvedChunkCount = audioChunkWavs.filter((part) => part instanceof Uint8Array).length;
    if (resolvedChunkCount !== allChunks.length) {
      console.error(
        `[chirp3hd] Missing audio chunk after synthesis: expected=${allChunks.length}, received=${resolvedChunkCount}`
      );
      return jsonResponse(
        {
          error: `Audio incomplet après synthèse : ${resolvedChunkCount}/${allChunks.length} chunk(s) reçus.`,
        },
        500
      );
    }

    // ── Assemble WAVs with silence between paragraphs ──
    function createSilenceWav(durationMs: number, sampleRate: number): Uint8Array {
      const numSamples = Math.round((durationMs / 1000) * sampleRate);
      // 16-bit mono silence = zero bytes
      const silencePayload = new Uint8Array(numSamples * 2);
      // Build a minimal WAV
      const header = new Uint8Array(44);
      const byteRate = sampleRate * 2;
      // RIFF header
      const dv = new DataView(header.buffer);
      header.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
      dv.setUint32(4, 36 + silencePayload.length, true);
      header.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
      header.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true); // PCM
      dv.setUint16(22, 1, true); // mono
      dv.setUint32(24, sampleRate, true);
      dv.setUint32(28, byteRate, true);
      dv.setUint16(32, 2, true); // block align
      dv.setUint16(34, 16, true); // bits per sample
      header.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
      dv.setUint32(40, silencePayload.length, true);
      const wav = new Uint8Array(44 + silencePayload.length);
      wav.set(header, 0);
      wav.set(silencePayload, 44);
      return wav;
    }

    // Build final WAV array with silence injected between paragraph boundaries
    const finalWavParts: Uint8Array[] = [];
    let sampleRateForSilence = 24000; // will be updated from first chunk
    try {
      const firstFmt = parseLinear16WavFormat(audioChunkWavs[0]);
      sampleRateForSilence = firstFmt.sampleRate;
    } catch { /* fallback 24000 */ }

    for (let ci = 0; ci < allChunks.length; ci++) {
      // Insert silence before this chunk if it's the start of a new paragraph (not the first)
      if (ci > 0 && paragraphPauseMs > 0 && allChunks[ci].paragraphIndex !== allChunks[ci - 1].paragraphIndex) {
        finalWavParts.push(createSilenceWav(paragraphPauseMs, sampleRateForSilence));
      }
      finalWavParts.push(audioChunkWavs[ci]);
    }

    const exactCombinedAudio = concatLinear16Wavs(finalWavParts);
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
      chunks: allChunks.length,
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
