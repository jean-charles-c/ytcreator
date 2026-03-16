import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL_COSTS: Record<string, number> = {
  "google/gemini-2.5-flash-image": 0.02,
  "google/gemini-3.1-flash-image-preview": 0.06,
  "google/gemini-3-pro-image-preview": 0.10,
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { shot_id, model, aspect_ratio } = await req.json();
    if (!shot_id) throw new Error("Missing shot_id");

    const ALLOWED_MODELS = [
      "google/gemini-2.5-flash-image",
      "google/gemini-3.1-flash-image-preview",
      "google/gemini-3-pro-image-preview",
    ];
    const selectedModel = ALLOWED_MODELS.includes(model) ? model : "google/gemini-2.5-flash-image";
    const selectedAspectRatio = ["16:9", "9:16", "1:1", "4:3", "3:2", "3:4", "2:3"].includes(aspect_ratio) ? aspect_ratio : "16:9";
    const cost = MODEL_COSTS[selectedModel] ?? 1;

    // Fetch the shot
    const { data: shot, error: shotErr } = await supabase
      .from("shots")
      .select("*")
      .eq("id", shot_id)
      .single();
    if (shotErr || !shot) throw new Error("Shot not found");

    // Verify ownership
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", shot.project_id)
      .eq("user_id", user.id)
      .single();
    if (!project) throw new Error("Unauthorized");

    const prompt = shot.prompt_export || shot.description;
    if (!prompt) throw new Error("No prompt available for this shot");
    const ASPECT_RATIO_DIMENSIONS: Record<string, string> = {
      "16:9": "1920x1080",
      "9:16": "1080x1920",
      "1:1": "1024x1024",
      "4:3": "1440x1080",
      "3:2": "1620x1080",
      "3:4": "1080x1440",
      "2:3": "1080x1620",
    };
    const dimensions = ASPECT_RATIO_DIMENSIONS[selectedAspectRatio] || "1920x1080";
    const fullPrompt = `Generate an image with exact ${selectedAspectRatio} aspect ratio (${dimensions} pixels). The image MUST be wider than tall for landscape ratios or taller than wide for portrait ratios. ${prompt}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: "user", content: fullPrompt }],
          modalities: ["image", "text"],
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) throw new Error("Rate limit exceeded, please try again later");
      if (aiResponse.status === 402) throw new Error("Payment required, please add credits");
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageData) throw new Error("No image generated");

    const base64Match = imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!base64Match) throw new Error("Invalid image data format");

    const imageFormat = base64Match[1] === "jpg" ? "jpeg" : base64Match[1];
    const base64Content = base64Match[2];
    const imageBytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));

    const filePath = `${shot.project_id}/${shot.id}.${imageFormat === "jpeg" ? "jpg" : imageFormat}`;

    const { error: uploadError } = await supabase.storage
      .from("shot-images")
      .upload(filePath, imageBytes, {
        contentType: `image/${imageFormat}`,
        upsert: true,
      });
    if (uploadError) throw new Error("Failed to upload image");

    const { data: publicUrlData } = supabase.storage
      .from("shot-images")
      .getPublicUrl(filePath);

    const imageUrl = publicUrlData.publicUrl + `?t=${Date.now()}`;

    // Accumulate cost
    const previousCost = typeof shot.generation_cost === "number" ? shot.generation_cost : 0;
    const newTotalCost = previousCost + cost;

    const { error: updateErr } = await supabase
      .from("shots")
      .update({ image_url: imageUrl, generation_cost: newTotalCost })
      .eq("id", shot_id);
    if (updateErr) throw new Error("Failed to update shot");

    return new Response(JSON.stringify({ image_url: imageUrl, generation_cost: newTotalCost }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-shot-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
