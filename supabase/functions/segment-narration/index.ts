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
      Deno.env.get("SUPABASE_ANON_KEY")!,
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

    const narrationText = project.narration.trim();
    const wordCount = narrationText.split(/\s+/).filter(Boolean).length;
    const targetSceneCount = Math.min(140, Math.max(8, Math.ceil(wordCount / 55)));

    const normalizeForCoverage = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

    const isCompleteSegmentation = (
      originalNarration: string,
      segmentedScenes: { source_text: string }[]
    ) => {
      const original = normalizeForCoverage(originalNarration);
      const segmented = normalizeForCoverage(
        segmentedScenes.map((scene) => scene.source_text).join(" ")
      );

      if (!original || !segmented) return false;

      const originalWords = original.split(" ");
      const segmentedWords = segmented.split(" ");
      const headSample = originalWords.slice(0, 20).join(" ");
      const tailSample = originalWords.slice(-20).join(" ");
      const coverageRatio = segmentedWords.length / originalWords.length;

      return (
        coverageRatio >= 0.9 &&
        segmented.includes(headSample) &&
        segmented.includes(tailSample)
      );
    };

    const parseScenesFromAi = (aiData: any) => {
      const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];

      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.scenes)) return parsed.scenes;
      }

      const content = aiData?.choices?.[0]?.message?.content || "";
      const parsedContent = JSON.parse(content);
      if (Array.isArray(parsedContent)) return parsedContent;
      if (Array.isArray(parsedContent?.scenes)) return parsedContent.scenes;

      throw new Error("AI returned no scenes");
    };

    const requestSegmentation = async (strictMode: boolean) => {
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
            max_tokens: strictMode ? 12288 : 8192,
            temperature: strictMode ? 0.1 : 0.3,
            messages: [
              {
                role: "system",
                content: `You are a documentary narration segmentation engine.

Rules:
- Segment the FULL narration from first word to last word, without skipping any part.
- Keep every word from the original narration; do not add, summarize, paraphrase, or remove text.
- Preserve exact narrative order.
- Each scene should map to 1-3 sentences from the source.
- Generate a short descriptive title for each scene (max 10 words).
- Generate visual_intention: one short sentence describing the documentary visual.
- Create as many scenes as needed to cover 100% of the narration (target around ${targetSceneCount} scenes for this input).
${strictMode ? "- This is a retry: verify that the final scene includes the ending of the narration." : ""}

Return data via the segment_narration tool call only.`,
              },
              {
                role: "user",
                content: narrationText,
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
          throw new Error("RATE_LIMIT_EXCEEDED");
        }
        if (aiResponse.status === 402) {
          throw new Error("PAYMENT_REQUIRED");
        }
        throw new Error("AI gateway error");
      }

      const aiData = await aiResponse.json();
      const parsedScenes = parseScenesFromAi(aiData);

      if (!Array.isArray(parsedScenes) || parsedScenes.length === 0) {
        throw new Error("AI returned no scenes");
      }

      return parsedScenes as {
        title: string;
        source_text: string;
        visual_intention: string;
      }[];
    };

    let scenes = await requestSegmentation(false);

    if (!isCompleteSegmentation(narrationText, scenes)) {
      console.warn("Incomplete segmentation detected. Retrying with stricter instructions.");
      scenes = await requestSegmentation(true);
    }

    if (!isCompleteSegmentation(narrationText, scenes)) {
      throw new Error(
        "La segmentation est incomplète. Réessaie avec un texte plus court ou relance la segmentation."
      );
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
