import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateShotOperation, buildNeighborAvoidancePrompt } from "../_shared/shot-operation.ts";
import { getSensitiveModeInstruction } from "../_shared/sensitive-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { shot_id, sensitive_level } = await req.json();
    if (!shot_id) throw new Error("Missing shot_id");

    const sensitiveModeBlock = getSensitiveModeInstruction(sensitive_level);

    const { data: shot, error: shotErr } = await supabase
      .from("shots")
      .select("*")
      .eq("id", shot_id)
      .single();
    if (shotErr || !shot) throw new Error("Shot not found");

    const { data: project } = await supabase
      .from("projects")
      .select("id, script_language, title, subject")
      .eq("id", shot.project_id)
      .eq("user_id", user.id)
      .single();
    if (!project) throw new Error("Unauthorized");

    const scriptLang = project.script_language || "fr";
    const needsTranslation = scriptLang.toLowerCase() !== "fr";

    const { data: scene } = await supabase
      .from("scenes")
      .select("*")
      .eq("id", shot.scene_id)
      .single();
    if (!scene) throw new Error("Scene not found");

    // Fetch recurring objects from global_context
    const { data: scriptState } = await supabase
      .from("project_scriptcreator_state")
      .select("global_context")
      .eq("project_id", shot.project_id)
      .maybeSingle();
    const globalContext = scriptState?.global_context as Record<string, any> | null;
    const recurringObjects = Array.isArray(globalContext?.objets_recurrents) ? globalContext.objets_recurrents : [];

    // Find objects linked to this shot's scene and mentioned in the fragment
    const sceneOrder = scene.scene_order;
    const shotText = (shot.source_sentence || shot.description || "").toLowerCase();
    const linkedObjects = recurringObjects.filter((obj: any) => {
      if (Array.isArray(obj.mentions_scenes) && obj.mentions_scenes.length > 0) {
        if (!obj.mentions_scenes.includes(sceneOrder)) return false;
      }
      const objName = (obj.nom || "").toLowerCase();
      return objName && shotText.includes(objName.split(" ")[0].toLowerCase());
    });

    const identityLockBlock = linkedObjects.length > 0
      ? "\n\nRECURRING OBJECTS IN THIS SHOT (APPLY IDENTITY LOCKS):\n" +
        linkedObjects.map((obj: any) => `- ${obj.nom}: ${obj.identity_prompt || ""}`).join("\n")
      : "";

    // Fetch ALL sibling shots for neighbor comparison
    const { data: siblingShots } = await supabase
      .from("shots")
      .select("id, shot_order, shot_type, prompt_export, source_sentence")
      .eq("scene_id", shot.scene_id)
      .order("shot_order", { ascending: true });

    const siblings = siblingShots || [];
    const shotIdx = siblings.findIndex((s: any) => s.id === shot_id);
    const neighborsBefore = shotIdx > 0 ? siblings.slice(Math.max(0, shotIdx - 2), shotIdx) : [];
    const neighborsAfter = shotIdx < siblings.length - 1 ? siblings.slice(shotIdx + 1, shotIdx + 3) : [];
    const isOnlyShot = siblings.length <= 1;

    const sourceText = isOnlyShot
      ? (scene.source_text || shot.source_sentence || shot.description)
      : (shot.source_sentence || shot.description);

    // Validate operation using shared rules
    const sceneContext = scene.scene_context as Record<string, string> | null;
    const opValidation = validateShotOperation({
      type: "regenerate",
      shotFragment: sourceText,
      sceneText: scene.source_text || "",
      sceneContext,
      neighborsBefore,
      neighborsAfter,
    });

    // Build neighbor avoidance prompt
    const neighborPrompt = buildNeighborAvoidancePrompt(neighborsBefore, neighborsAfter);

    // Build rich scene context block (aligned with generate-storyboard's buildContextualPrompt)
    const contextBlock = sceneContext ? [
      `SCENE CONTEXT:`,
      `  Lieu: ${sceneContext.lieu || "Non déterminé"}`,
      `  Époque: ${sceneContext.epoque || "Non déterminé"}`,
      `  Personnages: ${sceneContext.personnages || "Non déterminé"}`,
      sceneContext.ambiance ? `  Ambiance: ${sceneContext.ambiance}` : null,
      sceneContext.ton ? `  Ton: ${sceneContext.ton}` : null,
    ].filter(Boolean).join("\n") : "";

    // Visual intention & continuity from scene (same as generate-storyboard)
    const visualIntention = scene.visual_intention;
    const visualIntentionNote = visualIntention ? `\nVisual intention for this scene: ${visualIntention}` : "";
    const continuity = scene.continuity;
    const continuityNote = continuity ? `\nScene continuity note: ${continuity}` : "";

    // Camera framing mapping (FR → EN, same grid as generate-storyboard)
    const cameraMap: Record<string, string> = {
      "Plan d'ensemble": "Wide establishing shot",
      "Plan d'activité": "Medium shot capturing action",
      "Plan d'interaction": "Two-shot or group composition",
      "Plan environnemental": "Atmospheric environmental shot",
      "Plan de détail d'artefact": "Close-up detail shot",
      "Plan de détail scientifique": "Macro examination shot",
      "Plan portrait": "Portrait shot",
      "Plan subjectif": "Point-of-view shot",
    };

    const avoidCamerasNote = opValidation.avoidCameraTypes.length > 0
      ? `\nCAMERA TYPES TO AVOID (used by neighbors): ${opValidation.avoidCameraTypes.join(", ")}`
      : "";

    // Build camera avoidance as English descriptions too
    const avoidCameraDescriptions = opValidation.avoidCameraTypes
      .map(ct => {
        const match = Object.entries(cameraMap).find(([k]) => k.toLowerCase().replace(/['']/g, "'") === ct);
        return match ? match[1] : ct;
      })
      .filter(Boolean);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const translationRule = needsTranslation
      ? `\n- source_sentence_fr MUST be a faithful French translation of the narration sentence. This is MANDATORY and NON-NEGOTIABLE.`
      : "";

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 2048,
          messages: [
            {
              role: "system",
              content: `You regenerate a single cinematic documentary shot prompt.${sensitiveModeBlock}

LANGUAGE RULES:
- shot_type MUST be in FRENCH (e.g. "Plan d'ensemble", "Plan d'activité", "Plan de détail", "Plan portrait", "Plan subjectif", "Plan d'interaction", "Plan environnemental", "Plan de détail d'artefact", "Plan de détail scientifique")
- description MUST be in FRENCH (2-3 sentences)
- prompt_export MUST be in FRENCH, at least 100 words, one continuous paragraph${translationRule}

CONTEXTUAL ANCHORING RULE — CRITICAL:
Every prompt_export MUST begin by explicitly stating the historical period/era and geographic location.
This anchoring is MANDATORY. Never produce a prompt without it.
All architecture, clothing, objects, vegetation, skin tones, and lighting MUST be accurate to that specific era, culture, and place.

CONTEXTUAL PROMPT CONSTRUCTION — CRITICAL (same rules as initial generation):
Each prompt_export must be built from the SPECIFIC fragment it illustrates, NOT from the full scene text.
Context injection rules:
1. ALWAYS start with the historical period + geographic location from the scene's CONTEXTE block
2. Include characters ONLY when the fragment mentions or implies people — do not inject character descriptions into landscape or object shots
3. Include ambiance/mood ONLY when it adds visual value to THIS specific fragment
4. Include visual_intention ONLY when it enriches the framing or cinematic direction
5. Include continuity notes ONLY when the fragment represents a transition or narrative shift
6. NEVER dump all context fields mechanically — select only what is visually relevant to the fragment

FRAGMENT-SPECIFIC RULE:
The prompt must illustrate ONLY what the given text fragment describes.
Do not illustrate the entire scene — focus on the specific fragment's visual content.
The prompt must describe what the FRAGMENT says, not what the scene says in general.

PROMPT STRUCTURE (prompt_export, in FRENCH):
1. Historical period and geographic location anchor (MANDATORY FIRST SENTENCE)
2. Camera framing (MUST differ from neighbors)
3. Fragment-specific visual content with hyper-specific materials, textures, colors
4. Characters if present IN THE FRAGMENT: pose, gesture, clothing fabric and color — culturally accurate to the era and place
5. Environment grounded in the scene's lieu and époque: period-accurate background elements
6. Foreground depth elements relevant to the fragment adding visual depth
7. Lighting: source, direction, quality, shadows — physically motivated
8. Atmosphere and mood from the fragment's narrative tone
9. End with: "Style : photographie documentaire ultra réaliste, éclairage cinématographique, réalisme de reconstruction historique. Qualité visuelle : image fixe cinématographique, détail 8k, textures naturelles, physique réaliste. Ratio d'aspect : 16:9"

PHOTOREALISM ENFORCEMENT:
All output must resemble frames from a high-budget historical film production (BBC History / National Geographic quality).
Mandatory: natural skin textures, realistic materials, environmental depth, cinematic lighting contrast, natural imperfections, atmospheric perspective.
Images must NOT resemble: illustration, fantasy painting, stylized digital art, concept art.

MATERIAL DENSITY RULE:
Include physically rich environments. Avoid empty compositions.
Add environmental elements: objects, scrolls, pottery, fabrics, tools, architectural textures, vegetation, atmospheric particles.

Images must be photorealistic historical documentary style. Never illustration or fantasy.`,
            },
            {
              role: "user",
              content: `Regenerate a new visual shot for this specific text fragment from a documentary narration.

PROJECT CONTEXT: "${project.title || ""}"${project.subject ? ` — Subject: ${project.subject}` : ""}
Scene: "${scene.title}"
${contextBlock}${visualIntentionNote}${continuityNote}${identityLockBlock}

MANDATORY CONTEXTUAL ANCHORING: The prompt_export MUST explicitly open with: "${opValidation.contextAnchor}".
${opValidation.relevantCharacters ? `Characters relevant to this fragment: ${opValidation.relevantCharacters}` : ""}

Fragment to illustrate: "${sourceText}"
${needsTranslation ? `\nThe narration is in "${scriptLang}" (NOT French). You MUST provide "source_sentence_fr": a faithful French translation. NON-NEGOTIABLE.` : ""}

PREVIOUS VERSION TO AVOID (do NOT produce something visually similar):
- Previous shot type: ${shot.shot_type} (${cameraMap[shot.shot_type] || "Unknown framing"})
- Previous prompt: "${(shot.prompt_export || shot.description || "").slice(0, 200)}"
${avoidCamerasNote}${avoidCameraDescriptions.length > 0 ? `\nCamera framings to avoid (English): ${avoidCameraDescriptions.join(", ")}` : ""}${neighborPrompt}

CRITICAL: Generate a COMPLETELY DIFFERENT cinematic angle, camera type, lighting, and composition than the previous version AND the neighbor shots. The new prompt must produce a visually distinct image.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "regenerate_shot",
                description: "Regenerates a single cinematic shot",
                parameters: {
                  type: "object",
                  properties: {
                    shot_type: { type: "string", description: "Camera type in FRENCH" },
                    description: { type: "string", description: "Visual description in FRENCH" },
                    prompt_export: { type: "string", description: "Full visual prompt in FRENCH, 100+ words" },
                    ...(needsTranslation ? { source_sentence_fr: { type: "string", description: "French translation of the source sentence" } } : {}),
                  },
                  required: ["shot_type", "description", "prompt_export", ...(needsTranslation ? ["source_sentence_fr"] : [])],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "regenerate_shot" } },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let newShot: any = { shot_type: shot.shot_type, description: shot.description, prompt_export: shot.prompt_export };

    try {
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        newShot = {
          shot_type: parsed.shot_type || shot.shot_type,
          description: parsed.description || shot.description,
          prompt_export: parsed.prompt_export || shot.prompt_export,
          source_sentence_fr: parsed.source_sentence_fr || null,
        };
      }
    } catch (e) {
      console.warn("Failed to parse AI response for shot regeneration", e);
    }

    // Fallback translation if needed
    if (needsTranslation && !newShot.source_sentence_fr && sourceText) {
      console.warn("AI did not return source_sentence_fr, generating fallback translation");
      try {
        const trRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            max_tokens: 512,
            messages: [
              { role: "system", content: "Translate the following text to French. Return ONLY the French translation, nothing else." },
              { role: "user", content: sourceText },
            ],
          }),
        });
        if (trRes.ok) {
          const trData = await trRes.json();
          const trText = trData.choices?.[0]?.message?.content?.trim();
          if (trText) newShot.source_sentence_fr = trText;
        }
      } catch (trErr) {
        console.warn("Fallback translation failed:", trErr);
      }
    }

    const updatePayload: Record<string, any> = {
      shot_type: newShot.shot_type,
      description: newShot.description,
      prompt_export: newShot.prompt_export,
    };
    if (isOnlyShot) {
      updatePayload.source_sentence = scene.source_text;
      if (scene.source_text_fr) {
        updatePayload.source_sentence_fr = scene.source_text_fr;
      } else if (newShot.source_sentence_fr) {
        updatePayload.source_sentence_fr = newShot.source_sentence_fr;
      }
    } else if (newShot.source_sentence_fr) {
      updatePayload.source_sentence_fr = newShot.source_sentence_fr;
    }

    const { error: updateErr } = await supabase
      .from("shots")
      .update(updatePayload)
      .eq("id", shot_id);

    if (updateErr) throw new Error("Failed to update shot");

    const { data: updatedShot } = await supabase
      .from("shots")
      .select("*")
      .eq("id", shot_id)
      .single();

    return new Response(JSON.stringify({ shot: updatedShot }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("regenerate-shot error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
