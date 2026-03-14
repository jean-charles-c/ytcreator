import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 100) {
      return new Response(JSON.stringify({ error: "Texte trop court pour analyse." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Truncate to ~30k chars to stay within context limits
    const truncated = text.slice(0, 30000);

    const systemPrompt = `Tu es un analyste narratif expert en documentaires. Tu analyses des dossiers de recherche pour en extraire le potentiel narratif documentaire.

Analyse le texte fourni et identifie :

1. **Mystère central** : La question fondamentale non résolue ou le mystère qui captive l'audience.
2. **Contradiction principale** : Le paradoxe ou la contradiction la plus frappante dans le sujet.
3. **Découvertes intrigantes** : 3 à 5 faits ou révélations surprenantes tirées du document.
4. **Tensions narratives** : 5 à 7 tensions dramatiques exploitables pour structurer un documentaire. Chaque tension doit couvrir un angle différent du sujet (historique, scientifique, humain, politique, philosophique, etc.). C'est CRUCIAL d'en identifier au moins 5 pour alimenter un script long et riche.

Réponds UNIQUEMENT avec un appel à la fonction analyze_narrative.`;

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
          { role: "user", content: truncated },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_narrative",
              description: "Retourne l'analyse narrative structurée du document.",
              parameters: {
                type: "object",
                properties: {
                  central_mystery: {
                    type: "string",
                    description: "Le mystère central identifié (2-3 phrases)",
                  },
                  main_contradiction: {
                    type: "string",
                    description: "La contradiction principale (2-3 phrases)",
                  },
                  intriguing_discoveries: {
                    type: "array",
                    items: { type: "string" },
                    description: "3 à 5 découvertes intrigantes (1-2 phrases chacune)",
                  },
                  narrative_tensions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["title", "description"],
                      additionalProperties: false,
                    },
                    description: "5 à 7 tensions narratives avec titre et description",
                    minItems: 5,
                  },
                },
                required: ["central_mystery", "main_contradiction", "intriguing_discoveries", "narrative_tensions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_narrative" } },
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

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
