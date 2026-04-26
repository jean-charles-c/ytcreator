import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { transformPromptForSensitiveMode, extractAnchorsFromScene } from "../_shared/sensitive-mode.ts";
import { stripLegacyIdentityLockPrefix } from "../_shared/identity-lock-utils.ts";
import { getStyleSuffix } from "../_shared/visual-styles.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kie-async, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KIE_BASE_URL = "https://api.kie.ai/api/v1";

const DEPRECATED_KIE_MODELS: Record<string, string> = {
  "mj-v7": "Midjourney v7 n'est plus listé dans la documentation Kie actuelle. Choisis GPT Image 2, Imagen 4, Flux 2, Ideogram, Grok ou Qwen.",
};

const ASPECT_RATIOS_KIE: Record<string, string> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "1:1": "1:1",
  "4:3": "4:3",
  "3:2": "3:2",
  "3:4": "3:4",
  "2:3": "2:3",
};

const ASPECT_RATIO_VALUES: Record<string, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "3:4": 3 / 4,
  "2:3": 2 / 3,
};

/**
 * Force the exact aspect ratio by center-cropping. Some Kie models (notably
 * google/nano-banana, ideogram) ignore the requested aspect_ratio and return
 * 1:1 or near-square images. We crop to guarantee the user-requested ratio.
 */
async function enforceAspectRatio(bytes: Uint8Array, aspectRatio: string): Promise<{ bytes: Uint8Array; mimeType: string; ext: string }> {
  const targetAR = ASPECT_RATIO_VALUES[aspectRatio] ?? ASPECT_RATIO_VALUES["16:9"];
  try {
    const decoded = await Image.decode(bytes);
    const origW = decoded.width;
    const origH = decoded.height;
    const srcAR = origW / origH;
    if (Math.abs(srcAR - targetAR) > 0.01) {
      if (srcAR > targetAR) {
        const cw = Math.max(1, Math.round(origH * targetAR));
        decoded.crop(Math.floor((origW - cw) / 2), 0, cw, origH);
      } else {
        const ch = Math.max(1, Math.round(origW / targetAR));
        decoded.crop(0, Math.floor((origH - ch) / 2), origW, ch);
      }
    }
    const MAX_DIM = 1280;
    if (decoded.width > MAX_DIM || decoded.height > MAX_DIM) {
      const scale = MAX_DIM / Math.max(decoded.width, decoded.height);
      decoded.resize(Math.max(1, Math.round(decoded.width * scale)), Math.max(1, Math.round(decoded.height * scale)));
    }
    console.log(`[KIE] Aspect-ratio crop: ${origW}x${origH} -> ${decoded.width}x${decoded.height} (target ${aspectRatio})`);
    const out = await decoded.encodeJPEG(85);
    return { bytes: out, mimeType: "image/jpeg", ext: "jpg" };
  } catch (err) {
    console.warn(`[KIE] Aspect-ratio enforcement failed, keeping original: ${(err as Error).message}`);
    return { bytes, mimeType: "image/png", ext: "png" };
  }
}

// Map quality => pixel size (longest side)
const QUALITY_TO_SIZE: Record<string, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096,
};

  // Map our internal model_id => Kie API model parameter
