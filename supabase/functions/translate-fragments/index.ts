import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FragmentInput {
  id: string;
  text: string;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fragments, sourceLanguage } = await req.json() as {
      fragments: FragmentInput[];
      sourceLanguage?: string;
    };

    if (!fragments || fragments.length === 0) {
      return new Response(JSON.stringify({ translations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const langLabels: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German" };
    const srcLang = langLabels[sourceLanguage || "en"] || "English";

    const results: Array<{ id: string; translated: string }> = [];
    const chunks = chunkArray(fragments, 25);

    for (const chunk of chunks) {
      const numberedList = chunk.map((f, i) => `${i + 1}. "${f.text}"`).join("\n");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          max_tokens: 4096,
          messages: [
            {
              role: "system",
              content: `You are a translator. Translate each narration FRAGMENT from ${srcLang} to French.
CRITICAL RULES:
- Translate ONLY the exact text given — do NOT complete, expand, or add context
- If a fragment is a partial sentence (starts mid-sentence or ends mid-sentence), translate ONLY that partial text
- Preserve the exact scope: if the source is half a sentence, the translation must also be half a sentence
- Be faithful and natural in French
- Return results via the tool call`,
            },
            {
              role: "user",
              content: `Translate each fragment to French:\n\n${numberedList}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "submit_translations",
                description: "Submit French translations for each fragment",
                parameters: {
                  type: "object",
                  properties: {
                    translations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "number", description: "1-based index matching the input list" },
                          french: { type: "string", description: "French translation of that fragment only" },
                        },
                        required: ["index", "french"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["translations"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "submit_translations" } },
        }),
      });

      if (!response.ok) {
        console.warn("Translation batch failed:", response.status);
        continue;
      }

      const data = await response.json();
      const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) continue;

      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        const items = parsed?.translations || [];
        for (const item of items) {
          const idx = (item.index ?? 0) - 1;
          if (idx >= 0 && idx < chunk.length && item.french) {
            results.push({ id: chunk[idx].id, translated: item.french.trim() });
          }
        }
      } catch (e) {
        console.warn("Failed to parse translation tool output:", e);
      }
    }

    return new Response(JSON.stringify({ translations: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-fragments error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
