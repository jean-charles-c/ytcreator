import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "jsr:@matmen/imagescript";
import { transformPromptForSensitiveMode } from "../_shared/sensitive-mode.ts";

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

const getExtensionFromMime = (mimeType: string) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
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

    const { shot_id, model, aspect_ratio, sensitive_level } = await req.json();
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

    const rawPrompt = shot.prompt_export || shot.description;
    if (!rawPrompt) throw new Error("No prompt available for this shot");

    // Apply sensitive mode transformation to the prompt
    const prompt = transformPromptForSensitiveMode(rawPrompt, sensitive_level);

    const buildPrompt = (text: string) => [
      "Generate one single cinematic image.",
      `Mandatory aspect ratio: ${selectedAspectRatio}.`,
      "Compose the framing to work natively in that ratio without letterboxing or white borders.",
      text,
    ].join("\n");

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
    const promptVariants = [buildPrompt(prompt), buildPrompt(sanitizePrompt(prompt))];

    for (let variantIdx = 0; variantIdx < promptVariants.length && !imageData; variantIdx++) {
      const currentPrompt = promptVariants[variantIdx];
      const retries = variantIdx === 0 ? 1 : MAX_RETRIES; // Only 1 try for original, 3 for sanitized

      for (let attempt = 1; attempt <= retries; attempt++) {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + LOVABLE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: "user", content: currentPrompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error(`AI error (variant ${variantIdx}, attempt ${attempt}):`, aiResponse.status, errText);
          if (aiResponse.status === 429) throw new Error("Rate limit exceeded, please try again later");
          if (aiResponse.status === 402) throw new Error("Payment required, please add credits");
          if (aiResponse.status >= 500 && attempt < retries) {
            await new Promise((r) => setTimeout(r, attempt * 3000));
            continue;
          }
          if (aiResponse.status >= 500) break; // try next variant
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