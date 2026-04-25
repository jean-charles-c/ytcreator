import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { transformPromptForSensitiveMode, extractAnchorsFromScene } from "../_shared/sensitive-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KIE_BASE_URL = "https://api.kie.ai/api/v1";

const ASPECT_RATIOS_KIE: Record<string, string> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "1:1": "1:1",
  "4:3": "4:3",
  "3:2": "3:2",
  "3:4": "3:4",
  "2:3": "2:3",
};

// Map quality => pixel size (longest side)
const QUALITY_TO_SIZE: Record<string, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096,
};

// Map our internal model_id => Kie API model parameter
const MODEL_TO_KIE_MODEL: Record<string, string> = {
  // Kie market models use slash-namespaced identifiers on /jobs/createTask
  "gpt-image-2":  "gpt-image-2/text-to-image",
  "ideogram-v3":  "ideogram/v3-text-to-image",
  "imagen-4":     "google/imagen4",
  "grok-imagine": "grok-imagine/text-to-image",
  "qwen-image":   "qwen/text-to-image",
  "flux-2-flex":  "flux-2/flex-text-to-image",
  "flux-2-pro":   "flux-2/pro-text-to-image",
  // Midjourney still uses its dedicated /mj/generate endpoint
  "mj-v7":        "mj-v7",
};

