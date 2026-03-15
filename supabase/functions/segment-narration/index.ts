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
    const targetSceneCount = Math.min(200, Math.max(10, Math.ceil(wordCount / 35)));

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

    const repairAndParseJson = (raw: string): any => {
      let cleaned = raw
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      const jsonStart = cleaned.search(/[\{\[]/);
      if (jsonStart === -1) throw new Error("No JSON found in response");
      cleaned = cleaned.substring(jsonStart);

      try { return JSON.parse(cleaned); } catch (_) { /* continue */ }

      // Fix trailing commas & control chars
      cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
      try { return JSON.parse(cleaned); } catch (_) { /* continue */ }

      // Truncated JSON: remove last incomplete item and close brackets
      const lastComplete = cleaned.lastIndexOf("},");
      if (lastComplete > 0) {
        cleaned = cleaned.substring(0, lastComplete + 1);
      }
      const ob = (cleaned.match(/{/g) || []).length;
      const cb = (cleaned.match(/}/g) || []).length;
      const oq = (cleaned.match(/\[/g) || []).length;
      const cq = (cleaned.match(/\]/g) || []).length;
      for (let i = 0; i < ob - cb; i++) cleaned += "}";
      for (let i = 0; i < oq - cq; i++) cleaned += "]";
      cleaned = cleaned.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");

      return JSON.parse(cleaned);
    };

    const parseScenesFromAi = (aiData: any) => {
      // Debug: log response structure
      const message = aiData?.choices?.[0]?.message;
      console.log("AI finish_reason:", aiData?.choices?.[0]?.finish_reason);
      console.log("AI message keys:", message ? Object.keys(message) : "no message");
      console.log("AI tool_calls count:", message?.tool_calls?.length ?? 0);
      console.log("AI content length:", message?.content?.length ?? 0);
      console.log("AI content preview:", (message?.content || "").slice(0, 200));

      // Try tool_calls first
      const toolCalls = message?.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        // Some models split across multiple tool calls - concatenate all arguments
        let allArgs = "";
        for (const tc of toolCalls) {
          const args = tc?.function?.arguments || "";
          allArgs += args;
        }
        if (allArgs) {
          console.log("Tool call args length:", allArgs.length);
          console.log("Tool call args preview:", allArgs.slice(0, 200));
          try {
            const parsed = repairAndParseJson(allArgs);
            if (Array.isArray(parsed)) return parsed;
            if (Array.isArray(parsed?.scenes)) return parsed.scenes;
          } catch (e) {
            console.warn("Failed to parse tool_call arguments:", e);
          }
        }
      }

      // Try content fallback
      const content = message?.content || "";
      if (content) {
        try {
          const parsedContent = repairAndParseJson(content);
          if (Array.isArray(parsedContent)) return parsedContent;
          if (Array.isArray(parsedContent?.scenes)) return parsedContent.scenes;
        } catch (e) {
          console.warn("Failed to parse content:", e);
        }
      }

      // Try function_call (some models use this instead of tool_calls)
      const functionCall = message?.function_call;
      if (functionCall?.arguments) {
        try {
          const parsed = repairAndParseJson(functionCall.arguments);
          if (Array.isArray(parsed)) return parsed;
          if (Array.isArray(parsed?.scenes)) return parsed.scenes;
        } catch (e) {
          console.warn("Failed to parse function_call:", e);
        }
      }

      throw new Error("AI returned no scenes");
    };

    const requestSegmentation = async (text: string, targetCount: number, strictMode: boolean) => {
      const aiResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            max_tokens: strictMode ? 16384 : 12288,
            temperature: strictMode ? 0.1 : 0.3,
            messages: [
              {
                role: "system",
                content: `You are a documentary narration segmentation engine.

Rules:
- Segment the FULL narration from first word to last word, without skipping any part.
- Keep every word from the original narration; do not add, summarize, paraphrase, or remove text.
- Preserve exact narrative order.
- Each scene MUST contain at most 2-3 sentences. Prefer shorter scenes (1-2 sentences) over longer ones.
- Create a new scene whenever the topic, subject, location, character focus, or action changes.
- Generate a short descriptive title for each scene (max 10 words).
- Generate visual_intention: a short summary of the specific topic/subject covered in this scene (NOT a visual description, but what the scene is about). IMPORTANT: visual_intention MUST be written in the SAME LANGUAGE as the narration text.
- Create approximately ${targetCount} scenes to cover 100% of the narration. More scenes is better than fewer.
${strictMode ? "- CRITICAL: This is a retry. You MUST cover the ENTIRE text from start to finish. The last scene must contain the final words of the narration." : ""}

Return data via the segment_narration tool call only.`,
              },
              {
                role: "user",
                content: text,
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
        if (aiResponse.status === 429) throw new Error("RATE_LIMIT_EXCEEDED");
        if (aiResponse.status === 402) throw new Error("PAYMENT_REQUIRED");
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

    // For very long texts (>1500 words), split into chunks and process separately
    const splitIntoParagraphs = (text: string): string[] => {
      return text.split(/\n\n+/).filter(p => p.trim().length > 0);
    };

    let allScenes: { title: string; source_text: string; visual_intention: string }[] = [];

    if (wordCount > 1500) {
      console.log(`Long narration detected (${wordCount} words). Processing in chunks.`);
      const paragraphs = splitIntoParagraphs(narrationText);
      
      // Group paragraphs into chunks of ~700 words each
      const chunks: string[] = [];
      let currentChunk = "";
      let currentWords = 0;
      for (const p of paragraphs) {
        const pWords = p.split(/\s+/).filter(Boolean).length;
        if (currentWords + pWords > 700 && currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = p;
          currentWords = pWords;
        } else {
          currentChunk += "\n\n" + p;
          currentWords += pWords;
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim());

      console.log(`Split into ${chunks.length} chunks`);

      for (let i = 0; i < chunks.length; i++) {
        const chunkWords = chunks[i].split(/\s+/).filter(Boolean).length;
        const chunkTarget = Math.max(4, Math.ceil(chunkWords / 35));
        console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunkWords} words, target ${chunkTarget} scenes)`);
        
        let chunkScenes = await requestSegmentation(chunks[i], chunkTarget, false);
        allScenes.push(...chunkScenes);
      }
    } else {
      allScenes = await requestSegmentation(narrationText, targetSceneCount, false);

      if (!isCompleteSegmentation(narrationText, allScenes)) {
        console.warn("Incomplete segmentation detected. Retrying with stricter instructions.");
        allScenes = await requestSegmentation(narrationText, targetSceneCount, true);
      }
    }

    const scenes = allScenes;

    if (scenes.length === 0) {
      throw new Error("Aucune scène générée. Veuillez réessayer.");
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
    const message = e instanceof Error ? e.message : "Unknown error";

    if (message === "RATE_LIMIT_EXCEEDED") {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message === "PAYMENT_REQUIRED") {
      return new Response(
        JSON.stringify({ error: "Payment required. Please add credits." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
