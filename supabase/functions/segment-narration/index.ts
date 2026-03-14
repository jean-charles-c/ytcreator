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

    // Fetch project & verify ownership
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) throw new Error("Project not found");
    if (!project.narration?.trim()) throw new Error("No narration to segment");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Call AI to segment
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
              content: `You are a documentary narration segmentation engine. Given a voice-over script, split it into distinct visual scenes (SceneBlocks). Each scene should represent a coherent visual moment that could be illustrated.

Rules:
- Keep every word from the original narration; do not add or remove text.
- Each scene should map to 1-3 sentences from the source.
- Generate a short descriptive title for each scene (max 10 words).
- Generate a visual_intention: a short sentence describing what this scene should look like visually in a documentary context.
- Preserve the narrative order.
- Output between 3 and 15 scenes depending on text length.

Return ONLY a JSON array using this exact structure, no markdown, no explanation:
[{"title":"...","source_text":"...","visual_intention":"..."}]`,
            },
            {
              role: "user",
              content: project.narration,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "segment_narration",
                description:
                  "Segments a documentary narration into visual scenes.",
                parameters: {
                  type: "object",
                  properties: {
                    scenes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          source_text: { type: "string" },
                          visual_intention: { type: "string" },
                        },
                        required: [
                          "title",
                          "source_text",
                          "visual_intention",
                        ],
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
            function: { name: "segment_narration" },
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
    let scenes: { title: string; source_text: string; visual_intention: string }[];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      scenes = parsed.scenes;
    } else {
      // Fallback: try parsing content directly
      const content = aiData.choices?.[0]?.message?.content || "";
      scenes = JSON.parse(content);
    }

    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error("AI returned no scenes");
    }

    // Delete existing scenes for this project
    await supabase.from("scenes").delete().eq("project_id", project_id);

    // Insert new scenes
    const sceneRows = scenes.map((s, i) => ({
      project_id,
      scene_order: i + 1,
      title: s.title,
      source_text: s.source_text,
      visual_intention: s.visual_intention,
    }));

    const { error: insertErr } = await supabase.from("scenes").insert(sceneRows);
    if (insertErr) {
      console.error("Insert error:", insertErr);
      throw new Error("Failed to save scenes");
    }

    // Update project status and scene count
    await supabase
      .from("projects")
      .update({ status: "segmented", scene_count: scenes.length })
      .eq("id", project_id);

    return new Response(JSON.stringify({ scenes: sceneRows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("segment-narration error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
