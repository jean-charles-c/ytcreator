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

    const context = text ? text.slice(0, 15000) : "";

    const systemPrompt = `Tu es un scénariste documentaire expert spécialisé dans les documentaires mystères/histoire/science pour YouTube.

À partir de l'analyse narrative et du texte source, génère une structure documentaire complète avec exactement 9 sections dans cet ordre :

1. Hook — L'accroche qui capte immédiatement l'attention (question choc, fait stupéfiant)
2. Welcome to Mysteria Mundi — Introduction de la chaîne/série, transition vers le sujet
3. Mystery Introduction — Présentation du mystère central et de ses enjeux
4. Context Setup — Contexte historique, scientifique ou géographique nécessaire
5. Act 1 — Premier acte : la découverte, les premiers indices
6. Act 2 — Deuxième acte : complications, contradictions, approfondissement
7. Act 3 — Troisième acte : révélations, retournements
8. Climax — Point culminant : la confrontation finale avec le mystère
9. Conclusion — Résolution (ou non), ouverture, appel à l'action

Pour chaque section, fournis :
- Un titre vidéo accrocheur (celui qui apparaîtra dans la timeline YouTube)
- Une description narrative de 2-4 phrases décrivant ce qui se passe dans cette section

Réponds UNIQUEMENT avec un appel à la fonction generate_structure.`;

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
          { role: "user", content: `Analyse narrative:\n${JSON.stringify(analysis, null, 2)}\n\nTexte source:\n${context}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_structure",
              description: "Retourne la structure documentaire complète en 9 sections.",
              parameters: {
                type: "object",
                properties: {
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        section_key: { type: "string", description: "Clé de section: hook, welcome, mystery_intro, context, act1, act2, act3, climax, conclusion" },
                        section_label: { type: "string", description: "Nom de la section (ex: Hook, Welcome to Mysteria Mundi, etc.)" },
                        video_title: { type: "string", description: "Titre vidéo accrocheur pour la timeline YouTube" },
                        narrative_description: { type: "string", description: "Description narrative de 2-4 phrases" },
                      },
                      required: ["section_key", "section_label", "video_title", "narrative_description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["sections"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_structure" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Crédits AI épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ sections: result.sections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("documentary-structure error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
