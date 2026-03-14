import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    // Verify user
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { project_id } = await req.json();
    if (!project_id) throw new Error("Missing project_id");

    // Verify ownership
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) throw new Error("Project not found");

    // Fetch scenes
    const { data: scenes, error: scenesErr } = await supabase
      .from("scenes")
      .select("*")
      .eq("project_id", project_id)
      .order("scene_order", { ascending: true });
    if (scenesErr || !scenes?.length) throw new Error("No scenes found. Run segmentation first.");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build scene descriptions for the AI
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
            {
              role: "system",
              content: `You are a documentary storyboard generator. For each scene provided, generate 2-3 documentary-style shots with varied camera perspectives.

Shot types to use (vary them across scenes):
- Establishing Shot: wide/aerial view setting the context
- Activity Shot: medium shot showing action or movement
- Detail Shot: close-up on a significant object or texture
- Portrait Shot: close framing of a person or character
- POV Shot: subjective point of view

For each shot, provide:
- shot_type: one of the types above
- description: a vivid, specific visual description (2-3 sentences) grounded in the scene's narrative
- prompt_export: a ready-to-use image generation prompt for Grok Image, emphasizing photorealistic documentary style, specific lighting, camera angle, and historical accuracy

Rules:
- Generate exactly 2-3 shots per scene
- Vary perspectives within each scene (don't repeat the same shot type)
- Keep descriptions anchored to the source narration
- prompt_export should be self-contained and detailed enough for image generation
- Include lighting, atmosphere, camera angle, and period-accurate details in prompts`,
            },
            {
              role: "user",
              content: `Generate documentary shots for these scenes:\n\n${sceneDescriptions}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_storyboard",
                description: "Generates documentary shots for each scene.",
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
                              },
                              required: ["shot_type", "description", "prompt_export"],
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
          tool_choice: {
            type: "function",
            function: { name: "generate_storyboard" },
          },
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
    let storyboard: { scene_id: string; shots: { shot_type: string; description: string; prompt_export: string }[] }[];

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

    // Delete existing shots
    await supabase.from("shots").delete().eq("project_id", project_id);

    // Build shot rows
    const shotRows: any[] = [];
    for (const sceneData of storyboard) {
      const sceneId = sceneData.scene_id;
      // Verify scene belongs to project
      const matchedScene = scenes.find((s: any) => s.id === sceneId);
      if (!matchedScene) continue;

      for (let j = 0; j < sceneData.shots.length; j++) {
        const shot = sceneData.shots[j];
        shotRows.push({
          scene_id: sceneId,
          project_id,
          shot_order: j + 1,
          shot_type: shot.shot_type,
          description: shot.description,
          prompt_export: shot.prompt_export,
        });
      }
    }

    if (shotRows.length === 0) throw new Error("No shots generated");

    const { error: insertErr } = await supabase.from("shots").insert(shotRows);
    if (insertErr) {
      console.error("Insert error:", insertErr);
      throw new Error("Failed to save shots");
    }

    // Update project status
    await supabase
      .from("projects")
      .update({ status: "storyboarded" })
      .eq("id", project_id);

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
