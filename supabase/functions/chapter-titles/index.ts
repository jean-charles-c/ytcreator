import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TONE_LABELS: Record<string, string> = {
  curiosity: "curiosity-driven, makes the viewer wonder 'what happens next?'",
  dramatic: "dramatic and emotionally charged, creates tension",
  informative: "clear and informative, promises concrete value",
  contrarian: "contrarian or counterintuitive, challenges common beliefs",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { chapterText, chapterLabel, tone, language } = await req.json();

    if (!chapterText) {
      return new Response(JSON.stringify({ error: "chapterText is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const toneInstruction = TONE_LABELS[tone] || TONE_LABELS.curiosity;
    const langLabel = language === "fr" ? "French" : language === "es" ? "Spanish" : language === "de" ? "German" : "English";
    const isFrench = language === "fr";

    const translationRule = isFrench
      ? ""
      : `\n- Also provide a "titleFR" field: a French translation of each title (for the creator's reference).`;

    const systemPrompt = `You are a YouTube SEO expert specializing in chapter titles.
Generate exactly 4 chapter title variants for a video chapter.

Rules:
- Each title must be ${toneInstruction}.
- Titles must be in ${langLabel}.
- Each title: 30-60 characters, punchy, optimized for YouTube engagement.${translationRule}
- hookType must be one of: "curiosity", "dramatic", "informative", "contrarian".
- No markdown, no explanation.`;

    const userPrompt = `Chapter label: "${chapterLabel || "Chapter"}"

Chapter content:
${chapterText.slice(0, 1500)}

Generate 4 title variants with tone: ${tone || "curiosity"}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_chapter_titles",
              description: "Return 4 chapter title variants.",
              parameters: {
                type: "object",
                properties: {
                  titles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        hookType: { type: "string", enum: ["curiosity", "dramatic", "informative", "contrarian"] },
                      },
                      required: ["title", "hookType"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["titles"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_chapter_titles" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      // Fallback: try to parse content as JSON
      const content = data.choices?.[0]?.message?.content || "[]";
      const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const titles = JSON.parse(cleaned);
      return new Response(JSON.stringify({ titles }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ titles: parsed.titles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chapter-titles error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
