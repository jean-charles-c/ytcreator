import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { analysis, text } = await req.json();
    if (!analysis) {
      return new Response(JSON.stringify({ error: "Analyse narrative requise." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const context = text ? text.slice(0, 5000) : "";

    const systemPrompt = `Tu es un expert en packaging YouTube spécialisé dans les documentaires mystères/histoire/science.

À partir de l'analyse narrative fournie, génère 10 titres YouTube optimisés pour le clic.

Règles strictes :
- Chaque titre fait MOINS de 60 caractères
- Orientés curiosité — ils doivent donner envie de cliquer
- Ne JAMAIS révéler la réponse ou la conclusion
- Utiliser des patterns éprouvés : questions, superlatifs, paradoxes, "Ce que...", "Pourquoi..."
- Classe-les du plus fort potentiel de clic au moins fort (1 = meilleur)

Réponds UNIQUEMENT avec un appel à la fonction generate_youtube_titles.`;

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
          { role: "user", content: `Analyse narrative:\n${JSON.stringify(analysis, null, 2)}\n\nExtrait du document:\n${context}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_youtube_titles",
              description: "Retourne 10 titres YouTube classés par potentiel de clic.",
              parameters: {
                type: "object",
                properties: {
                  titles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        rank: { type: "number", description: "Classement 1-10 (1 = meilleur)" },
                        title: { type: "string", description: "Le titre YouTube (<60 chars)" },
                        hook_type: { type: "string", description: "Type de hook: question, paradoxe, superlatif, mystère, révélation" },
                      },
                      required: ["rank", "title", "hook_type"],
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
        tool_choice: { type: "function", function: { name: "generate_youtube_titles" } },
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

    return new Response(JSON.stringify({ titles: result.titles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("youtube-packaging error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
