import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LANG_LABELS: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { analysis, text, language } = await req.json();
    if (!analysis) {
      return new Response(JSON.stringify({ error: "Analyse narrative requise." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const lang = language || "en";
    const langLabel = LANG_LABELS[lang] || "English";
    const context = text ? text.slice(0, 5000) : "";

    const systemPrompt = `You are a YouTube SEO packaging expert specializing in mystery/history/science documentaries.

From the narrative analysis provided, generate ALL of the following IN ${langLabel.toUpperCase()}:

1. **10 YouTube titles** optimized for clicks
2. **1 YouTube description** optimized for SEO (200-400 words)
3. **YouTube tags** as a comma-separated list (STRICTLY under 500 characters total)

TITLE RULES:
- Each title is UNDER 60 characters
- Curiosity-driven — must make people want to click
- NEVER reveal the answer or conclusion
- Use proven patterns: questions, superlatives, paradoxes, "What...", "Why..."
- Rank from highest click potential to lowest (1 = best)

DESCRIPTION RULES:
- Start with a compelling 2-sentence hook
- Include relevant keywords naturally
- Add timestamps placeholders (00:00 Introduction, etc.)
- End with a call to action (subscribe, like, comment)
- Include 2-3 relevant hashtags

TAGS RULES:
- Comma-separated, no # symbol
- Mix broad and specific terms
- Total length MUST be under 500 characters
- Include topic keywords, related searches, and channel-relevant terms

EVERYTHING must be written in ${langLabel}. Respond ONLY with a call to generate_youtube_package.`;

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
          { role: "user", content: `Narrative analysis:\n${JSON.stringify(analysis, null, 2)}\n\nDocument excerpt:\n${context}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_youtube_package",
              description: "Returns 10 YouTube titles, a SEO description, and tags.",
              parameters: {
                type: "object",
                properties: {
                  titles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        rank: { type: "number", description: "Ranking 1-10 (1 = best)" },
                        title: { type: "string", description: "YouTube title (<60 chars)" },
                        hook_type: { type: "string", description: "Hook type: question, paradox, superlative, mystery, revelation" },
                      },
                      required: ["rank", "title", "hook_type"],
                      additionalProperties: false,
                    },
                  },
                  description: {
                    type: "string",
                    description: "SEO-optimized YouTube video description (200-400 words)",
                  },
                  tags: {
                    type: "string",
                    description: "Comma-separated YouTube tags, strictly under 500 characters total",
                  },
                },
                required: ["titles", "description", "tags"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_youtube_package" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans quelques instants." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits AI épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);

    // Ensure tags are under 500 chars
    let tags = result.tags || "";
    if (tags.length > 500) {
      const tagList = tags.split(",").map((t: string) => t.trim());
      let truncated = "";
      for (const tag of tagList) {
        const next = truncated ? `${truncated}, ${tag}` : tag;
        if (next.length > 500) break;
        truncated = next;
      }
      tags = truncated;
    }

    return new Response(JSON.stringify({ titles: result.titles, description: result.description, tags }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("youtube-packaging error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
