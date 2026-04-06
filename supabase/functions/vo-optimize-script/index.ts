import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SECTION_TAGS = [
  "[[HOOK]]", "[[CONTEXT]]", "[[PROMISE]]", "[[ACT1]]", "[[ACT2]]",
  "[[ACT2B]]", "[[ACT3]]", "[[CLIMAX]]", "[[INSIGHT]]", "[[CONCLUSION]]",
];

const VO_SYSTEM = `Tu es un monteur-script de voix off pour des documentaires YouTube premium.
Ton UNIQUE travail est de RÉÉCRIRE un texte complet pour qu'il sonne comme une vraie voix off orale, naturelle et captivante.

BUT EXACT DU RENDU :
Un texte qui donne l'impression d'être directement prononcé à voix haute par un narrateur calme, maîtrisé, incarné.
Le texte ne doit pas sonner comme un article, un essai, une fiche, une synthèse, ni une dissertation.
Il doit sonner comme une narration orale haut de gamme, fluide, sobre, tendue, claire.

EFFET RECHERCHÉ :
- plus oral que littéraire
- plus incarné qu'explicatif
- plus rythmé qu'analytique
- plus narratif que démonstratif

LE RYTHME EST PRIORITAIRE :
Le rythme doit être construit de manière très précise.
- alterner phrases très courtes, phrases moyennes, puis phrases un peu plus développées
- utiliser régulièrement des phrases-fragments pour créer la respiration
- créer du relief avec des blocs du type.
  "Et pourtant, il y a un problème."
  "Un problème simple."
  "Un problème de chiffres."
- utiliser parfois des paragraphes composés de 1 seule phrase
- utiliser parfois des successions de 2 à 5 phrases très courtes
- casser volontairement les longues explications en unités orales
- faire entendre les transitions, pas seulement les expliquer
- finir souvent les paragraphes sur une relance implicite ou une tension narrative

IMPORTANT :
Tu ne dois pas seulement simplifier.
Tu dois RECOMPOSER LE TEXTE POUR L'ORAL.

CADENCE DE PHRASE À REPRODUIRE :
- phrase d'ouverture courte de contexte
- 2 ou 3 phrases courtes qui posent la tension
- une question de narration
- un paragraphe plus explicatif
- retour à des phrases courtes martelées
- nouvelle montée explicative
- conclusion brève et retombée nette

EXEMPLE DE DYNAMIQUE À IMITER :
- "Maranello, 1962."
- "Et pourtant, il y a un problème."
- "Un problème simple."
- "Un problème de chiffres."
- "C'est là que tout se joue."
- "Et ça change tout."
- "C'est ça, la clé."

STYLE DE LANGUE :
- français naturel, élégant, sobre
- aucune familiarité
- aucune grandiloquence
- aucune formule creuse
- vocabulaire simple mais précis
- ton sérieux, premium, maîtrisé
- éviter tout effet "copie scolaire"
- éviter tout jargon théorique inutile
- éviter les formulations abstraites comme.
  "ceci illustre", "cela démontre", "dans une logique de", "il convient de"
- préférer.
  "ce qui se joue ici", "on comprend alors", "c'est là que", "au fond", "en clair"

CONTRAINTES ABSOLUES :
- ne rien inventer
- ne supprimer aucun élément important du raisonnement
- conserver les faits, noms, dates, liens causaux, notions techniques utiles
- conserver la chronologie générale
- ne pas transformer le texte en résumé
- ne pas surdramatiser
- ne pas faire du roman
- ne pas faire du style lyrique
- ne pas tout uniformiser en phrases moyennes
- ne pas lisser le texte
- ne pas écrire "propre"
- écrire "parlable"

CONSIGNE DE CADENCE SUPPLÉMENTAIRE :
Ne produis surtout pas un flux homogène.
Le texte doit respirer en permanence.

{{CADENCE_RULES}}`;

INTERDICTIONS :
- ne pas écrire comme un journaliste magazine
- ne pas écrire comme un historien universitaire
- ne pas écrire comme un essayiste
- ne pas écrire comme un article Wikipédia amélioré
- ne pas faire un texte uniformément fluide
- ne pas chercher la perfection littéraire
- chercher l'efficacité orale

RÈGLES DE RÉÉCRITURE :
- coupe les phrases trop longues
- remplace les articulations scolaires par des transitions orales
- transforme les explications denses en séquences respirables
- utilise des répétitions contrôlées pour marteler une idée importante
- utilise des paragraphes courts
- fais sentir la progression du récit à chaque bloc
- quand une idée est forte, isole-la
- quand une contradiction apparaît, ralentis et marque-la
- quand la réponse arrive, formule-la simplement
- quand la conclusion tombe, resserre fortement le rythme

TYPOGRAPHIE FRANÇAISE :
- Jamais de deux-points (:). Remplacer par un point (.)
- Toujours un espace avant ? ! et ;
- Pas de tirets cadratins ni demi-cadratins

FORME FINALE :
- paragraphes courts
- texte directement exploitable en voix off
- aucune introduction du type "voici une version"
- aucune conclusion hors texte
- rendre seulement le texte final`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const language: string = body.language || "fr";
    const model: string = body.model || "openai/gpt-5";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ── Global script mode (preferred) ──────────────
    // Receives the full script with [[TAGS]], rewrites globally, returns with tags preserved
    const script = body.script;
    if (!script || typeof script !== "string") {
      return new Response(JSON.stringify({ error: "Missing script" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langHint = language === "fr"
      ? "Le texte est en français. Réécris-le intégralement en français."
      : `The text is in ${language}. Rewrite it entirely in the same language.`;

    const userPrompt = `${langHint}

INSTRUCTION STRUCTURELLE CRITIQUE :
Le texte contient des marqueurs de sections entre doubles crochets (${SECTION_TAGS.join(", ")}).
Tu DOIS conserver TOUS ces marqueurs EXACTEMENT tels quels, à leur position logique dans le texte.
Ne supprime, ne modifie et ne déplace aucun marqueur.
Réécris uniquement le contenu textuel entre les marqueurs.

Voici le texte à réécrire pour la voix off :

${script}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: VO_SYSTEM },
          { role: "user", content: userPrompt },
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