const MODEL_TO_KIE_MODEL: Record<string, string> = {
  // Kie market models use slash-namespaced identifiers on /jobs/createTask
  "gpt-image-2":  "gpt-image-2-text-to-image",
  "ideogram-v3":  "ideogram/v3-text-to-image",
  "imagen-4":     "google/imagen4",
  "grok-imagine": "grok-imagine/text-to-image",
  "qwen-image":   "qwen/text-to-image",
  "flux-2-flex":  "flux-2/flex-text-to-image",
  "flux-2-pro":   "flux-2/pro-text-to-image",
  // Seedream family (ByteDance)
  "seedream-3":      "bytedance/seedream",
  "seedream-4":      "bytedance/seedream-v4-text-to-image",
  "seedream-4-5":    "seedream/4.5-text-to-image",
  "seedream-5-lite": "seedream/5-lite-text-to-image",
  // Z-Image (low cost)
  "z-image":         "z-image",
  // Google Nano Banana family
  "nano-banana":     "google/nano-banana",
  "nano-banana-2":   "nano-banana-2",
  "nano-banana-pro": "nano-banana-pro",
  // Qwen Image 2.0
  "qwen2-image":     "qwen2/text-to-image",
  // Wan 2.7
  "wan-2-7":         "wan/2-7-image",
  "wan-2-7-pro":     "wan/2-7-image-pro",
  // OpenAI GPT Image 1.5
  "gpt-image-1-5":   "gpt-image/1.5-text-to-image",
  // Google Imagen 4 variants
  "imagen-4-fast":   "google/imagen4-fast",
  "imagen-4-ultra":  "google/imagen4-ultra",
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

function parseMaybeJson(value: unknown): any {
  if (typeof value === "string" && value.trim().length > 0) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function firstImageUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.startsWith("http") ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstImageUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (typeof value === "object") {
    const data = value as Record<string, unknown>;
    return firstImageUrl(data.resultUrl) ||
      firstImageUrl(data.url) ||
      firstImageUrl(data.imageUrl) ||
      firstImageUrl(data.image_url) ||
      firstImageUrl(data.resultUrls) ||
      firstImageUrl(data.urls) ||
      firstImageUrl(data.images) ||
      firstImageUrl(data.output) ||
      firstImageUrl(data.outputs);
  }
  return null;
}

function parseKieTaskData(data: any) {
  const state = String(data?.state || data?.status || data?.taskStatus || "").toLowerCase();
  const successFlag = Number(data?.successFlag);
  const resultJson = parseMaybeJson(data?.resultJson);
  const resultInfoJson = parseMaybeJson(data?.resultInfoJson);
  const imageUrl = firstImageUrl(resultInfoJson) || firstImageUrl(resultJson) || firstImageUrl(data?.response) || firstImageUrl(data);
  const failed = state === "fail" || state === "failed" || state === "error" || successFlag === 2 || successFlag === 3;
  const succeeded = Boolean(imageUrl) || state === "success" || state === "completed" || successFlag === 1;
  const error = data?.failMsg || data?.errorMessage || data?.error || data?.message;
  return { state, successFlag, imageUrl, failed, succeeded, error };
}

/**
 * Poll Kie for task result. Returns final image URL.
 */
async function pollKieTask(apiKey: string, taskId: string, isMidjourney: boolean): Promise<string> {
  // Edge runtime kills functions around ~150s wall-time. Cap polling at ~110s
  // (22 attempts × 5s) so we can still return a clean error to the client.
  const maxAttempts = 22;
  const pollPath = isMidjourney ? `/mj/record-info` : `/jobs/recordInfo`;

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
    const parsed = parseKieTaskData(data);
    if (parsed.imageUrl) return parsed.imageUrl;

    if (parsed.succeeded) {
      // Success state but no URL extracted — log full payload for debugging
      console.error(`[KIE poll ${i}] state=success but no imageUrl. data=${JSON.stringify(data).slice(0, 800)}`);
      throw new Error(`Kie task ${taskId} reported success but no image URL was returned`);
    }
    if (parsed.failed) {
      throw new Error(`Kie task failed: ${parsed.error || JSON.stringify(data).slice(0, 300)}`);
    }
    console.log(`[KIE poll ${i}] state=${parsed.state || "unknown"} successFlag=${Number.isFinite(parsed.successFlag) ? parsed.successFlag : "none"}`);
  }
  throw new Error("KIE_TIMEOUT_SYNC");
}

