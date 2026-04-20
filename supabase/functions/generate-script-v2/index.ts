import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
};

const sseEncoder = new TextEncoder();
function encodeSseData(data: string): Uint8Array {
  return sseEncoder.encode(`data: ${data}\n\n`);
}

// ─── NARRATIVE FORM PROMPTS ───────────────────────────────────────────────────
const FORM_PROMPTS: Record<string, string> = {
  enquete: `Tu écris une ENQUÊTE. Un fait ne colle pas. Tu suis les pistes, tu révèles ce qui était caché, tu reconstitues.

L'énergie d'une enquête :
- Tension mystère → vérité. Le spectateur doit vouloir savoir ce qui vient ensuite.
- Chronologique dans les grandes lignes. Les flashbacks sont permis quand ils servent la révélation.
- Tu parles au spectateur. Tu construis le suspens avec lui, tu doutes avec lui.
- Le climax est une VRAIE révélation — pas un récapitulatif déguisé.
- La fin referme la boucle, mais peut ouvrir sur un écho (ce qui reste troublant).

Ce qui compte :
- L'anomalie de départ est vraiment anormale. Pas un hook artificiel fabriqué pour vendre.
- Chaque piste apporte un fait nouveau. Pas de redite sous un autre angle.
- Les sources, dates, noms, chiffres sont précis et ancrés.
- Le narrateur n'est pas neutre. Il cherche, il doute, il change d'avis.

Anti-patterns à fuir :
- Faux mystère ("et pourtant quelque chose cloche", "mais un détail va tout changer")
- Climax qui récapitule au lieu de révéler
- Rebondissements inventés pour tenir l'attention
- Clichés type "enquête" ("une simple question en apparence", "personne n'avait remarqué")

Respiration typique (organique, pas imposée) :
- Un fait qui dérange, concret et daté
- Le contexte de ce qu'on croyait savoir
- Les pistes, une par une, chacune apportant du neuf
- Le moment de bascule — LA pièce qui change la lecture
- La vérité reconstituée
- Ce qui reste troublant après coup

La tension vient du savoir caché, pas de la dramatisation.`,

  essai: `Tu écris un ESSAI. Pas une enquête, pas un portrait. Un essai pense à voix haute.

L'énergie d'un essai :
- Tu déploies UNE idée. Tu la retournes, tu la creuses, tu la mets à l'épreuve.
- Tu n'accumules pas des exemples (caserne + école + hôpital + usine). Tu prends UN cas et tu y reviens plusieurs fois sous des angles différents, tu le laisses résonner.
- Tu fais des détours, des retours en arrière, des parenthèses — c'est même nécessaire.
- Le narrateur est VISIBLE en tant que penseur. "Voilà ce que je crois." "Et pourtant." "Je me demande si."
- La fin n'est pas une résolution. C'est une question plus profonde que celle du début, ou une image qui résonne.

Ce qui compte :
- UN cas concret central, pas un catalogue. Si tu as 5 exemples, prends-en 2 et approfondis-les.
- Tu nuances. Tu intègres ce qui résiste à ta thèse, tu ne l'évites pas.
- Tu fais confiance à l'auditeur. Tu suggères, tu ne surexpliques pas.
- Le rythme varie vraiment : un paragraphe long et méandreux, puis deux phrases sèches. Pas une cadence uniforme.

Anti-patterns à fuir (ESSENTIEL pour cette forme) :
- CATALOGUE D'EXEMPLES : "dans X... puis dans Y... puis dans Z... puis dans W..." — c'est le piège principal. Arrête-toi sur UN cas, creuse-le, reviens dessus.
- Paragraphes qui ont tous la même courbe (pose de scène → description → phrase sentencieuse finale). Cette cadence mécanique est mortelle.
- Transitions en "sauf que", "pourtant", "reste que" comme des soudures visibles entre sections.
- Phrases finales qui ont toutes la même gravité aphoristique.
- Boucles circulaires imposées (revenir au lieu/image d'ouverture à la fin parce que "ça fait propre").
- Conclusions qui transforment tout en leçon.

Ce que tu fais à la place :
- Tu t'ancres dans un cas concret, tu y reviens plusieurs fois.
- Tu laisses des pensées inachevées quand ça sert le propos.
- Tu fais des paragraphes de longueurs vraiment différentes.
- Tu peux finir sur une question, une image, une hésitation — jamais sur un aphorisme clôturant ni sur un CTA.

Respiration typique (organique) :
- Une ouverture qui engage : une scène, une image, une question, ou une tension.
- Le déploiement : tu suis le fil, tu ajoutes des couches, tu nuances, tu creuses.
- La complication : ce qui résiste à ta thèse, intégré frontalement.
- L'ouverture finale : tu ne conclus pas, tu ouvres sur plus grand.

Le rythme est celui de la pensée, pas du suspense.`,

  portrait: `Tu peins un PORTRAIT. Pas une biographie, pas une enquête. Tu montres l'essence d'une figure.

L'énergie d'un portrait :
- Associatif, pas chronologique. Tu entres par un angle particulier (une obsession, une habitude, une rencontre) et tu laisses le portrait se dessiner.
- Les contradictions de la figure sont la matière première, pas un problème à résoudre.
- Anecdotique : un détail vrai vaut dix généralités. Un geste rapporté, un objet, une phrase dite un soir.
- Pas de climax. La figure EST l'univers. Tu ne résous pas la figure.

Ce qui marche :
- Les anecdotes sont spécifiques et sourcées. Pas "il était connu pour être exigeant" mais "il a refait tourner Niki Lauda douze fois sur un même virage, un soir d'octobre 1976".
- Tu n'évites pas les zones d'ombre, les échecs, les laideurs.
- Tu montres comment la figure était vue par ses contemporains, et ce qu'on en pense aujourd'hui. Les deux lectures peuvent cohabiter.
- Tu laisses le spectateur SENTIR la personne, pas l'admirer ni la démolir.

Anti-patterns à fuir :
- Énumération biographique ("né en X, a fait Y, puis Z, puis W"). Mortel.
- Hagiographie : la figure est un génie parfait.
- Démythification facile : "en fait, c'était un monstre" (aussi réducteur que l'hagiographie).
- Listes de "réalisations" ou de "moments-clés".
- Conclusions qui verrouillent la figure dans une formule ("au fond, c'était un homme qui...").

Respiration typique (organique) :
- Un détail qui incarne : un geste, un objet, une phrase.
- D'où vient la figure : ce qui l'a formée, ses fidélités, ses ruptures.
- Son obsession centrale : ce qui la traverse partout.
- Ses contradictions, frontales.
- L'héritage ou ce qui reste d'elle aujourd'hui, sans verrouillage.
- Une image finale qui la fixe sans la figer.

Tu ne racontes pas une vie. Tu la rends présente.`,

  recit_historique: `Tu racontes une GENÈSE. Récit pur. Des scènes, des personnages, des enjeux.

L'énergie d'un récit :
- Chronologique, assumé. Pas de gimmicks narratifs.
- Des SCÈNES, pas des résumés. "Ferry Porsche regarde le prototype sous la neige, à 7h du matin, le 15 novembre 1963" — pas "en 1963, Ferry Porsche supervisait le développement".
- Des personnages identifiés qui font des choix. Pas d'entités abstraites ("l'équipe a décidé").
- Des obstacles réels : concurrence, échecs, contraintes financières, désaccords internes.
- Une transformation vraie à la fin : ce que ça a changé sur le moment, et pas dans le futur lointain.

Ce qui compte :
- Les dates et les lieux sont précis. Les noms propres sont identifiés à leur première occurrence.
- Les motivations des acteurs sont lisibles sans être télégraphiées.
- La tension vient des enjeux réels, pas de formules rhétoriques.
- Le récit a un cadre temporel clair. On sait où on est dans la frise.

Anti-patterns à fuir :
- Chronologie sèche : "en 1963... puis en 1964... puis en 1965...". Mortel.
- Chaque année = un paragraphe mécanique.
- Fin qui transforme tout en leçon morale ("et c'est ainsi que naquit la légende").
- Passages explicatifs longs déguisés en récit ("il faut comprendre que...").
- Abstractions à la place des personnes ("les ingénieurs pensaient que...").

Respiration typique (organique) :
- L'état du monde avant : stabilité, manque, tension latente.
- L'étincelle : un individu, une contrainte, une rencontre.
- La gestation : essais, échecs, doutes, rivalités internes.
- Le moment-clé : la scène qui fait basculer — datée, incarnée.
- La transformation : ce qui devient possible.
- L'héritage immédiat : ce que ça a changé dans les mois qui suivent.

Tu racontes comme si tu y étais. Pas comme si tu l'avais lu dans un livre.`,
};

