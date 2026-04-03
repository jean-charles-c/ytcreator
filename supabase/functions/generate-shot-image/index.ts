import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "jsr:@matmen/imagescript";
import { transformPromptForSensitiveMode, extractAnchorsFromScene } from "../_shared/sensitive-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL_COSTS: Record<string, number> = {
  "google/gemini-2.5-flash-image": 0.02,
  "google/gemini-3.1-flash-image-preview": 0.06,
  "google/gemini-3-pro-image-preview": 0.1,
};

const ALLOWED_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
];

const ASPECT_RATIOS: Record<string, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "3:4": 3 / 4,
  "2:3": 2 / 3,
};

const MAX_REF_CANDIDATES = 6;
const MAX_REF_SOURCE_BYTES = 1_200_000;
const MAX_REF_OUTPUT_BYTES = 90_000;
const MAX_TOTAL_REF_PAYLOAD_BYTES = 360_000;
const MAX_REF_LONGEST_SIDE = 320;
const REF_JPEG_QUALITY = 60;

const getExtensionFromMime = (mimeType: string) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x4000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const readBodyWithLimit = async (response: Response, maxBytes: number) => {
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;

  if (typeof contentLength === "number" && Number.isFinite(contentLength) && contentLength > maxBytes) {
    console.warn(`Skipping reference image larger than limit: ${contentLength} bytes > ${maxBytes} bytes`);
    await response.body?.cancel();
    return null;
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength <= maxBytes ? bytes : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        console.warn(`Aborting reference image download above ${maxBytes} bytes`);
        await reader.cancel("reference image too large");
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
};

const prepareReferenceImageDataUri = async (url: string) => {
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });

  if (!resp.ok) {
    console.warn(`Failed to download ref image ${url}: HTTP ${resp.status}`);
    await resp.body?.cancel();
    return null;
  }

  const contentType = resp.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    console.warn(`Skipping non-image reference asset: ${url}`);
    await resp.body?.cancel();
    return null;
  }

  const sourceBytes = await readBodyWithLimit(resp, MAX_REF_SOURCE_BYTES);
  if (!sourceBytes) {
    console.warn(`Skipping oversized reference image: ${url}`);
    return null;
  }

  let decoded: Image;
  try {
    decoded = await Image.decode(sourceBytes);
  } catch {
    console.warn(`Failed to decode reference image: ${url}`);
    return null;
  }

  const initialScale = MAX_REF_LONGEST_SIDE / Math.max(decoded.width, decoded.height);
  if (initialScale < 1) {
    decoded.resize(
      Math.max(1, Math.round(decoded.width * initialScale)),
      Math.max(1, Math.round(decoded.height * initialScale)),
    );
  }

  let encodedBytes = await decoded.encodeJPEG(REF_JPEG_QUALITY);

  if (encodedBytes.byteLength > MAX_REF_OUTPUT_BYTES) {
    const retryScale = 0.75;
    decoded.resize(
      Math.max(1, Math.round(decoded.width * retryScale)),
      Math.max(1, Math.round(decoded.height * retryScale)),
    );
    encodedBytes = await decoded.encodeJPEG(55);
  }

  if (encodedBytes.byteLength > MAX_REF_OUTPUT_BYTES) {
    console.warn(`Skipping heavy reference image after compression: ${url}`);
    return null;
  }

  return {
    url,
    payload: `data:image/jpeg;base64,${bytesToBase64(encodedBytes)}`,
    payloadBytes: encodedBytes.byteLength,
  };
};

const extractUsdCost = (payload: any, fallback: number) => {
  const candidates = [
    payload?.usage?.cost_usd,
    payload?.usage?.total_cost_usd,
    payload?.usage?.usd,
    payload?.usageMetadata?.costUsd,
    payload?.usage_metadata?.cost_usd,
    payload?.cost_usd,
  ];

  const exact = candidates.find((value) => typeof value === "number" && Number.isFinite(value));
  return typeof exact === "number" ? exact : fallback;
};