async function checkKieTask(apiKey: string, taskId: string, isMidjourney: boolean): Promise<{ status: "pending" | "success" | "failed"; imageUrl?: string; error?: string }> {
  const pollPath = isMidjourney ? `/mj/record-info` : `/jobs/recordInfo`;
  const resp = await fetch(`${KIE_BASE_URL}${pollPath}?taskId=${encodeURIComponent(taskId)}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  const txt = await resp.text();
  if (!resp.ok) return { status: "pending", error: `Kie poll HTTP ${resp.status}: ${txt.slice(0, 200)}` };

  let json: any;
  try { json = JSON.parse(txt); } catch { return { status: "pending", error: "Kie returned non-JSON while polling" }; }
  const data = json?.data || {};
  const parsed = parseKieTaskData(data);

  if (parsed.imageUrl) return { status: "success", imageUrl: parsed.imageUrl };
  if (parsed.succeeded) {
    return { status: "failed", error: `Kie task ${taskId} reported success but no image URL was returned` };
  }
  if (parsed.failed) {
    return { status: "failed", error: parsed.error || JSON.stringify(data).slice(0, 300) };
  }
  return { status: "pending" };
}

/**
 * Download Kie image, upload to shot-images bucket, return public URL.
 */
async function rehostImage(supabase: any, imageUrl: string, projectId: string, shotId: string, aspectRatio: string): Promise<string> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Failed to download Kie image: ${resp.status}`);
  const rawBytes = new Uint8Array(await resp.arrayBuffer());
  const normalized = await enforceAspectRatio(rawBytes, aspectRatio);
  const path = `${projectId}/${shotId}-kie-${Date.now()}.${normalized.ext}`;
  const { error: upErr } = await supabase.storage
    .from("shot-images")
    .upload(path, normalized.bytes, { contentType: normalized.mimeType, upsert: true });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
  const { data } = supabase.storage.from("shot-images").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Soften a prompt to reduce the chance of triggering Google's safety filters.
 * Replaces explicit injury / violence wording with neutral, documentary-style equivalents.
 */
function sanitizePromptForSafety(text: string): string {
  const sanitized = text
    // English
    .replace(/\b(blood|bloody|gore|gory|murder|kill(?:ed|ing)?|dead\s+body|corpse|skull|death|wound(?:ed)?|injur(?:y|ed|ies)|burn(?:ing|ed|t)?|burn\s+mark|cut|gash|scar|bruise|swollen)\b/gi, "mark")
    // French (the prompts are FR)
    .replace(/\bbr[ûu]l(?:ure|ures|é|ée|és|ées|ant|ante|er)\b/gi, "marque rougie")
    .replace(/\bcoupure(?:s)?\b/gi, "petite marque")
    .replace(/\bblessure(?:s)?\b/gi, "marque")
    .replace(/\bbless[ée](?:e|s|es)?\b/gi, "marqué")
    .replace(/\bplaie(?:s)?\b/gi, "marque")
    .replace(/\bsang|sanglant(?:e|s|es)?\b/gi, "")
    .replace(/\bdouleur(?:s)?\b/gi, "tension")
    .replace(/\bsouffrance(?:s)?\b/gi, "tension")
    .replace(/\bpeau\s+rougie\b/gi, "teinte rosée")
    .replace(/\bcicatrice(?:s)?\b/gi, "trace")
    .replace(/\bmort(?:s|e|es)?\b/gi, "silencieux")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `Stylized cinematic documentary illustration, tasteful and non-graphic. ${sanitized}`;
}

/**
 * Aggressive fallback sanitizer used as a last resort when the soft
 * sanitization is still blocked by Google's safety filters. Strips emotional
 * tension, conflict and chaos vocabulary that can be misinterpreted as
 * harmful content, and forces a calm, neutral framing.
 */
function ultraNeutralPrompt(text: string): string {
  const sanitized = sanitizePromptForSafety(text)
    // Stress / tension / chaos vocabulary (FR)
    .replace(/\bstress[ée]?(?:e|s|es)?\b/gi, "concentré")
    .replace(/\bchaotique(?:s)?\b/gi, "animée")
    .replace(/\bchaos\b/gi, "activité")
    .replace(/\bpanique(?:r|s)?\b/gi, "attention")
    .replace(/\battaqu(?:e|er|é|ée|és|ées)\b/gi, "approche")
    .replace(/\bagress(?:if|ive|ion|er|é|ée)\b/gi, "vif")
    .replace(/\bviolen(?:t|te|ce|ces)\b/gi, "intense")
    .replace(/\bdanger(?:eux|euse)?\b/gi, "délicat")
    .replace(/\btendu(?:e|s|es)?\b/gi, "calme")
    .replace(/\btension(?:s)?\b/gi, "atmosphère")
    .replace(/\bcris?\b/gi, "voix")
    .replace(/\bd[ée]sordre\b/gi, "mouvement")
    .replace(/\bperturbation(?:s)?\b/gi, "léger décalage")
    .replace(/\bdysfonctionnement(?:s)?\b/gi, "détail mécanique")
    .replace(/\bavarie(?:s)?\b/gi, "détail mécanique")
    .replace(/\bparalys(?:ant|ante|er|é|ée)\b/gi, "immobile")
    // English equivalents
    .replace(/\b(stress(?:ed|ful)?|chaotic|chaos|panic|attack(?:ing|ed)?|aggressive|violent|violence|dangerous|tense|tension|scream|screaming|shout(?:ing)?)\b/gi, "calm")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `Calm, neutral, family-friendly cinematic illustration. Peaceful documentary still frame. ${sanitized}`;
}

function isSafetyError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("filtered out") ||
    m.includes("prohibited use") ||
    m.includes("safety") ||
    m.includes("no images found in ai response")
  );
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

    const { shot_id, model, quality, aspect_ratio, sensitive_level, visual_style, custom_prompt, mode, task_id, kie_async } = await req.json();
    if (!shot_id) throw new Error("Missing shot_id");
    if (!model && mode !== "poll") throw new Error("Missing model");

    if (typeof model === "string" && DEPRECATED_KIE_MODELS[model]) {
      return new Response(JSON.stringify({ error: DEPRECATED_KIE_MODELS[model], provider: "kie", deprecated: true }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

      const finalUrl = await rehostImage(supabase, result.imageUrl, shot.project_id, shot_id, selectedAspectRatio);
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

    // Detect tight framings (close-up / insert / macro / detail). For these
    // the location/place is not visible in the frame, so we drop LOCATION
    // identity locks AND we don't pass the location reference image — both
    // would push the model to render an establishing shot of the place
    // (sometimes even baking the location's name into the image as text)
    // instead of the requested detail.
    const tightFramingRegex = /\b(gros\s*plan|tr[èe]s\s+gros\s+plan|plan\s+de\s+d[ée]tail|insert|macro|close[\s-]?up|extreme\s+close[\s-]?up|ecu|cu\b|detail\s+shot)\b/i;
    const promptText = `${shot.description || ""} ${shot.prompt_export || ""}`;
    const isTightFraming = tightFramingRegex.test(promptText);
    // Detect "object-only" inserts (metaphor / mechanism / texture close-ups)
    // where NO character is visible in the frame. In those cases we must also
    // drop CHARACTER identity locks — otherwise the model anchors on the
    // character and renders them instead of the requested object.
    const characterMentionRegex = /\b(chef|chefs|personnage|personnages|visage|visages|portrait|silhouette|silhouettes|homme|hommes|femme|femmes|enfant|enfants|cuisinier|cuisini[èe]re|cuisiniers|serveur|serveuse|serveurs|client|clients|main|mains|doigt|doigts|bras|jambe|jambes|pied|pieds|t[êe]te|character|characters|person|people|hand|hands|face|faces|finger|fingers|arm|arms|leg|legs|foot|feet|head|heads|man|men|woman|women|child|children|cook|cooks|waiter|waitress|customer|customers)\b/i;
    const hasCharacterMention = characterMentionRegex.test(promptText);
    // Metaphorical / symbolic prompts: even when a character word is present,
    // it's used as narrative reference and should not anchor the frame.
    const metaphoricalRegex = /\b(m[ée]taphor[ie]\w*|symbolis\w*|symbolique|symbole|[ée]voqu\w*|sugg[èe]r\w*|allegor\w*|repr[ée]sentation\s+de|metaphor\w*|symboliz\w*|symbolic|allegor\w*|evok\w*|suggest\w*)\b/i;
    const isMetaphoricalPrompt = metaphoricalRegex.test(promptText);
    // Manual override stored on the shot row.
    const forceNoCharacter = (shot as any).force_no_character === true;
    const isObjectOnlyInsert =
      forceNoCharacter ||
      // A shot is treated as an "object-only insert" (drop CHARACTER locks)
      // ONLY when no character is actually visible in the frame. If the
      // prompt explicitly mentions the character (face, hands, silhouette,
      // chef, etc.), keep the character identity lock + reference images
      // even when the framing is tight or the prompt uses a metaphorical
      // wording — the character IS the subject of the frame.
      (isTightFraming && !hasCharacterMention);
    const effectiveLinkedObjects = (isTightFraming || isObjectOnlyInsert)
      ? shotLinkedObjects.filter((obj: any) => {
          const t = String(obj.type || obj.object_type || "").toLowerCase();
          if (isTightFraming && (t === "lieu" || t === "location" || t === "place")) return false;
          if (isObjectOnlyInsert && (t === "character" || t === "personnage" || t === "person" || t === "people")) return false;
          return true;
        })
      : shotLinkedObjects;
    if (effectiveLinkedObjects.length < shotLinkedObjects.length) {
      console.log(
        `[KIE] tight=${isTightFraming} objectOnly=${isObjectOnlyInsert} metaphor=${isMetaphoricalPrompt} forceNoChar=${forceNoCharacter} — dropped ${shotLinkedObjects.length - effectiveLinkedObjects.length} identity lock(s).`,
      );
    }

    // Build prompt
    let enrichedPrompt: string;
    const usingCustomPrompt = typeof custom_prompt === "string" && custom_prompt.trim().length > 0;
    if (usingCustomPrompt) {
      enrichedPrompt = custom_prompt.trim();
    } else {
      let rawPrompt: string;
      if (shot.prompt_export && shot.description && shot.description.length > 30) {
        const descSnippet = shot.description.slice(0, 60).toLowerCase();
        rawPrompt = shot.prompt_export.toLowerCase().includes(descSnippet)
          ? shot.prompt_export
          : "DETAILED VISUAL DESCRIPTION — highest-priority visual instruction:\n" + shot.description +
            "\n\nNarrative context, secondary to the exact visual description:\n" + shot.prompt_export;
      } else {
        rawPrompt = shot.prompt_export || shot.description;
      }
      if (!rawPrompt) throw new Error("No prompt available for this shot");
      // Strip any legacy verbose Identity Lock block prepended in a previous
      // generation. The full lock is re-injected below from the registry's
      // mentions_shots, so the legacy prefix would either duplicate it or
      // bias the model toward an object that isn't in this shot.
      rawPrompt = stripLegacyIdentityLockPrefix(rawPrompt);
      enrichedPrompt = transformPromptForSensitiveMode(rawPrompt, sensitive_level, sceneContextAnchors);

      // Inject identity locks AFTER the action so the model doesn't anchor on
      // the character/place full-body description and ignore the requested
      // action (e.g. "close-up on the burn"). The action stays first and is
      // explicitly marked as the primary subject of the frame.
      const identityLocks = effectiveLinkedObjects
        .map((obj: any) => obj.identity_prompt || "")
        .filter(Boolean);
      if (identityLocks.length > 0) {
        const condensed = identityLocks
          .map((lock: string) =>
            lock
              .replace(/^(CHARACTER|LOCATION|OBJECT|VEHICLE)\s+IDENTITY\s+LOCK:\s*/gim, "")
              .replace(/^\s*Do not redesign[^\n]*\n?/gim, "")
              .replace(/\n{3,}/g, "\n\n")
              .trim(),
          )
          .filter(Boolean);
        if (condensed.length > 0) {
          // SCENE-FIRST architecture: lead with the actual scene/action so
          // the model anchors on WHAT to draw. Identity locks come AFTER as
          // appearance-only anchors that must not bleed their original
          // setting/background into the requested scene.
          enrichedPrompt =
            "SCENE TO RENDER (primary subject of the image — this defines the entire composition, setting, action and framing; it must NOT be replaced by a generic scene built from reference images):\n" +
            enrichedPrompt +
            "\n\n--- SUBJECT IDENTITY ANCHORS (apply only to the appearance of the people/objects inside the SCENE TO RENDER above — do NOT copy their original setting, do NOT change the requested scene) ---\n" +
            condensed.join("\n\n");
        }
      }
    }

    // ── VISUAL STYLE ENFORCEMENT (aligned with generate-shot-image) ──
    // Inject the style at the head of the prompt so the UI-selected style
    // always wins over whatever style was baked into prompt_export.
    const styleSuffix = (visual_style && visual_style !== "none") ? getStyleSuffix(visual_style) : null;
    if (!usingCustomPrompt && styleSuffix) {
      enrichedPrompt =
        `${enrichedPrompt}\n\n--- STYLE MODIFIER ONLY ---\n` +
        `Apply this rendering style without changing the requested setting, action, composition, number of subjects, or props:\n${styleSuffix}`;
      console.log(`[KIE] Style enforced: ${visual_style}`);
    }

    // ── UNIFIED DIRECTIVES (condensed) ──
    // Single compact preamble covering: reference fidelity, no temporal drift,
    // aspect ratio, and "no prompt-as-text". Replaces three previously
    // duplicated blocks (REFERENCE IMAGE RULE / ASPECT RATIO / anti-text-leak)
    // to reduce token waste while keeping every constraint.
    const targetAR = ASPECT_RATIOS_KIE[aspect_ratio] ?? "16:9";
    const hasRefs = effectiveLinkedObjects.some(
      (o: any) => Array.isArray(o.reference_images) && o.reference_images.length > 0,
    );
    const referenceLines = hasRefs
      ? [
          "Reference images = identity anchor for the subject's face/clothing ONLY. Do NOT copy their backgrounds, poses, props, smiles, plates of food or cooking actions.",
          "Preserve the subject's exact identity (face, proportions, distinctive traits, period details). No redesign, no modernization, no hybridization, no generic lookalike.",
          "Single instance only: the subject appears EXACTLY ONCE. No duplicates, no mirroring, no split-screen, no diptych, no collage.",
        ]
      : [];
    const directives = [
      `Output: one single cinematic ${targetAR} image, no borders, no letterboxing.`,
      "No visible written text in the image (no titles, labels, captions, signs, document text). Only incidental blurred background writing is allowed.",
      ...referenceLines,
    ].join("\n");
    // SCENE FIRST: put the actual scene/action at the TOP of the prompt so the
    // image model anchors on WHAT to draw, not on meta-instructions. Technical
    // directives go AFTER as constraints. This dramatically improves fidelity
    // to the requested action on nano-banana / flux / imagen.
    if (!usingCustomPrompt) {
      enrichedPrompt = `${enrichedPrompt}\n\n--- TECHNICAL CONSTRAINTS ---\n${directives}`;
    }

    // Kie market models cap prompts at 2000 chars (some at 5000). Stay safe at 1900.
    // z-image has a much stricter limit (~800 chars based on API errors).
    const PER_MODEL_PROMPT_MAX: Record<string, number> = {
      "z-image": 800,
      "qwen-image": 1500,
      "qwen2-image": 1500,
    };
    const KIE_PROMPT_MAX = PER_MODEL_PROMPT_MAX[model] ?? 1900;
    if (enrichedPrompt.length > KIE_PROMPT_MAX) {
      // Smart truncation: the prompt is built as
      //   [HEAD = aspect ratio + reference rule + style] + [IDENTITY LOCKS] + [prompt_export with the ACTION]
      // A naive .slice(0, MAX) drops the prompt_export entirely, so the model
      // generates the right character/place but ignores the action.
      // We preserve the HEAD + the prompt_export (action) and only compress
      // the long identity-lock block.
      const originalLen = enrichedPrompt.length;
      const actionText = (shot.prompt_export || shot.description || "").trim();

      // Build a compact identity-lock summary (one line per recurring entity).
      const compactLocks = effectiveLinkedObjects
        .map((obj: any) => {
          const name = obj.nom || obj.name || "subject";
          const type = (obj.type || obj.object_type || "subject").toLowerCase();
          // Use the first sentence of the identity prompt as the fidelity anchor.
          const fullLock = String(obj.identity_prompt || "").trim();
          const firstSentence = fullLock.split(/(?<=[.!?])\s+/)[0]?.slice(0, 220) || "";
          return firstSentence
            ? `IDENTITY LOCK (${type}) — ${name}: ${firstSentence}`
            : `IDENTITY LOCK (${type}) — ${name}: keep exact identity from reference image.`;
        })
        .join("\n");

      // Extract the trailing technical-constraints block we added below the
      // scene, so we can re-attach it after compression.
      const constraintsMatch = enrichedPrompt.match(/--- TECHNICAL CONSTRAINTS ---[\s\S]*$/);
      const constraintsBlock = (constraintsMatch?.[0] || "").trim();
      // Extract the optional style-enforcement preamble (kept at the top).
      const styleMatch = enrichedPrompt.match(/^MANDATORY VISUAL STYLE[\s\S]*?(?=\n\n)/);
      const styleBlock = (styleMatch?.[0] || "").trim();

      // SCENE-FIRST reconstruction: scene/action at the top, then identity
      // lock summary, then technical constraints (and style stays on top if
      // present). This mirrors the non-compressed layout so the model always
      // anchors on WHAT to draw before reading any meta-instruction.
      const buildRebuilt = (action: string) => {
        let out = "";
        if (styleBlock) out += styleBlock + "\n\n";
        out += `SCENE TO RENDER (primary subject of this image):\n${action}`;
        if (compactLocks) {
          out += `\n\nSUBJECT IDENTITY (preserve face/clothing only — do NOT copy reference backgrounds):\n${compactLocks}`;
        }
        if (constraintsBlock) {
          out += `\n\n${constraintsBlock}`;
        }
        return out;
      };

      let rebuilt = buildRebuilt(actionText);
      if (rebuilt.length > KIE_PROMPT_MAX) {
        const overflow = rebuilt.length - KIE_PROMPT_MAX;
        const trimmedAction = actionText.slice(0, Math.max(200, actionText.length - overflow - 3)) + "...";
        rebuilt = buildRebuilt(trimmedAction);
      }
      console.warn(`[KIE] Prompt smart-compressed from ${originalLen} to ${rebuilt.length} chars (preserved action + ${effectiveLinkedObjects.length} identity locks)`);
      enrichedPrompt = rebuilt;
    }

    // Collect reference images and split by type for MJ omni-reference
    const allRefImages: string[] = [];
    const orefImages: string[] = [];
    const srefImages: string[] = [];
    for (const obj of effectiveLinkedObjects) {
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

    // Submit & poll — with up to two automatic retries using progressively
    // more neutral prompts if Google's safety filter blocks the request.
    const promptVariants = [
      enrichedPrompt,
      sanitizePromptForSafety(enrichedPrompt),
      ultraNeutralPrompt(enrichedPrompt),
    ];
    let taskId = "";
    let kieImageUrl = "";
    let lastError: unknown = null;

    for (let attempt = 0; attempt < promptVariants.length; attempt++) {
      const promptToUse = promptVariants[attempt];
      if (attempt > 0) {
        console.warn(`[KIE] Safety filter triggered — retrying with sanitized prompt (attempt ${attempt + 1})`);
      }
      try {
        taskId = await submitKieTask({
          apiKey: KIE_API_KEY,
          endpointPath: pricingRow.endpoint_path,
          modelKey,
          prompt: promptToUse,
          aspectRatio: selectedAspectRatio,
          size,
          referenceImages: cappedRefs,
          orefImages: cappedOref,
          srefImages: cappedSref,
          isMidjourney,
        });

        if (attempt === 0 && (kie_async === true || req.headers.get("x-kie-async") === "1")) {
          return new Response(
            JSON.stringify({ success: true, status: "pending", task_id: taskId, model, quality: selectedQuality, provider: "kie" }),
            { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        kieImageUrl = await pollKieTask(KIE_API_KEY, taskId, isMidjourney);
        break; // success
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "KIE_TIMEOUT_SYNC") throw err;
        if (!isSafetyError(msg) || attempt === promptVariants.length - 1) {
          throw err;
        }
        // else loop and retry with sanitized prompt
      }
    }

    if (!kieImageUrl) {
      throw lastError instanceof Error ? lastError : new Error("Kie generation failed without image URL");
    }

    const finalUrl = await rehostImage(supabase, kieImageUrl, shot.project_id, shot_id, selectedAspectRatio);
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
    // Timeout in synchronous mode: return 202 + task_id signal so the client
    // can switch to polling instead of treating it as a hard failure.
    const isTimeout = message === "KIE_TIMEOUT_SYNC";
    const safetyBlocked = isSafetyError(message);
    const userMessage = isTimeout
      ? "Kie generation is taking longer than expected. Please retry with async mode."
      : safetyBlocked
        ? "L'image a été bloquée par les filtres de sécurité de Google après plusieurs tentatives. Reformulez le prompt en évitant les termes liés au stress, au chaos, au danger ou à la violence, ou activez le toggle « Sans personnage » pour ce plan."
        : message;
    return new Response(
      JSON.stringify({
        error: userMessage,
        provider: "kie",
        retryable: isTimeout || safetyBlocked,
        safety_blocked: safetyBlocked,
      }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});