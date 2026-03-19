import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "jsr:@matmen/imagescript";

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

  // Only crop, never upscale — keeps file size small
  if (Math.abs(srcAR - targetAR) > 0.01) {
    if (srcAR > targetAR) {
      const cw = Math.max(1, Math.round(origH * targetAR));
      decoded.crop(Math.floor((origW - cw) / 2), 0, cw, origH);
    } else {
      const ch = Math.max(1, Math.round(origW / targetAR));
      decoded.crop(0, Math.floor((origH - ch) / 2), origW, ch);
    }
  }

  console.log("Cropped image", { aspectRatio, origW, origH, outW: decoded.width, outH: decoded.height });
  const bytes = await decoded.encode(1);
  return { bytes, mimeType: "image/png" as const, extension: "png" as const, width: decoded.width, height: decoded.height };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) throw new Error("Unauthorized");

    const { shot_id, model, aspect_ratio } = await req.json();
    if (!shot_id) throw new Error("Missing shot_id");

    const selectedModel = ALLOWED_MODELS.includes(model)
      ? model
      : "google/gemini-2.5-flash-image";
    const selectedAspectRatio = Object.keys(ASPECT_RATIO_DIMENSIONS).includes(aspect_ratio)
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

    const prompt = shot.prompt_export || shot.description;
    if (!prompt) throw new Error("No prompt available for this shot");

    const fullPrompt = [
      "Generate one single cinematic image.",
      `Mandatory aspect ratio: ${selectedAspectRatio}.`,
      `Mandatory output canvas: exactly ${target.width}x${target.height} pixels.`,
      `The final image must fully fill a ${selectedAspectRatio} frame and must not be square unless the ratio is 1:1.`,
      "Compose the framing to work natively in that canvas without letterboxing or white borders.",
      prompt,
    ].join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const MAX_RETRIES = 3;
    let aiResponse: Response | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + LOVABLE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (aiResponse.ok) break;

      const errText = await aiResponse.text();
      console.error(`AI error (attempt ${attempt}/${MAX_RETRIES}):`, aiResponse.status, errText);

      if (aiResponse.status === 429) throw new Error("Rate limit exceeded, please try again later");
      if (aiResponse.status === 402) throw new Error("Payment required, please add credits");

      if (aiResponse.status >= 500 && attempt < MAX_RETRIES) {
        const delay = attempt * 3000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw new Error("AI gateway error");
    }

    if (!aiResponse || !aiResponse.ok) throw new Error("AI gateway error after retries");

    const aiData = await aiResponse.json();
    console.log("AI response keys:", JSON.stringify(Object.keys(aiData)));
    const msg = aiData.choices?.[0]?.message;
    if (msg) {
      console.log("Message keys:", JSON.stringify(Object.keys(msg)));
      if (msg.content) {
        const contentPreview = typeof msg.content === "string"
          ? msg.content.substring(0, 200)
          : JSON.stringify(msg.content).substring(0, 200);
        console.log("Content preview:", contentPreview);
      }
      if (msg.images) console.log("Images structure:", JSON.stringify(msg.images).substring(0, 300));
    }

    // Try multiple known response formats
    let imageData: string | undefined;
    // Format 1: images array
    imageData = msg?.images?.[0]?.image_url?.url;
    // Format 2: content array with image parts
    if (!imageData && Array.isArray(msg?.content)) {
      const imagePart = msg.content.find((p: any) => p.type === "image_url" || p.type === "image");
      imageData = imagePart?.image_url?.url || imagePart?.url || imagePart?.image?.url;
    }
    // Format 3: inline_data in content parts
    if (!imageData && Array.isArray(msg?.content)) {
      const inlinePart = msg.content.find((p: any) => p.inline_data?.mime_type?.startsWith("image/"));
      if (inlinePart?.inline_data) {
        imageData = `data:${inlinePart.inline_data.mime_type};base64,${inlinePart.inline_data.data}`;
      }
    }

    if (!imageData) {
      console.error("Full AI response:", JSON.stringify(aiData).substring(0, 1000));
      throw new Error("No image generated");
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

    const { error: updateErr } = await supabase
      .from("shots")
      .update({ image_url: imageUrl, generation_cost: newTotalCost })
      .eq("id", shot_id);

    if (updateErr) throw new Error("Failed to update shot");

    return new Response(
      JSON.stringify({
        image_url: imageUrl,
        generation_cost: newTotalCost,
        last_generation_cost: Number(exactOrFallbackCost.toFixed(4)),
        requested_aspect_ratio: selectedAspectRatio,
        actual_dimensions: `${normalizedImage.width}x${normalizedImage.height}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("generate-shot-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});