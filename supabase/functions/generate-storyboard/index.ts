import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const HISTORICAL_REALISM_SYSTEM = `You are a documentary storyboard generator with strict Historical Realism Guardrails.

## SHOT GENERATION
For each scene, generate 2-3 documentary-style shots with varied camera perspectives.

Shot types (vary across scenes):
- Establishing Shot: wide/aerial view setting the context
- Activity Shot: medium shot showing action or movement
- Detail Shot: close-up on a significant object or texture
- Portrait Shot: close framing of a person or character
- POV Shot: subjective point of view

## HISTORICAL REALISM GUARDRAILS (MANDATORY)
Every prompt MUST enforce these rules. Violations are not acceptable.

### Architecture & Setting
- Only period-accurate architecture: no modern materials (concrete, glass facades, steel beams) in pre-industrial scenes
- Building materials must match era and region: mud-brick, timber, stone, thatch, terracotta
- Urban layouts must reflect historical reality: narrow streets, open markets, no paved roads before appropriate era

### Costumes & People
- Clothing must be era-appropriate: fabrics, dyes, cuts, and accessories matching the period
- No synthetic fabrics, modern hairstyles, or contemporary accessories
- Social class distinctions visible through clothing quality and ornamentation

### Lighting & Atmosphere
- Natural lighting only for pre-electric eras: sunlight, firelight, candlelight, oil lamps
- Physical light behavior: soft shadows from diffused daylight, warm flickering from flames
- Atmospheric conditions matching geography: desert haze, humid tropical air, northern overcast

### Visual Style (ENFORCED)
- Photorealistic documentary style inspired by BBC Earth / National Geographic cinematography
- NO fantasy, concept art, illustration, painting, 3D render, or stylized looks
- Camera perspective must feel like a real documentary crew filming on location
- Film grain and slight color grading reminiscent of high-end documentary footage
- Depth of field consistent with real camera lenses (not CGI perfect focus)

### Material & Texture
- Surfaces must show realistic wear: patina on metal, weathering on wood, dust on roads
- Fabrics must have visible texture: weave patterns, natural creases, aging
- Food, goods, and trade items must be period-accurate

## OUTPUT FORMAT
For each shot provide:
- shot_type: camera perspective type
- description: vivid visual description (2-3 sentences) grounded in the scene narrative
- prompt_export: a self-contained image generation prompt enforcing ALL guardrails above. Must include: photorealistic documentary style, specific lighting, camera angle, period-accurate details, material textures, BBC/National Geographic cinematography quality
- guardrails: a short comma-separated list of the specific historical constraints applied (e.g. "Tang dynasty architecture, silk road trade goods, natural sunlight, linen and wool fabrics, mud-brick walls")`;

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
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { project_id } = await req.json();
    if (!project_id) throw new Error("Missing project_id");

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    const { data: scenes, error: scenesErr } = await supabase
      .from("scenes")
      .select("*")
      .eq("project_id", project_id)
      .order("scene_order", { ascending: true });
    if (scenesErr || !scenes?.length) throw new Error("No scenes found. Run segmentation first.");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sceneDescriptions = scenes.map((s: any) =>
      `Scene ${s.scene_order} (id: ${s.id}): "${s.title}" — ${s.source_text} — Visual intention: ${s.visual_intention || "N/A"}`
    ).join("\n\n");

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
            { role: "system", content: HISTORICAL_REALISM_SYSTEM },
            { role: "user", content: `Generate documentary shots with strict historical realism for these scenes:\n\n${sceneDescriptions}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_storyboard",
                description: "Generates historically accurate documentary shots for each scene.",
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
                                shot_type: { type: "string" },
                                description: { type: "string" },
                                prompt_export: { type: "string" },
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

    await supabase.from("shots").delete().eq("project_id", project_id);

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
