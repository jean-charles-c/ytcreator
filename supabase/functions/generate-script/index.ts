import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { analysis, structure, text } = await req.json();
    if (!analysis || !structure) {
      return new Response(JSON.stringify({ error: "Analyse et structure requises." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sourceText = text ? text.slice(0, 25000) : "";

    const sectionList = structure.map((s: any) => `- ${s.section_label}: ${s.video_title}`).join("\n");

    const systemPrompt = `Tu es un scénariste documentaire YouTube expert. Tu écris des scripts immersifs pour voice-over.

MISSION : Génère un script documentaire COMPLET de 18 000 à 22 000 caractères.

STRUCTURE OBLIGATOIRE (respecte cet ordre exact) :
${sectionList}

RÈGLES D'ÉCRITURE STRICTES :
1. Chaque phrase fait MOINS de 100 caractères
2. UNE seule idée par ligne
3. Chaque scène contient MAXIMUM 3 phrases
4. Sépare chaque section par un marqueur : --- [NOM DE LA SECTION] ---
5. Le ton est immersif, captivant, mystérieux
6. Utilise des phrases courtes et percutantes
7. Alterne questions rhétoriques et affirmations
8. Crée du suspense entre les sections
9. Le Hook doit captiver en moins de 3 phrases
10. "Welcome to Mysteria Mundi" doit être une transition naturelle

FORMAT DE SORTIE :
--- HOOK ---
[phrases du hook]

--- WELCOME TO MYSTERIA MUNDI ---
[phrases]

[etc. pour chaque section]

IMPORTANT : Le script fait au MAXIMUM 22 000 caractères. Adapte la longueur au sujet — un sujet simple peut faire 10 000 caractères, un sujet riche peut aller jusqu'à 22 000. Ne rallonge JAMAIS artificiellement.`;

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
          {
            role: "user",
            content: `Analyse narrative:\n${JSON.stringify(analysis, null, 2)}\n\nStructure documentaire:\n${JSON.stringify(structure, null, 2)}\n\nTexte source (dossier de recherche):\n${sourceText}`,
          },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez." }), {
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

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-script error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
