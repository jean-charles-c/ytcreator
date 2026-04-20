import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLASSIFY_PROMPT = `Tu classifies un sujet YouTube dans l'une des 4 formes narratives suivantes :

1. ENQUÊTE — un fait anormal à élucider, un scandale, un mystère factuel, une contradiction historique.
2. ESSAI — une idée, un concept, une thèse, une obsession technique ou philosophique. Le sujet est conceptuel.
3. PORTRAIT — une figure (personne, machine iconique, lieu). Le sujet EST la figure.
4. RÉCIT HISTORIQUE — une genèse, l'histoire d'une création, l'évolution d'une idée sur une période datée.

Règles de classification :
- Si le sujet est "Pourquoi X" ou "Comment X a pu arriver" → plutôt ENQUÊTE.
- Si le sujet est "Qu'est-ce que X" ou "Ce que X dit de Y" → plutôt ESSAI.
- Si le sujet est une personne ou une machine identifiée comme sujet central → plutôt PORTRAIT.
- Si le sujet est "Comment est née X" ou "L'histoire de X" avec une frise chronologique claire → plutôt RÉCIT HISTORIQUE.

Un sujet philosophique traité conceptuellement → ESSAI.
Un philosophe traité comme figure → PORTRAIT.
Un mouvement philosophique dans son évolution → RÉCIT HISTORIQUE.

Analyse fournie :
{analysis}

Retourne un objet JSON valide avec exactement ces champs :
{
  "form": "enquete" | "essai" | "portrait" | "recit_historique",
  "confidence": 0.0 - 1.0,
  "alternative": "enquete" | "essai" | "portrait" | "recit_historique",
  "reasoning": "1-2 phrases expliquant le choix"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { analysis } = await req.json();
    if (!analysis) {
      return new Response(JSON.stringify({ error: "Missing analysis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = CLASSIFY_PROMPT.replace("{analysis}", JSON.stringify(analysis, null, 2));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      // Try to extract JSON from content
      const match = content.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error("Invalid JSON response from AI");
    }

    // Validate result
    const validForms = ["enquete", "essai", "portrait", "recit_historique"];
    if (!validForms.includes(result.form)) {
      result.form = "essai"; // safe default
    }
    if (!validForms.includes(result.alternative)) {
      result.alternative = result.form === "essai" ? "portrait" : "essai";
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-narrative-form error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