// Object types that should use --oref (identity lock) vs --sref (style transfer) on Midjourney
const OREF_OBJECT_TYPES = new Set(["personnage", "character", "vehicule", "vehicle", "véhicule"]);
const SREF_OBJECT_TYPES = new Set(["lieu", "location", "place", "objet", "object", "ambiance", "mood"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Submit a generation task to Kie. Returns taskId.
 */
async function submitKieTask(params: {
  apiKey: string;
  endpointPath: string;
  modelKey: string;
  prompt: string;
  aspectRatio: string;
  size: number;
  referenceImages: string[];
  orefImages: string[];
  srefImages: string[];
  isMidjourney: boolean;
}): Promise<string> {
  const { apiKey, endpointPath, modelKey, prompt, aspectRatio, size, referenceImages, orefImages, srefImages, isMidjourney } = params;

  let body: Record<string, any>;

  if (isMidjourney) {
    // Midjourney via Kie /mj/generate
    let mjPrompt = prompt;
    // Append --oref / --sref params
    for (const url of orefImages) mjPrompt += ` --oref ${url} --ow 100`;
    for (const url of srefImages) mjPrompt += ` --sref ${url} --sw 200`;

    body = {
      prompt: mjPrompt,
      taskType: "mj_txt2img",
      // Kie Midjourney API requires a lowercase speed tier.
      // Omitting it can return: "The speed parameter is incorrect."
      speed: "relaxed",
      aspectRatio,
      version: "7",
    };
  } else {
    // Generic /jobs/createTask payload (Kie unified market API)
    const input: Record<string, any> = {
      prompt,
      aspect_ratio: aspectRatio,
      ...(referenceImages.length > 0 ? { image_urls: referenceImages } : {}),
    };

    // Per-model required parameters
    if (modelKey.startsWith("ideogram/")) {
      // Ideogram requires rendering_speed (TURBO | BALANCED | QUALITY)
      input.rendering_speed = "BALANCED";
    }
    if (modelKey.startsWith("flux-2/")) {
      // Flux 2 supports a quality switch (1K | 2K)
      input.quality = size >= 2048 ? "2K" : "1K";
    }
    if (modelKey === "qwen/text-to-image") {
      // Qwen supports an acceleration switch
      input.acceleration = "regular";
    }

    body = {
      model: modelKey,
      input,
    };
  }

  console.log(`[KIE] POST ${endpointPath}`, JSON.stringify(body).slice(0, 500));

  const resp = await fetch(`${KIE_BASE_URL}${endpointPath}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const txt = await resp.text();
  if (!resp.ok) {
    throw new Error(`Kie task creation failed [${resp.status}]: ${txt.slice(0, 400)}`);
  }

  let json: any;
  try { json = JSON.parse(txt); } catch { throw new Error(`Kie returned non-JSON: ${txt.slice(0, 200)}`); }

  const taskId = json?.data?.taskId || json?.data?.task_id || json?.taskId || json?.task_id;
  if (!taskId) {
    throw new Error(`Kie task creation succeeded but no taskId in response: ${txt.slice(0, 300)}`);
  }
  return String(taskId);
}

/**
 * Poll Kie for task result. Returns final image URL.
 */
async function pollKieTask(apiKey: string, taskId: string, isMidjourney: boolean): Promise<string> {
  const maxAttempts = 60; // ~5 min @ 5s
  const pollPath = isMidjourney ? `/mj/recordInfo` : `/jobs/recordInfo`;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);
    const resp = await fetch(`${KIE_BASE_URL}${pollPath}?taskId=${encodeURIComponent(taskId)}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const txt = await resp.text();
    if (!resp.ok) {
      console.warn(`[KIE poll ${i}] HTTP ${resp.status}: ${txt.slice(0, 200)}`);
      continue;
    }
    let json: any;
    try { json = JSON.parse(txt); } catch { continue; }

    const data = json?.data || {};
    const state = data.state || data.status || data.taskStatus;

    // Kie market API returns resultJson as a STRING containing JSON like
    // {"resultUrls":["https://..."]}. Parse it before reading.
    let parsedResult: any = null;
    if (typeof data.resultJson === "string" && data.resultJson.length > 0) {
      try { parsedResult = JSON.parse(data.resultJson); } catch { /* ignore */ }
    } else if (data.resultJson && typeof data.resultJson === "object") {
      parsedResult = data.resultJson;
    }

    const imageUrl =
      parsedResult?.resultUrls?.[0] ||
      parsedResult?.imageUrl ||
      data?.response?.imageUrl ||
      data?.response?.image_url ||
      data?.imageUrl ||
      data?.image_url ||
      (Array.isArray(data?.resultUrls) ? data.resultUrls[0] : null);

    if (imageUrl) return imageUrl;

    if (state === "success" || state === "SUCCESS" || state === "completed") {
      // Success state but no URL extracted — log full payload for debugging
      console.error(`[KIE poll ${i}] state=success but no imageUrl. data=${JSON.stringify(data).slice(0, 800)}`);
      throw new Error(`Kie task ${taskId} reported success but no image URL was returned`);
    }
    if (state === "fail" || state === "failed" || state === "FAILED" || state === "error") {
      throw new Error(`Kie task failed: ${data?.failMsg || data?.errorMessage || JSON.stringify(data).slice(0, 300)}`);
    }
    console.log(`[KIE poll ${i}] state=${state}`);
  }
  throw new Error("Kie task timed out after 5 minutes");
}

async function checkKieTask(apiKey: string, taskId: string, isMidjourney: boolean): Promise<{ status: "pending" | "success" | "failed"; imageUrl?: string; error?: string }> {
  const pollPath = isMidjourney ? `/mj/recordInfo` : `/jobs/recordInfo`;
  const resp = await fetch(`${KIE_BASE_URL}${pollPath}?taskId=${encodeURIComponent(taskId)}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  const txt = await resp.text();
  if (!resp.ok) return { status: "pending", error: `Kie poll HTTP ${resp.status}: ${txt.slice(0, 200)}` };

  let json: any;
  try { json = JSON.parse(txt); } catch { return { status: "pending", error: "Kie returned non-JSON while polling" }; }
  const data = json?.data || {};
  const state = data.state || data.status || data.taskStatus;

  let parsedResult: any = null;
  if (typeof data.resultJson === "string" && data.resultJson.length > 0) {
    try { parsedResult = JSON.parse(data.resultJson); } catch { /* ignore */ }
  } else if (data.resultJson && typeof data.resultJson === "object") {
    parsedResult = data.resultJson;
  }

  const imageUrl =
    parsedResult?.resultUrls?.[0] ||
    parsedResult?.imageUrl ||
    data?.response?.imageUrl ||
    data?.response?.image_url ||
    data?.imageUrl ||
    data?.image_url ||
    (Array.isArray(data?.resultUrls) ? data.resultUrls[0] : null);

  if (imageUrl) return { status: "success", imageUrl };
  if (state === "success" || state === "SUCCESS" || state === "completed") {
    return { status: "failed", error: `Kie task ${taskId} reported success but no image URL was returned` };
  }
  if (state === "fail" || state === "failed" || state === "FAILED" || state === "error") {
    return { status: "failed", error: data?.failMsg || data?.errorMessage || JSON.stringify(data).slice(0, 300) };
  }
  return { status: "pending" };
}

/**
 * Download Kie image, upload to shot-images bucket, return public URL.
 */
async function rehostImage(supabase: any, imageUrl: string, projectId: string, shotId: string): Promise<string> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Failed to download Kie image: ${resp.status}`);
  const contentType = resp.headers.get("content-type")?.split(";")[0] || "image/png";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const path = `${projectId}/${shotId}-kie-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("shot-images")
    .upload(path, bytes, { contentType, upsert: true });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
  const { data } = supabase.storage.from("shot-images").getPublicUrl(path);
  return data.publicUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { shot_id, model, quality, aspect_ratio, sensitive_level, custom_prompt, mode, task_id } = await req.json();
    if (!shot_id) throw new Error("Missing shot_id");
    if (!model && mode !== "poll") throw new Error("Missing model");

    const selectedQuality = ["1K", "2K", "4K"].includes(quality) ? quality : "1K";
    const selectedAspectRatio = ASPECT_RATIOS_KIE[aspect_ratio] || "16:9";
    const size = QUALITY_TO_SIZE[selectedQuality];

    if (mode === "poll") {
      if (!task_id) throw new Error("Missing task_id");
      const isMidjourneyPoll = model === "mj-v7";
      const { data: shot, error: shotErr } = await supabase
        .from("shots").select("id, project_id, generation_cost").eq("id", shot_id).single();
      if (shotErr || !shot) throw new Error("Shot not found");
      const { data: project } = await supabase
        .from("projects").select("id").eq("id", shot.project_id).eq("user_id", user.id).single();
      if (!project) throw new Error("Unauthorized");

      const result = await checkKieTask(KIE_API_KEY, String(task_id), isMidjourneyPoll);
      if (result.status === "pending") {
        return new Response(JSON.stringify({ status: "pending", provider: "kie" }), {
          status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (result.status === "failed" || !result.imageUrl) throw new Error(result.error || "Kie task failed");

      const finalUrl = await rehostImage(supabase, result.imageUrl, shot.project_id, shot_id);
      await supabase.from("shots").update({ image_url: finalUrl }).eq("id", shot_id);
      return new Response(JSON.stringify({ success: true, image_url: finalUrl, status: "success", provider: "kie" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup pricing & endpoint
    const { data: pricingRow, error: priceErr } = await supabase
      .from("kie_pricing")
      .select("model_id, model_label, price_usd, endpoint_path, supports_oref, supports_sref")
      .eq("model_id", model)
      .eq("quality", selectedQuality)
      .eq("is_active", true)
      .maybeSingle();
    if (priceErr || !pricingRow) {
      throw new Error(`Model "${model}" with quality "${selectedQuality}" not found in kie_pricing`);
    }

    const modelKey = MODEL_TO_KIE_MODEL[model] || model;
    const isMidjourney = model === "mj-v7";

    // Load shot + project ownership check
    const { data: shot, error: shotErr } = await supabase
      .from("shots").select("*").eq("id", shot_id).single();
    if (shotErr || !shot) throw new Error("Shot not found");

    const { data: project } = await supabase
      .from("projects").select("id").eq("id", shot.project_id).eq("user_id", user.id).single();
    if (!project) throw new Error("Unauthorized");

    // Scene context for sensitive anchoring
    let sceneContextAnchors = null;
    if (sensitive_level && sensitive_level >= 1) {
      const { data: scene } = await supabase
        .from("scenes").select("scene_context, location, visual_intention")
        .eq("id", shot.scene_id).single();
      if (scene) {
        sceneContextAnchors = extractAnchorsFromScene(
          scene.scene_context as Record<string, any> | null,
          { location: scene.location ?? undefined, visual_intention: scene.visual_intention ?? undefined },
        );
      }
    }

    // Recurring objects linked to this shot
    const { data: scriptState } = await supabase
      .from("project_scriptcreator_state").select("global_context")
      .eq("project_id", shot.project_id).maybeSingle();
    const globalContext = scriptState?.global_context as Record<string, any> | null;
    const recurringObjects = Array.isArray(globalContext?.objets_recurrents) ? globalContext.objets_recurrents : [];
    const shotLinkedObjects = recurringObjects.filter((obj: any) =>
      Array.isArray(obj.mentions_shots) && obj.mentions_shots.includes(shot_id)
    );

    // Build prompt
    let enrichedPrompt: string;
    if (typeof custom_prompt === "string" && custom_prompt.trim().length > 0) {
      enrichedPrompt = custom_prompt.trim();
    } else {
      let rawPrompt: string;
      if (shot.prompt_export && shot.description && shot.description.length > 30) {
        const descSnippet = shot.description.slice(0, 60).toLowerCase();
        rawPrompt = shot.prompt_export.toLowerCase().includes(descSnippet)
          ? shot.prompt_export
          : shot.prompt_export + "\n\nDETAILED VISUAL DESCRIPTION:\n" + shot.description;
      } else {
        rawPrompt = shot.prompt_export || shot.description;
      }
      if (!rawPrompt) throw new Error("No prompt available for this shot");
      enrichedPrompt = transformPromptForSensitiveMode(rawPrompt, sensitive_level, sceneContextAnchors);

      // Inject identity locks
      const identityLocks = shotLinkedObjects
        .map((obj: any) => obj.identity_prompt || "")
        .filter(Boolean);
      if (identityLocks.length > 0) {
        enrichedPrompt = identityLocks.join("\n\n") + "\n\n" + enrichedPrompt;
      }
    }

    // Kie market models cap prompts at 2000 chars (some at 5000). Stay safe at 1900.
    const KIE_PROMPT_MAX = 1900;
    if (enrichedPrompt.length > KIE_PROMPT_MAX) {
      console.warn(`[KIE] Prompt truncated from ${enrichedPrompt.length} to ${KIE_PROMPT_MAX} chars`);
      enrichedPrompt = enrichedPrompt.slice(0, KIE_PROMPT_MAX - 3) + "...";
    }

    // Collect reference images and split by type for MJ omni-reference
    const allRefImages: string[] = [];
    const orefImages: string[] = [];
    const srefImages: string[] = [];
    for (const obj of shotLinkedObjects) {
      if (!Array.isArray(obj.reference_images)) continue;
      const objType = String(obj.type || obj.object_type || "").toLowerCase();
      const useOref = OREF_OBJECT_TYPES.has(objType);
      const useSref = SREF_OBJECT_TYPES.has(objType);
      for (const url of obj.reference_images) {
        if (typeof url !== "string" || !url.startsWith("http")) continue;
        allRefImages.push(url);
        if (isMidjourney) {
          if (useOref && pricingRow.supports_oref) orefImages.push(url);
          else if (useSref && pricingRow.supports_sref) srefImages.push(url);
          else srefImages.push(url); // fallback
        }
      }
    }

    // Cap refs (Kie has limits per model)
    const cappedRefs = allRefImages.slice(0, 4);
    const cappedOref = orefImages.slice(0, 1); // MJ supports only 1 --oref
    const cappedSref = srefImages.slice(0, 3);

    console.log(`[KIE] Generating shot ${shot_id} with ${model} @${selectedQuality}, refs=${cappedRefs.length} oref=${cappedOref.length} sref=${cappedSref.length}`);
    const startTime = Date.now();

    // Submit & poll
    const taskId = await submitKieTask({
      apiKey: KIE_API_KEY,
      endpointPath: pricingRow.endpoint_path,
      modelKey,
      prompt: enrichedPrompt,
      aspectRatio: selectedAspectRatio,
      size,
      referenceImages: cappedRefs,
      orefImages: cappedOref,
      srefImages: cappedSref,
      isMidjourney,
    });

    const kieImageUrl = await pollKieTask(KIE_API_KEY, taskId, isMidjourney);
    const finalUrl = await rehostImage(supabase, kieImageUrl, shot.project_id, shot_id);
    const elapsedMs = Date.now() - startTime;

    const cost = Number(pricingRow.price_usd) || 0;
    console.log(`[KIE COST_AUDIT] shot=${shot_id} model=${model} quality=${selectedQuality} cost=${cost} elapsedMs=${elapsedMs}`);

    // Update shot with new image and cost
    await supabase
      .from("shots")
      .update({
        image_url: finalUrl,
        generation_cost: (Number(shot.generation_cost) || 0) + cost,
      })
      .eq("id", shot_id);

    return new Response(
      JSON.stringify({
        success: true,
        image_url: finalUrl,
        model,
        quality: selectedQuality,
        cost_usd: cost,
        elapsed_ms: elapsedMs,
        provider: "kie",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("generate-shot-image-kie error:", message);
    return new Response(
      JSON.stringify({ error: message, provider: "kie" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});