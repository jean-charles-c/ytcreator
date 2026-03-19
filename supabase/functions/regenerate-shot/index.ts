import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { shot_id } = await req.json();
    if (!shot_id) throw new Error("Missing shot_id");

    // Fetch the shot
    const { data: shot, error: shotErr } = await supabase
      .from("shots")
      .select("*")
      .eq("id", shot_id)
      .single();
    if (shotErr || !shot) throw new Error("Shot not found");

    // Verify ownership and get script_language
    const { data: project } = await supabase
      .from("projects")
      .select("id, script_language, title, subject")
      .eq("id", shot.project_id)
      .eq("user_id", user.id)
      .single();
    if (!project) throw new Error("Unauthorized");

    const scriptLang = project.script_language || "fr";
    const needsTranslation = scriptLang.toLowerCase() !== "fr";

    // Fetch the scene for context
    const { data: scene } = await supabase
      .from("scenes")
      .select("*")
      .eq("id", shot.scene_id)
      .single();
    if (!scene) throw new Error("Scene not found");

    // Count shots in this scene to determine if this is the only one
    const { count: sceneShotCount } = await supabase
      .from("shots")
      .select("id", { count: "exact", head: true })
      .eq("scene_id", shot.scene_id);

    // If this is the only shot in the scene, use the full scene text
    const isOnlyShot = (sceneShotCount ?? 0) <= 1;
    const sourceText = isOnlyShot
      ? (scene.source_text || shot.source_sentence || shot.description)
      : (shot.source_sentence || shot.description);

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
          model: "google/gemini-2.5-flash",
          max_tokens: 2048,
          messages: [
            {
              role: "system",
              content: `You regenerate a single cinematic documentary shot prompt optimized for Grok Image.

LANGUAGE RULES:
- shot_type MUST be in FRENCH (e.g. "Plan d'ensemble", "Plan d'activité", "Plan de détail", "Plan portrait", "Plan subjectif", "Plan d'interaction", "Plan environnemental", "Plan de détail d'artefact", "Plan de détail scientifique")
- description MUST be in FRENCH (2-3 sentences)
- prompt_export MUST be in ENGLISH, at least 100 words, one continuous paragraph

PROMPT STRUCTURE (prompt_export, in ENGLISH):
1. Camera framing
2. Scene description with objects, materials, textures, colors
3. Characters: pose, gesture, clothing, expression
4. Environment and background
5. Foreground depth elements
6. Lighting: source, direction, quality, shadows
7. Atmosphere and mood
8. End with: "Style: ultra realistic documentary photography, cinematic lighting, historical reconstruction realism. Visual quality: cinematic film still, 8k detail, natural textures, real-world physics. Aspect ratio: 16:9"

Images must be photorealistic historical documentary style. Never illustration or fantasy.`,
            },
            {
              role: "user",
              content: `Regenerate a new visual shot for this sentence from a documentary narration.

PROJECT CONTEXT: "${project.title || ""}"${project.subject ? ` — Subject: ${project.subject}` : ""}
Scene context: "${scene.title}" — Visual intention: ${scene.visual_intention || "N/A"}${scene.location ? ` — Location: ${scene.location}` : ""}${scene.characters ? ` — Characters: ${scene.characters}` : ""}

IMPORTANT: The visual prompt MUST be grounded in the specific historical period, geographic location, and cultural context of this project. Architecture, clothing, objects, vegetation, and lighting must be accurate to that era and place. Never use generic or anachronistic elements.

Sentence to illustrate: "${sourceText}"
${needsTranslation ? `\nThe narration is in "${scriptLang}" (NOT French). You MUST also provide "source_sentence_fr": a faithful French translation of the sentence above.` : ""}

PREVIOUS VERSION TO AVOID (do NOT produce something visually similar):
- Previous shot type: ${shot.shot_type}
- Previous prompt: "${shot.prompt_export || shot.description}"

CRITICAL: Generate a COMPLETELY DIFFERENT cinematic angle, camera type, lighting, and composition than the previous version. The new prompt must produce a visually distinct image. Use a different camera type from the Visual Camera Grid. Change the lighting direction, time of day feel, or perspective height. The prompt_export MUST explicitly mention the historical period and geographic location.`,
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
                    prompt_export: { type: "string", description: "Full Grok Image prompt in ENGLISH, 100+ words" },
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

    const updatePayload: Record<string, any> = {
      shot_type: newShot.shot_type,
      description: newShot.description,
      prompt_export: newShot.prompt_export,
    };
    // If only shot in scene, ensure source_sentence matches full scene text
    if (isOnlyShot) {
      updatePayload.source_sentence = scene.source_text;
      if (scene.source_text_fr) {
        updatePayload.source_sentence_fr = scene.source_text_fr;
      }
    } else if (newShot.source_sentence_fr) {
      updatePayload.source_sentence_fr = newShot.source_sentence_fr;
    }

    const { error: updateErr } = await supabase
      .from("shots")
      .update(updatePayload)
      .eq("id", shot_id);

    if (updateErr) throw new Error("Failed to update shot");

    // Fetch updated shot
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
