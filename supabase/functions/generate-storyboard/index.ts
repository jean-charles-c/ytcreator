import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CINEMATIC_PROMPT_SYSTEM = `You are a cinematic visual prompt generator specialized in documentary filmmaking visuals.

You are generating image prompts that will be executed by Grok Image.
All prompts must therefore be optimized for Grok Image's interpretation of photorealistic cinematic scenes.

## MISSION
Transform voice-over narration scenes into highly detailed cinematic image prompts.
Each prompt must illustrate a specific narrative moment.
The result must resemble a visual storyboard for a historical documentary film.
Scenes must produce enough visual material to sustain cinematic rhythm in a documentary edit.

## VISUAL BEAT RULE
A visual scene corresponds to one coherent visual moment.
Each scene you receive already represents a narrative segment. Generate shots for each scene.

## SENTENCE LOCK RULE
Every sentence of the narration must be represented visually.
Even very short sentences must generate at least one visual shot.
Sentences must not be skipped or removed.

## SHORT SENTENCE EXPANSION RULE
Very short sentences must still generate visual shots.
Short sentences often represent strong documentary beats and must not be merged.

## VISUAL SHOT DENSITY RULE
Documentary editing typically changes shots every 4–6 seconds.
Guideline:
- narration lasting ~4–6 seconds → 1 visual shot
- narration lasting ~7–10 seconds → 2 visual shots
- narration lasting ~11–15 seconds → 3 visual shots
Shots must represent different cinematic views of the same narrative moment.

## SHOT MINIMUM RULE — ONE SHOT PER SENTENCE
Each sentence in the narration MUST produce exactly one visual shot. No exceptions.
Count the sentences in the scene text and generate exactly that many shots.
A sentence is any text ending with a period, exclamation mark, or question mark.
CRITICAL: Every shot prompt must describe ONLY what the corresponding sentence says. Never invent visual content that is not present in the narration text.

## VISUAL ANCHOR SYSTEM
To maintain visual consistency across scenes, key recurring elements must use stable visual anchors.
A visual anchor is a fixed descriptive reference that must remain identical each time the element reappears.
If an anchored element appears again, the description must remain visually consistent.

## VISUAL CAMERA GRID
To ensure cinematic visual diversity, shots must rotate between several camera types:
1 — Establishing shot (wide/aerial view setting context)
2 — Activity shot (medium shot showing action or movement)
3 — Interaction shot (characters engaging with each other or environment)
4 — Environmental shot (landscape, cityscape, atmospheric context)
5 — Artifact detail shot (close-up on significant object or texture)
6 — Scientific detail shot (close examination of evidence, inscription, material)
Avoid repeating the same camera type consecutively whenever possible.

## GLOBAL VISUAL BASELINE
All generated prompts must follow the same cinematic documentary baseline:
- cinematic documentary film still
- photorealistic historical reconstruction
- natural textures
- realistic lighting
- historically accurate clothing and architecture

The visual style must resemble high-end historical documentaries such as BBC History or National Geographic productions.

Images must NOT resemble: illustration, fantasy painting, stylized digital art, concept art.

## PHOTOREALISM ENFORCEMENT RULE
All scenes must resemble frames from a high-budget historical film production.
Mandatory elements whenever relevant:
- natural skin textures
- realistic materials (wood, clay, stone, bronze, metal, parchment)
- environmental depth
- cinematic lighting contrast
- natural imperfections
- atmospheric perspective

Lighting must always be physically motivated: candlelight, firelight, torchlight, sunrise, sunset, diffused daylight through smoke/dust/fog.
Scenes must never appear flat, empty, minimal, or illustration-like.

## MATERIAL DENSITY RULE
Scenes must contain physically rich environments. Avoid empty compositions.
Include environmental elements: objects on tables, scrolls, manuscripts, pottery, fabrics, tools, architectural textures, vegetation, environmental particles (dust, smoke, fog).

## ARCHITECTURAL ACCURACY CONSTRAINT
All buildings must respect the technological capabilities of the historical period.
Forbidden unless historically justified: medieval roof shapes, tiled roofs, chimneys, glass windows, modern carpentry, symmetrical stone facades.
Architecture must appear archaeologically plausible.

## PROMPT STRUCTURE
Each prompt_export must contain ALL of these woven into one continuous paragraph:
1. Camera framing: "Wide shot of...", "Close-up on...", "Low-angle view of...", "Medium shot of..."
2. Scene description with every visible object, material, texture, color — be hyper-specific
3. Characters if present: pose, gesture, clothing fabric and color, facial expression, body language
4. Environment: what surrounds the subject, background elements, spatial depth
5. Foreground elements adding depth
6. Lighting: describe light source, direction, quality, shadows, reflections explicitly
7. Atmosphere and mood: dust, haze, humidity, temperature feel, emotional tone
8. End with these three mandatory lines in the same paragraph:
   "Style: ultra realistic documentary photography, cinematic lighting, historical reconstruction realism."
   "Visual quality: cinematic film still, 8k detail, natural textures, real-world physics."
   "Aspect ratio: 16:9"

The prompt_export MUST be at least 100 words. Be extremely descriptive and specific — Grok Image performs best with rich, concrete visual details rather than abstract concepts.

The entire prompt must be one continuous paragraph. No bullet points, no numbered lists.`;


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

    const { project_id, scene_id } = await req.json();
    if (!project_id) throw new Error("Missing project_id");

    const singleScene = !!scene_id;

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    let scenesQuery = supabase
      .from("scenes")
      .select("*")
      .eq("project_id", project_id)
      .order("scene_order", { ascending: true });
    if (singleScene) scenesQuery = scenesQuery.eq("id", scene_id);

    const { data: scenes, error: scenesErr } = await scenesQuery;
    if (scenesErr || !scenes?.length) throw new Error(singleScene ? "Scene not found." : "No scenes found. Run segmentation first.");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Calculate number of shots per scene based on sentence count
    // Short narration block = 1 shot. Scale up only for multi-sentence scenes.
    const calcShotCount = (text: string): number => {
      const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 0).length;
      return Math.max(1, sentences);
    };

    const sceneDescriptions = scenes.map((s: any) => {
      const shotCount = calcShotCount(s.source_text);
      return `Scene ${s.scene_order} (id: ${s.id}, requested_shots: ${shotCount}): "${s.title}" — ${s.source_text} — Visual intention: ${s.visual_intention || "N/A"}`;
    }).join("\n\n");

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: CINEMATIC_PROMPT_SYSTEM },
            { role: "user", content: `Generate cinematic documentary shots optimized for Grok Image for these scenes. Respect requested_shots exactly. Shot minimum rule: minimum 1 shot per scene; add extra shots only when a scene contains clear multiple visual beats. CRITICAL: prompts must stay strictly faithful to the scene text and must not introduce unrelated visual events. Follow the VISUAL CAMERA GRID to vary shot types. Apply VISUAL ANCHOR SYSTEM for recurring characters/elements.\n\n${sceneDescriptions}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_storyboard",
                description: "Generates cinematic documentary shots optimized for Grok Image for each scene.",
                parameters: {
                  type: "object",
                  properties: {
                    scenes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          scene_id: { type: "string" },
                          shots: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                shot_type: { type: "string", description: "Camera type from the Visual Camera Grid" },
                                description: { type: "string", description: "2-3 sentence vivid visual description" },
                                prompt_export: { type: "string", description: "Full Grok Image prompt, one continuous paragraph, at least 100 words, ending with Style/Visual quality/Aspect ratio lines" },
                                guardrails: { type: "string", description: "Comma-separated list of historical constraints applied" },
                              },
                              required: ["shot_type", "description", "prompt_export", "guardrails"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["scene_id", "shots"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["scenes"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "generate_storyboard" } },
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
    let storyboard: { scene_id: string; shots: { shot_type: string; description: string; prompt_export: string; guardrails: string }[] }[];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      storyboard = parsed.scenes;
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      storyboard = JSON.parse(content).scenes;
    }

    if (!Array.isArray(storyboard) || storyboard.length === 0) {
      throw new Error("AI returned no storyboard data");
    }

    if (singleScene) {
      await supabase.from("shots").delete().eq("scene_id", scene_id);
    } else {
      await supabase.from("shots").delete().eq("project_id", project_id);
    }

    const shotRows: any[] = [];
    for (const sceneData of storyboard) {
      const matchedScene = scenes.find((s: any) => s.id === sceneData.scene_id);
      if (!matchedScene) continue;
      for (let j = 0; j < sceneData.shots.length; j++) {
        const shot = sceneData.shots[j];
        shotRows.push({
          scene_id: sceneData.scene_id,
          project_id,
          shot_order: j + 1,
          shot_type: shot.shot_type,
          description: shot.description,
          prompt_export: shot.prompt_export,
          guardrails: shot.guardrails || null,
        });
      }
    }

    if (shotRows.length === 0) throw new Error("No shots generated");

    const { error: insertErr } = await supabase.from("shots").insert(shotRows);
    if (insertErr) { console.error("Insert error:", insertErr); throw new Error("Failed to save shots"); }

    await supabase.from("projects").update({ status: "storyboarded" }).eq("id", project_id);

    return new Response(JSON.stringify({ shots_count: shotRows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-storyboard error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
