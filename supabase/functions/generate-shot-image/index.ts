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
const MAX_BASE64_FALLBACK_REFS = 1;
const MAX_REF_SOURCE_BYTES = 1_200_000;
const MAX_REF_OUTPUT_BYTES = 90_000;
const MAX_TOTAL_REF_PAYLOAD_BYTES = 360_000;
const MAX_REF_LONGEST_SIDE = 320;
const REF_JPEG_QUALITY = 60;
const PUBLIC_REFERENCE_BUCKET_SEGMENT = "/storage/v1/object/public/reference-images/";

const getExtensionFromMime = (mimeType: string) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
};

const isPublicReferenceImageUrl = (url: string) => {
  try {
    return new URL(url).pathname.includes(PUBLIC_REFERENCE_BUCKET_SEGMENT);
  } catch {
    return false;
  }
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

/**
 * Extract the real USD cost charged by the Lovable AI gateway.
 *
 * Priority order (works for ALL selectable models — Nano Banana v1, Nano Banana 2,
 * Gemini Pro Image, etc., whether routed through Lovable's catalog OR in BYOK passthrough mode):
 *
 *   1. cost_details.upstream_inference_cost      ← TRUE upstream cost (BYOK / passthrough)
 *   2. usage.cost                                 ← Lovable catalog price (when > 0)
 *   3. legacy fields (cost_usd, total_cost_usd, usd, costUsd)
 *   4. fallbackCost (MODEL_COSTS table)           ← last-resort estimate
 *
 * Why this matters: when `is_byok = true` (which is the case for Nano Banana since
 * the gateway switched to passthrough), `usage.cost` returns 0 and the real cost
 * lives ONLY in `cost_details.upstream_inference_cost`. Without this fix, the DB
 * was storing the static $0.02 fallback while the workspace was actually billed ~$0.04.
 */
const extractUsdCost = (payload: any, fallback: number) => {
  // 1. Real upstream cost (BYOK / passthrough rates) — highest priority
  const upstream = payload?.cost_details?.upstream_inference_cost
    ?? payload?.usage?.cost_details?.upstream_inference_cost;
  if (typeof upstream === "number" && Number.isFinite(upstream) && upstream > 0) {
    return upstream;
  }

  // 2. Lovable catalog price (only when > 0; BYOK responses report 0 here)
  const catalogCost = payload?.usage?.cost;
  if (typeof catalogCost === "number" && Number.isFinite(catalogCost) && catalogCost > 0) {
    return catalogCost;
  }

  // 3. Legacy / alternative field names
  const legacyCandidates = [
    payload?.usage?.cost_usd,
    payload?.usage?.total_cost_usd,
    payload?.usage?.usd,
    payload?.usageMetadata?.costUsd,
    payload?.usage_metadata?.cost_usd,
    payload?.cost_usd,
  ];
  const legacy = legacyCandidates.find((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (typeof legacy === "number") return legacy;

  // 4. Fallback to static MODEL_COSTS estimate
  return fallback;
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

    let user: { id: string };
    try {
      const { data: userData, error: userError } = await supabaseUser.auth.getUser();

      if (userError || !userData?.user?.id) {
        const msg = userError?.message || "Unauthorized";
        return new Response(
          JSON.stringify({ error: msg, auth_expired: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      user = { id: userData.user.id };
    } catch (authException) {
      const message = authException instanceof Error ? authException.message : "Unauthorized";
      if (message === "JWT has expired" || message.toLowerCase().includes("jwt") || message === "Unauthorized") {
        return new Response(
          JSON.stringify({ error: message, auth_expired: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw authException;
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

    // Find objects linked to this specific shot via mentions_shots
    const shotLinkedObjects = recurringObjects.filter((obj: any) => {
      if (Array.isArray(obj.mentions_shots) && obj.mentions_shots.includes(shot_id)) {
        return true;
      }
      return false;
    });

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
    // Metaphorical / symbolic prompts: when the prompt explicitly frames the
    // subject as a metaphor, symbol or evocation, the character is mentioned
    // only as a narrative reference, not as something that should appear in
    // the frame. Treat those as object-only inserts even if a character word
    // is present.
    const metaphoricalRegex = /\b(m[ée]taphor[ie]\w*|symbolis\w*|symbolique|symbole|[ée]voqu\w*|sugg[èe]r\w*|allegor\w*|repr[ée]sentation\s+de|metaphor\w*|symboliz\w*|symbolic|allegor\w*|evok\w*|suggest\w*)\b/i;
    const isMetaphoricalPrompt = metaphoricalRegex.test(promptText);
    // Manual override stored on the shot row.
    const forceNoCharacter = (shot as any).force_no_character === true;
    const isObjectOnlyInsert =
      forceNoCharacter ||
      (isTightFraming && !hasCharacterMention) ||
      (isTightFraming && isMetaphoricalPrompt);
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
        `[generate-shot-image] tight=${isTightFraming} objectOnly=${isObjectOnlyInsert} metaphor=${isMetaphoricalPrompt} forceNoChar=${forceNoCharacter} — dropped ${shotLinkedObjects.length - effectiveLinkedObjects.length} identity lock(s).`,
      );
    }

    // If a custom_prompt is provided (user edited the full prompt in UI), use it directly
    let enrichedPrompt: string;
    if (typeof custom_prompt === "string" && custom_prompt.trim().length > 0) {
      enrichedPrompt = custom_prompt.trim();
      console.log("Using custom_prompt from client (user-edited full prompt)");
    } else {
      // Merge prompt_export and description: the description often contains richer
      // visual details (camera angle, textures, materials) that prompt_export may lack
      // when it was built only from the abstract source_sentence.
      let rawPrompt: string;
      if (shot.prompt_export && shot.description && shot.description.length > 30) {
        // Check if description content is already present in prompt_export
        const descSnippet = shot.description.slice(0, 60).toLowerCase();
        if (shot.prompt_export.toLowerCase().includes(descSnippet)) {
          rawPrompt = shot.prompt_export;
        } else {
          rawPrompt = shot.prompt_export + "\n\nDETAILED VISUAL DESCRIPTION (use as primary visual reference):\n" + shot.description;
        }
      } else {
        rawPrompt = shot.prompt_export || shot.description;
      }
      if (!rawPrompt) throw new Error("No prompt available for this shot");

      // Apply sensitive mode transformation with structured scene context
      const prompt = transformPromptForSensitiveMode(rawPrompt, sensitive_level, sceneContextAnchors);

      // Inject identity lock prompts for linked objects
      enrichedPrompt = prompt;
      if (effectiveLinkedObjects.length > 0) {
        const identityLocks = effectiveLinkedObjects
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
          // Condense verbose lock templates: strip the repeated
          // "CHARACTER/LOCATION/OBJECT/VEHICLE IDENTITY LOCK:" headers
          // and the boilerplate "Do not redesign, modernize..." lines
          // (already covered by the unified REFERENCE_IMAGE_RULE block).
          const condensed = identityLocks
            .map((lock: string) => {
              const cleaned = lock
                .replace(/^(CHARACTER|LOCATION|OBJECT|VEHICLE)\s+IDENTITY\s+LOCK:\s*/gim, "")
                .replace(/^\s*Do not redesign[^\n]*\n?/gim, "")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
              return cleaned;
            })
            .filter(Boolean);
          if (condensed.length > 0) {
            const firstSnippet = condensed[0].slice(0, 40).toLowerCase();
            if (!enrichedPrompt.toLowerCase().includes(firstSnippet)) {
              // Two-tier structure with explicit hierarchy: FRAMING & ACTION
              // defines the composition (mandatory), IDENTITY LOCK defines
              // the exact appearance of the subject inside that frame
              // (mandatory). Both apply simultaneously — the identity lock
              // must NOT be downgraded, and the framing must NOT be widened.
              enrichedPrompt =
                "HIERARCHY (read carefully):\n" +
                "1) FRAMING & ACTION below defines the shot's composition, scale, subject and what is happening. It is mandatory and must not be replaced by a wider or different shot.\n" +
                "2) IDENTITY LOCK below defines the exact appearance of the person/place/object that appears inside that framing. It is mandatory and must not be redesigned.\n" +
                "Both blocks apply simultaneously: render the FRAMING & ACTION exactly as described, and within that frame keep the visual identity from IDENTITY LOCK exact.\n\n" +
                "FRAMING & ACTION (mandatory composition):\n" +
                enrichedPrompt +
                "\n\nIDENTITY LOCK (mandatory appearance of the subject inside that frame — do not widen the shot to show them in full):\n" +
                condensed.join("\n\n");
            }
          }
        }
      }
    }

    // Collect reference images from linked objects
    const referenceImageUrls: string[] = [];
    for (const obj of effectiveLinkedObjects) {
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
    const referenceImageInputs: string[] = [];
    let preparedRefBytes = 0;
    let directReferenceCount = 0;
    let base64FallbackCount = 0;
    if (limitedRefUrls.length > 0) {
      console.log(`Preparing ${limitedRefUrls.length}/${referenceImageUrls.length} reference images (candidate cap ${MAX_REF_CANDIDATES})...`);
      for (const url of limitedRefUrls) {
        try {
          if (isPublicReferenceImageUrl(url)) {
            referenceImageInputs.push(url);
            directReferenceCount++;
            continue;
          }

          if (base64FallbackCount >= MAX_BASE64_FALLBACK_REFS) {
            console.log(`Skipping additional non-public reference images above fallback cap ${MAX_BASE64_FALLBACK_REFS}`);
            continue;
          }

          const prepared = await prepareReferenceImageDataUri(url);
          if (!prepared) {
            continue;
          }

          if (preparedRefBytes + prepared.payloadBytes > MAX_TOTAL_REF_PAYLOAD_BYTES) {
            console.log(
              `Stopping reference image intake at ${referenceImageInputs.length} image(s) to stay under ${MAX_TOTAL_REF_PAYLOAD_BYTES} bytes`,
            );
            break;
          }

          referenceImageInputs.push(prepared.payload);
          preparedRefBytes += prepared.payloadBytes;
          base64FallbackCount++;
        } catch (err) {
          console.warn(`Error downloading ref image ${url}:`, err);
        }
      }
      console.log(
        `Successfully prepared ${referenceImageInputs.length}/${limitedRefUrls.length} reference images (${directReferenceCount} direct URL, ${base64FallbackCount} base64 fallback, ${preparedRefBytes} bytes base64 total)`,
      );
    }

    // Condensed reference fidelity directives (replaces the previous verbose
    // multi-paragraph block — same constraints, ~70% fewer tokens).
    if (referenceImageInputs.length > 0) {
      const REFERENCE_IMAGE_RULE = [
        "Use reference images only as fidelity anchors, not as compositions to copy.",
        "Preserve identity, proportions, materials, distinctive traits, and period-specific details of any referenced person, place, or object.",
        "Do not redesign, modernize, age-change, hybridize, or create generic lookalikes.",
        "No temporal drift: never mix eras or versions of the same character, object, or place.",
        "Never render prompt or narrative text inside the image.",
      ].join("\n");
      enrichedPrompt = REFERENCE_IMAGE_RULE + "\n\n" + enrichedPrompt;
    }

    // ── VISUAL STYLE ENFORCEMENT (single source of truth) ──
    // Style is ALWAYS injected here, before ANY content, regardless of how prompt_export was built.
    // This guarantees consistent style application across all prompt construction paths:
    // generate-storyboard, regenerate-shot, custom_prompt, or manual edit.
    const { getStyleSuffix } = await import("../_shared/visual-styles.ts");
    const styleSuffix = (visual_style && visual_style !== "none") ? getStyleSuffix(visual_style) : null;

    const buildPrompt = (text: string) => [
      `Generate one single cinematic ${selectedAspectRatio} image, no borders, no letterboxing, no square crop.`,
      "Never render the prompt, narrative sentence, metadata, or instructions as visible text. Only natural in-scene writing is allowed.",
      ...(styleSuffix ? [`Style (mandatory, overrides any later style cue): ${styleSuffix}`] : []),
      text,
    ].join("\n");

    // Build multimodal content array with reference images as base64
    const buildMessageContent = (promptText: string): any => {
      if (referenceImageInputs.length === 0) {
        return promptText;
      }
      const parts: any[] = [{ type: "text", text: promptText }];
      for (const imageSource of referenceImageInputs) {
        parts.push({
          type: "image_url",
          image_url: { url: imageSource },
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
        console.log(`Generating image: variant ${variantIdx}, attempt ${attempt}, ref images: ${referenceImageInputs.length}`);
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
          if (aiResponse.status === 400 && errText.includes("fetching image from URL") && referenceImageInputs.length > 0) {
            console.warn("Reference images inaccessible via gateway, retrying without them...");
            referenceImageInputs.length = 0;
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

        const rawText = await aiResponse.text();
        if (!rawText || rawText.trim().length === 0) {
          console.warn(`Empty response body (variant ${variantIdx}, attempt ${attempt})`);
          if (attempt < retries) { await new Promise((r) => setTimeout(r, attempt * 3000)); continue; }
          break;
        }
        try {
          aiData = JSON.parse(rawText);
        } catch (parseErr) {
          console.warn(`JSON parse failed (variant ${variantIdx}, attempt ${attempt}): ${(parseErr as Error).message}, body length=${rawText.length}`);
          if (attempt < retries) { await new Promise((r) => setTimeout(r, attempt * 3000)); continue; }
          break;
        }
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

    // 🔍 COST AUDIT: Log full billing payload from Lovable AI Gateway
    console.log("[COST_AUDIT]", JSON.stringify({
      model: selectedModel,
      fallbackCost,
      usage: aiData?.usage ?? null,
      usageMetadata: aiData?.usageMetadata ?? null,
      usage_metadata: aiData?.usage_metadata ?? null,
      cost_usd_root: aiData?.cost_usd ?? null,
      refImagesCount: Array.isArray(referenceImageInputs) ? referenceImageInputs.length : 0,
      hasInputImages: Array.isArray(referenceImageInputs) && referenceImageInputs.length > 0,
    }));

    const exactOrFallbackCost = extractUsdCost(aiData, fallbackCost);
    console.log(`[COST_AUDIT] Final cost charged: $${exactOrFallbackCost.toFixed(4)} (fallback would be $${fallbackCost.toFixed(4)})`);
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

    if (updateErr) {
      console.error("Failed to update shot:", JSON.stringify(updateErr));
      throw new Error(`Failed to update shot: ${updateErr.message || updateErr.code || "unknown"}`);
    }

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