function buildSystemPrompt(
  narrativeForm: string,
  narrativeStyleVoice: string,
  language: string,
  charMin: number,
  charMax: number,
): string {
  const formPrompt = FORM_PROMPTS[narrativeForm] ?? FORM_PROMPTS["essai"];
  const langLabel = language === "fr" ? "français" : language === "en" ? "English" : language;
  const isEnglish = language === "en";

  return `Tu écris un script YouTube ${isEnglish ? "in English" : "en " + langLabel}.

## FORME
${formPrompt}

## VOIX (style)
${narrativeStyleVoice || "Registre courant, précis. Cadence variée. Présence du narrateur discrète. Figures sobres et ancrées dans le réel."}

## CONTRAINTES NON-NÉGOCIABLES

1. **Typographie ${isEnglish ? "standard" : "française stricte"}** :${isEnglish ? `
   - Standard English punctuation
   - No em dash (—) or en dash (–) for parenthetical insertions — use commas or periods
   - No ellipsis (...) — use a period` : `
   - Espace insécable avant ? ! ; :
   - Pas de tirets cadratins (— U+2014) ni demi-cadratins (– U+2013). Utilise des virgules ou des points à la place.
   - Pas d'ellipses "…" ou "..." — remplace par un point`}

2. **Format** :
   - PROSE CONTINUE. Aucun titre de section, aucun tag [[...]], aucun markdown (#, *, **, ---).
   - Paragraphes séparés par un saut de ligne simple.

3. **Longueur** :
   - Plage cible : ${charMin} à ${charMax} caractères.
   - La plage est indicative, pas une contrainte mécanique. Si le sujet demande moins, écris moins.

4. **Source et faits** :
   - Tu t'appuies UNIQUEMENT sur la source fournie. Pas d'inventions factuelles.
   - Si un fait est incertain, tu peux le dire ("${isEnglish ? "we don't know" : "on ignore"}", "${isEnglish ? "accounts differ" : "les témoignages divergent"}").

5. **Outro et CTA** :
   - Le script se termine par UNE question d'engagement (15 mots max), précédée de deux sauts de ligne.
   - Puis un bloc END_SCREEN de 3-4 phrases avec les CTA (abonnement, commentaires, prochaine vidéo si confirmée).
   - Les CTA ne contaminent PAS le corps du script.

6. **Langue** : Tout le script est en ${langLabel}. Même les noms propres étrangers gardent leur forme originale.

## PROCESSUS

Étape 1 — Note d'intention (200 mots max)
Avant d'écrire le script, rédige dans un bloc <intention>...</intention> :
- L'angle précis que tu prends sur ce sujet
- L'ordre de découverte que tu choisis (et pourquoi)
- Le détail central qui mérite qu'on s'y arrête vraiment
- Le ton général que tu vas tenir

Étape 2 — Script
Après le bloc </intention>, rédige le script en prose continue, en respectant la FORME et la VOIX définies plus haut.

Commence par <intention>.`;
}

function buildUserMessage(
  analysis: any,
  extractedText: string,
  globalContext: any,
): string {
  const parts: string[] = [];
  parts.push("## SOURCE");
  parts.push(extractedText || "(aucun texte source fourni)");
  parts.push("");
  if (analysis) {
    parts.push("## ANALYSE NARRATIVE");
    parts.push(typeof analysis === "string" ? analysis : JSON.stringify(analysis, null, 2));
    parts.push("");
  }
  if (globalContext) {
    parts.push("## CONTEXTE GLOBAL");
    parts.push(typeof globalContext === "string" ? globalContext : JSON.stringify(globalContext, null, 2));
  }
  return parts.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      console.log("generate-script-v2 stream cancelled by client");
    },
  });

  // Heartbeat to prevent gateway timeouts
  const heartbeat = setInterval(() => {
    try {
      controller.enqueue(sseEncoder.encode(`: heartbeat\n\n`));
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  (async () => {
    try {
      const {
        analysis,
        extractedText,
        language,
        charMin = 3000,
        charMax = 6000,
        narrativeForm = "essai",
        narrativeStyleVoice = "",
        globalContext,
      } = await req.json();

      if (!extractedText) {
        controller.enqueue(encodeSseData(JSON.stringify({ error: "Missing extractedText" })));
        controller.close();
        clearInterval(heartbeat);
        return;
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const systemPrompt = buildSystemPrompt(narrativeForm, narrativeStyleVoice, language || "fr", charMin, charMax);
      const userMessage = buildUserMessage(analysis, extractedText, globalContext);

      console.log(`[generate-script-v2] form=${narrativeForm}, lang=${language}, range=${charMin}-${charMax}`);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          max_completion_tokens: 24000,
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        const errMsg = response.status === 429 ? "Trop de requêtes, réessayez." :
          response.status === 402 ? "Crédits AI épuisés." : "AI gateway error";
        controller.enqueue(encodeSseData(JSON.stringify({ error: errMsg })));
        controller.close();
        clearInterval(heartbeat);
        return;
      }

      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      console.error("generate-script-v2 error:", e);
      try {
        controller.enqueue(encodeSseData(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" })));
      } catch {
        // no-op
      }
    } finally {
      clearInterval(heartbeat);
      try { controller.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(stream, { headers: sseHeaders });
});
