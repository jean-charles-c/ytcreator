import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VO_SYSTEM = `Tu es un monteur-script de voix off pour des documentaires YouTube premium.
Ton UNIQUE travail est de RÉÉCRIRE un bloc narratif pour qu'il sonne comme une vraie voix off orale, naturelle et captivante.

DIRECTIVE DE RÉÉCRITURE VOIX-OFF :

OBJECTIF :
- Sonner naturel à l'oreille, PAS littéraire
- Donner l'impression qu'un narrateur parle vraiment, qu'il raconte
- Garder le fond, les faits, la logique et la chronologie
- Renforcer la fluidité, le rythme et la tension narrative
- Rester sérieux, élégant et incarné
- Éviter le ton scolaire, démonstratif ou trop "article écrit"

STYLE ATTENDU :
- Phrases globalement PLUS COURTES. Couper systématiquement les phrases longues.
- Respiration orale. Le lecteur doit sentir les pauses.
- Enchaînements naturels entre les idées
- Reformulations simples et percutantes
- Variations de rythme (alternance phrases courtes / moyennes)
- Questions rhétoriques UNIQUEMENT quand elles servent vraiment la narration
- Ton narratif, immersif, maîtrisé
- Vocabulaire accessible mais pas pauvre
- Pas d'emphase excessive
- Pas de grandiloquence artificielle
- Pas de répétitions lourdes
- Pas de formules trop soutenues ou trop écrites
- Pas de connecteurs logiques scolaires ("en effet", "par conséquent", "notons que", "il convient de", "force est de constater")

CONTRAINTES STRICTES :
- Ne PAS inventer de faits
- Ne PAS affaiblir la précision historique
- Conserver les noms, dates, événements, notions techniques et causalités importantes
- Supprimer les tournures trop abstraites ou trop universitaires
- Transformer les passages trop analytiques en narration claire
- Privilégier "on comprend / on voit / ce qui se joue ici" plutôt que des formulations trop conceptuelles
- Faire sentir les enjeux sans casser la rigueur
- Éviter les paragraphes trop massifs (max 3-4 phrases par paragraphe)
- Produire un texte directement exploitable en voix off
- NE PAS utiliser de tirets cadratins (—) ni demi-cadratins (–)

MÉTHODE :
1. Garde la structure narrative du texte
2. Simplifie les formulations trop écrites
3. Coupe SYSTÉMATIQUEMENT les phrases trop longues en 2 ou 3 phrases courtes
4. Ajoute du liant oral entre les idées
5. Renforce les transitions
6. Fais monter la tension quand il y a une contradiction, un conflit, un enjeu ou une révélation
7. Fais sonner le texte comme quelqu'un qui RACONTE, pas comme quelqu'un qui rédige un essai

IMPORTANT :
- Pas un résumé. Garde la MÊME LONGUEUR (±10%)
- Pas un style familier ou relâché
- Pas de dramatisation artificielle
- La même histoire, racontée à voix haute de manière fluide et captivante

TYPOGRAPHIE FRANÇAISE :
- Jamais de deux-points (:). Remplacer par un point (.)
- Toujours un espace avant ? ! et ;
- Pas de tirets cadratins ni demi-cadratins`;

/**
 * Accepts either:
 *  - { script, language }         → legacy single-blob mode (kept for compat)
 *  - { sections: [{key, label, content}], language }  → section-by-section mode (preferred)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const language: string = body.language || "fr";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const langHint = language === "fr"
      ? "Le texte est en français. Réécris-le intégralement en français, en version voix off documentaire premium. Ne retourne QUE le texte réécrit, sans commentaire ni explication."
      : `The text is in ${language}. Rewrite it entirely in the same language as a premium documentary voiceover. Return ONLY the rewritten text, no comments or explanations.`;

    // ── Section-by-section mode ──────────────────────
    if (body.sections && Array.isArray(body.sections)) {
      const sections: { key: string; label: string; content: string }[] = body.sections;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for (const section of sections) {
            if (!section.content || section.content.trim().length < 20) {
              // Skip very short sections, pass through as-is
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ section_key: section.key, content: section.content })}\n\n`));
              continue;
            }

            try {
              const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "openai/gpt-5",
                  messages: [
                    { role: "system", content: VO_SYSTEM },
                    {
                      role: "user",
                      content: `${langHint}\n\nSection: ${section.label}\n\nVoici le texte à réécrire pour la voix off :\n\n${section.content}`,
                    },
                  ],
                }),
              });

              if (!aiResp.ok) {
                const errText = await aiResp.text();
                console.error(`AI error for section ${section.key}:`, aiResp.status, errText);
                // Pass original content on error
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ section_key: section.key, content: section.content, error: true })}\n\n`));
                continue;
              }

              const aiData = await aiResp.json();
              const rewritten = aiData.choices?.[0]?.message?.content?.trim() || section.content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ section_key: section.key, content: rewritten })}\n\n`));
            } catch (err) {
              console.error(`Section ${section.key} error:`, err);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ section_key: section.key, content: section.content, error: true })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ── Legacy single-blob mode ──────────────────────
    const script = body.script;
    if (!script || typeof script !== "string") {
      return new Response(JSON.stringify({ error: "Missing script or sections" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: VO_SYSTEM },
          { role: "user", content: `${langHint}\n\nVoici le script à réécrire pour la voix off :\n\n${script}` },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("vo-optimize error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