const decodeGeneratedImage = async (imageData: string) => {
  const base64Match = imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);

  if (base64Match) {
    const mimeType = `image/${base64Match[1] === "jpg" ? "jpeg" : base64Match[1]}`;
    const extension = getExtensionFromMime(mimeType);
    const base64Content = base64Match[2];
    const bytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
    return { bytes, mimeType, extension };
  }

  const remoteResponse = await fetch(imageData);
  if (!remoteResponse.ok) throw new Error("Unable to download generated image");

  const mimeType = remoteResponse.headers.get("content-type")?.split(";")[0] || "image/png";
  const extension = getExtensionFromMime(mimeType);
  const bytes = new Uint8Array(await remoteResponse.arrayBuffer());
  return { bytes, mimeType, extension };
};

const enforceExactAspectRatio = async (imageBytes: Uint8Array, aspectRatio: string) => {
  const targetAR = ASPECT_RATIOS[aspectRatio] ?? ASPECT_RATIOS["16:9"];
  const decoded = await Image.decode(imageBytes);
  const origW = decoded.width;
  const origH = decoded.height;
  const srcAR = origW / origH;

  // Crop to target aspect ratio
  if (Math.abs(srcAR - targetAR) > 0.01) {
    if (srcAR > targetAR) {
      const cw = Math.max(1, Math.round(origH * targetAR));
      decoded.crop(Math.floor((origW - cw) / 2), 0, cw, origH);
    } else {
      const ch = Math.max(1, Math.round(origW / targetAR));
      decoded.crop(0, Math.floor((origH - ch) / 2), origW, ch);
    }
  }

  // Downscale if larger than 1280px on longest side — keeps file size small
  const MAX_DIM = 1280;
  if (decoded.width > MAX_DIM || decoded.height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(decoded.width, decoded.height);
    const newW = Math.max(1, Math.round(decoded.width * scale));
    const newH = Math.max(1, Math.round(decoded.height * scale));
    decoded.resize(newW, newH);
  }

  console.log("Processed image", { aspectRatio, origW, origH, outW: decoded.width, outH: decoded.height });
  // Encode as JPEG at 85% quality — much smaller than PNG
  const bytes = await decoded.encodeJPEG(85);
  return { bytes, mimeType: "image/jpeg" as const, extension: "jpg" as const, width: decoded.width, height: decoded.height };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");

    let user: { id: string };
    try {
      const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);

      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", auth_expired: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      user = { id: claimsData.claims.sub };
    } catch (claimsException) {
      const message = claimsException instanceof Error ? claimsException.message : "Unauthorized";
      if (message === "JWT has expired" || message.toLowerCase().includes("jwt") || message === "Unauthorized") {
        return new Response(
          JSON.stringify({ error: message, auth_expired: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw claimsException;
    }

    const { shot_id, model, aspect_ratio, sensitive_level, visual_style, custom_prompt } = await req.json();
    if (!shot_id) throw new Error("Missing shot_id");

    const selectedModel = ALLOWED_MODELS.includes(model)
      ? model
      : "google/gemini-2.5-flash-image";
    const selectedAspectRatio = Object.keys(ASPECT_RATIOS).includes(aspect_ratio)
      ? aspect_ratio
      : "16:9";

    const fallbackCost = MODEL_COSTS[selectedModel] ?? 0;

    const { data: shot, error: shotErr } = await supabase
      .from("shots")
      .select("*")
      .eq("id", shot_id)
      .single();

    if (shotErr || !shot) throw new Error("Shot not found");

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", shot.project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) throw new Error("Unauthorized");

    // Fetch parent scene context for sensitive mode anchoring
    let sceneContextAnchors = null;
    let sceneOrder: number | null = null;
    if (true) {
      const { data: scene } = await supabase
        .from("scenes")
        .select("scene_context, location, visual_intention, scene_order")
        .eq("id", shot.scene_id)
        .single();

      if (scene) {
        sceneOrder = scene.scene_order;
        if (sensitive_level && sensitive_level >= 1) {
          sceneContextAnchors = extractAnchorsFromScene(
            scene.scene_context as Record<string, any> | null,
            { location: scene.location ?? undefined, visual_intention: scene.visual_intention ?? undefined },
          );
          console.log("Scene context anchors:", JSON.stringify(sceneContextAnchors));
        }
      }
    }

    // Fetch recurring objects from global_context for identity locks & reference images
    const { data: scriptState } = await supabase
      .from("project_scriptcreator_state")
      .select("global_context")
      .eq("project_id", shot.project_id)
      .maybeSingle();
    const globalContext = scriptState?.global_context as Record<string, any> | null;
    const recurringObjects = Array.isArray(globalContext?.objets_recurrents) ? globalContext.objets_recurrents : [];

    // Find objects linked to this shot's scene
    const linkedObjects = recurringObjects.filter((obj: any) => {
      if (Array.isArray(obj.mentions_scenes) && obj.mentions_scenes.length > 0 && sceneOrder !== null) {
        return obj.mentions_scenes.includes(sceneOrder);
      }
      return false;
    });

    // Further filter: only objects whose name appears in the shot's source_sentence
    const shotText = (shot.source_sentence || shot.description || "").toLowerCase();
    const shotLinkedObjects = linkedObjects.filter((obj: any) => {
      const objName = (obj.nom || "").toLowerCase();
      return objName && shotText.includes(objName.split(" ")[0].toLowerCase());
    });

    // If a custom_prompt is provided (user edited the full prompt in UI), use it directly
    let enrichedPrompt: string;
    if (typeof custom_prompt === "string" && custom_prompt.trim().length > 0) {
      enrichedPrompt = custom_prompt.trim();
      console.log("Using custom_prompt from client (user-edited full prompt)");
    } else {
      const rawPrompt = shot.prompt_export || shot.description;
      if (!rawPrompt) throw new Error("No prompt available for this shot");

      // Apply sensitive mode transformation with structured scene context
      const prompt = transformPromptForSensitiveMode(rawPrompt, sensitive_level, sceneContextAnchors);

      // Inject identity lock prompts for linked objects
      enrichedPrompt = prompt;
      if (shotLinkedObjects.length > 0) {
        const identityLocks = shotLinkedObjects
          .map((obj: any) => {
            let lock = obj.identity_prompt || "";
            // Replace old placeholder features with reference image list
            if (lock && (lock.includes("[period feature 1]") || lock.includes("[feature 1]") || lock.includes("MANDATORY PERIOD-SPECIFIC FEATURES") || lock.includes("MANDATORY VISUAL FEATURES"))) {
              const refImages = Array.isArray(obj.reference_images) ? obj.reference_images : [];
              let replacement: string;
              if (refImages.length > 0) {
                const safeName = (obj.nom || "ref").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
                const items = refImages.map((url: string, i: number) => {
                  const ext = url.split("/").pop()?.split("?")[0]?.split(".").pop() || "jpg";
                  return `- ${safeName}_ref_${i + 1}.${ext}`;
                }).join("\n");
                replacement = `REFERENCE IMAGES PROVIDED:\n${items}\nUse these reference images as fidelity anchors to preserve exact visual identity.`;
              } else {
                replacement = `REFERENCE IMAGES: None provided yet.`;
              }
              // Replace the placeholder block
              lock = lock.replace(/MANDATORY (?:PERIOD-SPECIFIC|VISUAL) FEATURES:\n(?:- \[(?:period )?feature \d+\]\n?)+/g, replacement);
            }
            return lock;
          })
          .filter(Boolean);
        if (identityLocks.length > 0) {
          const lockPrefix = identityLocks.join("\n\n") + "\n\n";
          const firstSnippet = identityLocks[0].slice(0, 40).toLowerCase();
          if (!enrichedPrompt.toLowerCase().includes(firstSnippet)) {
            enrichedPrompt = lockPrefix + enrichedPrompt;
          }
        }
      }
    }

    // Collect reference images from linked objects
    const referenceImageUrls: string[] = [];
    for (const obj of shotLinkedObjects) {
      if (Array.isArray(obj.reference_images)) {
        for (const url of obj.reference_images) {
          if (typeof url === "string" && url.startsWith("http")) {
            referenceImageUrls.push(url);
          }
        }
      }
    }

    // Download reference images conservatively to stay within Edge worker limits.
    const limitedRefUrls = Array.from(new Set(referenceImageUrls)).slice(0, MAX_REF_CANDIDATES);
    const referenceImageDataUris: string[] = [];
    let preparedRefBytes = 0;
    if (limitedRefUrls.length > 0) {
      console.log(`Preparing ${limitedRefUrls.length}/${referenceImageUrls.length} reference images (candidate cap ${MAX_REF_CANDIDATES})...`);
      for (const url of limitedRefUrls) {
        try {
          const prepared = await prepareReferenceImageDataUri(url);
          if (!prepared) {
            continue;
          }

          if (preparedRefBytes + prepared.payloadBytes > MAX_TOTAL_REF_PAYLOAD_BYTES) {
            console.log(
              `Stopping reference image intake at ${referenceImageDataUris.length} image(s) to stay under ${MAX_TOTAL_REF_PAYLOAD_BYTES} bytes`,
            );
            break;
          }

          referenceImageDataUris.push(prepared.payload);
          preparedRefBytes += prepared.payloadBytes;
        } catch (err) {
          console.warn(`Error downloading ref image ${url}:`, err);
        }
      }
      console.log(
        `Successfully prepared ${referenceImageDataUris.length}/${limitedRefUrls.length} reference images (${preparedRefBytes} bytes total)`,
      );
    }

    // Add REFERENCE IMAGE RULE if there are reference images
    const REFERENCE_IMAGE_RULE = `REFERENCE IMAGE RULE:

Use the provided reference image(s) only to preserve the exact identity, proportions, structure, materials, distinctive features, and period-specific visual traits of the subject.

If the subject is a person, use the reference only to preserve the exact facial structure, age appearance, hairstyle, body proportions, posture, clothing logic, and distinctive traits of that specific period.

If the subject is a place, use the reference only to preserve the exact architecture, layout, structural condition, materials, surrounding context, landmark features, and historical state.

If the subject is an object, use the reference only to preserve the exact shape, proportions, construction, surface treatment, materials, and defining details of that exact version.

Treat the reference image(s) as a fidelity anchor, not as a composition to copy literally unless explicitly requested.

Do not import unwanted background elements, text, framing, lighting, or scene details from the reference.

Do not turn the subject into a generic lookalike, a stylized reinterpretation, a modernized version, a hybrid, or a mixed-era representation.`;

    if (referenceImageDataUris.length > 0) {
      enrichedPrompt = REFERENCE_IMAGE_RULE + "\n\n" + enrichedPrompt;
    }

    // Visual style suffix map
    const STYLE_SUFFIXES: Record<string, string> = {
      realistic: "Ultra realistic documentary photography, photojournalistic style, natural lighting, high dynamic range, film grain, 8k detail",
      cinematic: "Cinematic film still, dramatic lighting, shallow depth of field, anamorphic lens flare, color graded, widescreen composition, movie-like atmosphere",
      illustration: "Digital illustration, detailed artwork, rich colors, clean lines, editorial illustration style, professional book illustration",
      painting: "Oil painting style, visible brush strokes, rich texture, classical composition, fine art painting, museum quality",
      lineart: "Detailed line art drawing, pen and ink style, fine linework, cross-hatching, black and white sketch, architectural precision",
      comics: "Comic book style, bold outlines, dynamic panels, vivid flat colors, graphic novel illustration, halftone dots",
      animation: "Anime style, cel-shaded, vibrant colors, expressive characters, Studio Ghibli inspired, clean digital animation",
      conceptart: "Concept art, environment design, painterly digital art, atmospheric perspective, matte painting, professional pre-production art",
      "3dcgi": "3D rendered, CGI, physically based rendering, global illumination, subsurface scattering, photorealistic 3D, Unreal Engine quality",
      graphicdesign: "Graphic design, flat design, bold typography, geometric shapes, modern layout, clean vector aesthetic, infographic style",
      abstract: "Abstract art, experimental composition, non-representational, bold colors, textured layers, artistic interpretation, mixed media",
      scientific: "Scientific illustration, technical diagram, anatomically precise, labeled cross-section, medical illustration, educational clarity",
    };

    const styleSuffix = visual_style && STYLE_SUFFIXES[visual_style]
      ? STYLE_SUFFIXES[visual_style]
      : null;

    const buildPrompt = (text: string) => [
      "Generate one single cinematic image.",
      `Mandatory aspect ratio: ${selectedAspectRatio}.`,
      "Compose the framing to work natively in that ratio without letterboxing or white borders.",
      text,
      ...(styleSuffix ? [`Visual style: ${styleSuffix}`] : []),
    ].join("\n");

    // Build multimodal content array with reference images as base64
    const buildMessageContent = (promptText: string): any => {
      if (referenceImageDataUris.length === 0) {
        return promptText;
      }
      // Multimodal: text + reference images as base64 data URIs
      const parts: any[] = [{ type: "text", text: promptText }];
      for (const dataUri of referenceImageDataUris) {
        parts.push({
          type: "image_url",
          image_url: { url: dataUri },
        });
      }
      return parts;
    };

    // Sanitize prompt for safety-filter retry: remove potentially sensitive words
    const sanitizePrompt = (text: string) => {
      // Strip words that commonly trigger safety filters
      const sanitized = text
        .replace(/\b(blood|bloody|gore|gory|murder|kill|dead\s+body|corpse|skull|death|vampire|undead|stake|impale|decapitat|burn(?:ing|ed)?\s+(?:body|corpse|alive))\b/gi, "figure")
        .replace(/\b(naked|nude|sex|erotic|violent|brutal|gruesome|macabre|torture)\b/gi, "dramatic")
        .replace(/\s{2,}/g, " ")
        .trim();
      return `A stylized, artistic documentary illustration. ${sanitized}`;
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const MAX_RETRIES = 3;
    let imageData: string | undefined;
    let aiData: any;
    let usedSanitized = false;

    // Try original prompt first, then sanitized fallback on IMAGE_SAFETY
    const promptVariants = [buildPrompt(enrichedPrompt), buildPrompt(sanitizePrompt(enrichedPrompt))];

    for (let variantIdx = 0; variantIdx < promptVariants.length && !imageData; variantIdx++) {
      const currentPromptText = promptVariants[variantIdx];
      const retries = variantIdx === 0 ? 1 : MAX_RETRIES;

      for (let attempt = 1; attempt <= retries; attempt++) {
        // Rebuild content each attempt (ref images may have been cleared on previous attempt)
        const currentContent = buildMessageContent(currentPromptText);
        console.log(`Generating image: variant ${variantIdx}, attempt ${attempt}, ref images: ${referenceImageDataUris.length}`);
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + LOVABLE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: "user", content: currentContent }],
            modalities: ["image", "text"],
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error(`AI error (variant ${variantIdx}, attempt ${attempt}):`, aiResponse.status, errText);
          if (aiResponse.status === 429) throw new Error("Rate limit exceeded, please try again later");
          if (aiResponse.status === 402) throw new Error("Payment required, please add credits");
          // If 400 due to image fetch failure, retry without ref images
          if (aiResponse.status === 400 && errText.includes("fetching image from URL") && referenceImageDataUris.length > 0) {
            console.warn("Reference images inaccessible via gateway, retrying without them...");
            referenceImageDataUris.length = 0;
            variantIdx--;
            break;
          }
          if (aiResponse.status >= 500 && attempt < retries) {
            await new Promise((r) => setTimeout(r, attempt * 3000));
            continue;
          }
          if (aiResponse.status >= 500) break;
          throw new Error("AI gateway error");
        }

        aiData = await aiResponse.json();
        const msg = aiData.choices?.[0]?.message;
        const finishReason = aiData.choices?.[0]?.native_finish_reason || aiData.choices?.[0]?.finish_reason;
        console.log(`AI variant ${variantIdx} attempt ${attempt} - finish: ${finishReason}`);

        // Safety block: skip to sanitized variant
        if (finishReason === "IMAGE_SAFETY") {
          console.warn("Image blocked by safety filter, trying sanitized prompt...");
          break; // break inner loop → next variant
        }

        // Try multiple known response formats
        imageData = msg?.images?.[0]?.image_url?.url;
        if (!imageData && Array.isArray(msg?.content)) {
          const imagePart = msg.content.find((p: any) => p.type === "image_url" || p.type === "image");
          imageData = imagePart?.image_url?.url || imagePart?.url || imagePart?.image?.url;
        }
        if (!imageData && Array.isArray(msg?.content)) {
          const inlinePart = msg.content.find((p: any) => p.inline_data?.mime_type?.startsWith("image/"));
          if (inlinePart?.inline_data) {
            imageData = `data:${inlinePart.inline_data.mime_type};base64,${inlinePart.inline_data.data}`;
          }
        }

        if (imageData) {
          usedSanitized = variantIdx > 0;
          break;
        }

        console.warn(`No image in response (variant ${variantIdx}, attempt ${attempt})`);
        if (attempt < retries) await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }

    if (!imageData) {
      // Both original and sanitized prompts failed — mark shot as safety-blocked
      await supabase
        .from("shots")
        .update({ guardrails: "safety_blocked" })
        .eq("id", shot_id);

      console.warn("Full AI response (safety blocked):", JSON.stringify(aiData).substring(0, 1000));
      return new Response(
        JSON.stringify({
          message: "Image bloquée par le filtre de sécurité",
          safety_blocked: true,
          shot_id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawImage = await decodeGeneratedImage(imageData);
    const normalizedImage = await enforceExactAspectRatio(rawImage.bytes, selectedAspectRatio);

    const filePath = `${shot.project_id}/${shot.id}.${normalizedImage.extension}`;

    const { error: uploadError } = await supabase.storage
      .from("shot-images")
      .upload(filePath, normalizedImage.bytes, {
        contentType: normalizedImage.mimeType,
        upsert: true,
      });

    if (uploadError) throw new Error("Failed to upload image");

    const { data: publicUrlData } = supabase.storage
      .from("shot-images")
      .getPublicUrl(filePath);

    const imageUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    const exactOrFallbackCost = extractUsdCost(aiData, fallbackCost);
    const previousCost = typeof shot.generation_cost === "number" ? shot.generation_cost : Number(shot.generation_cost ?? 0);
    const newTotalCost = Number((previousCost + exactOrFallbackCost).toFixed(4));

    const updatePayload: Record<string, any> = {
      image_url: imageUrl,
      generation_cost: newTotalCost,
      guardrails: usedSanitized ? "safety_filtered" : null,
    };

    const { error: updateErr } = await supabase
      .from("shots")
      .update(updatePayload)
      .eq("id", shot_id);

    if (updateErr) throw new Error("Failed to update shot");

    return new Response(
      JSON.stringify({
        image_url: imageUrl,
        generation_cost: newTotalCost,
        last_generation_cost: Number(exactOrFallbackCost.toFixed(4)),
        requested_aspect_ratio: selectedAspectRatio,
        actual_dimensions: `${normalizedImage.width}x${normalizedImage.height}`,
        safety_filtered: usedSanitized,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("generate-shot-image error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    const isAuthError = message === "Unauthorized" || message === "JWT has expired" || message.toLowerCase().includes("jwt");
    return new Response(
      JSON.stringify(isAuthError ? { error: message, auth_expired: true } : { error: message }),
      { status: isAuthError ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});