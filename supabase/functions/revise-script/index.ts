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

const REVISION_SYSTEM = `Tu es un éditeur exigeant. On te donne un script YouTube et tu le réécris pour le rendre plus naturel, plus humain, moins mécanique.

Tu repères et tu corriges :

1. **Les passages "liste"** — quand plusieurs paragraphes juxtaposent des exemples sans progression réelle (X, puis Y, puis Z, puis W). Tu compresses en gardant 1 ou 2 exemples creusés, ou tu remplaces la juxtaposition par une vraie progression d'idée.

2. **Les transitions soudées** — phrases de jointure qui sonnent comme "Sauf que quelque chose dérange", "Reste une question", "Ces conséquences déplacent". Tu les supprimes ou tu les fonds dans le paragraphe suivant.

3. **Les cadences uniformes** — paragraphes qui ont tous la même courbe (scène → description → phrase sentencieuse). Tu casses le pattern : tu fais des paragraphes de longueurs vraiment différentes, tu laisses des pensées inachevées, tu fais suivre un long développement par deux phrases sèches.

4. **Les redondances thématiques** — quand la même idée est illustrée 3 fois sous des angles différents sans que l'idée avance. Tu coupes.

5. **Les tics IA** — "fascinant", "vertigineux", "remarquable", "en réalité", "il faut comprendre que", constructions symétriques ("moins de X, plus de Y"), phrases finales qui ferment toutes sur un aphorisme.

6. **Les clôtures circulaires imposées** — retour mécanique au lieu/image d'ouverture à la fin parce que "ça fait propre". Tu gardes l'écho seulement s'il sert vraiment le propos.

7. **Les explicitations inutiles** — quand le narrateur surexplique au lieu de faire confiance au spectateur.

Règles :
- Tu ne changes pas le fond, tu changes le souffle.
- Tu ne raccourcis pas à tout prix. Un bon paragraphe long reste un bon paragraphe.
- Tu préserves la typographie de la langue source.
- Tu préserves l'OUTRO (question d'engagement) et l'END_SCREEN (CTA) à la fin.
- Tu retournes UNIQUEMENT le script révisé, sans commentaire préalable ni récap des changements.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      console.log("revise-script stream cancelled by client");
    },
  });

  const heartbeat = setInterval(() => {
    try {
      controller.enqueue(sseEncoder.encode(`: heartbeat\n\n`));
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  (async () => {
    try {
      const { script, language } = await req.json();

      if (!script || typeof script !== "string") {
        controller.enqueue(encodeSseData(JSON.stringify({ error: "Missing script" })));
        controller.close();
        clearInterval(heartbeat);
        return;
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const langHint = language === "fr"
        ? "Le script est en français. Réécris en français."
        : `The script is in ${language || "English"}. Rewrite in the same language.`;

      console.log(`[revise-script] lang=${language}, chars=${script.length}`);

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
            { role: "system", content: REVISION_SYSTEM },
            { role: "user", content: `${langHint}\n\nScript à réviser :\n\n${script}` },
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
      console.error("revise-script error:", e);
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
