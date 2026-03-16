import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEARCH_SECTIONS = [
  "Introduction",
  "Contexte historique",
  "Sources primaires",
  "Preuves archéologiques ou empiriques",
  "Interprétations scientifiques",
  "Théories alternatives",
  "Analyse critique",
  "Interprétations les plus plausibles",
  "Questions non résolues",
  "Conclusion",
  "Références et bibliographie",
];

function buildSystemPrompt(): string {
  return `Tu es un chercheur académique expert produisant des dossiers de recherche extrêmement approfondis en français.

RÈGLES ABSOLUES :
- Tu rédiges ENTIÈREMENT en français.
- Tu produis un document LONG et DÉTAILLÉ, visant l'équivalent de 20+ pages imprimées.
- Tu structures le document avec EXACTEMENT ces 11 sections, chacune précédée d'un marqueur de section sur sa propre ligne :

[SECTION:Introduction]
[SECTION:Contexte historique]
[SECTION:Sources primaires]
[SECTION:Preuves archéologiques ou empiriques]
[SECTION:Interprétations scientifiques]
[SECTION:Théories alternatives]
[SECTION:Analyse critique]
[SECTION:Interprétations les plus plausibles]
[SECTION:Questions non résolues]
[SECTION:Conclusion]
[SECTION:Références et bibliographie]

EXIGENCES DE CONTENU :
- Inclus des dates, noms de chercheurs, figures historiques, auteurs quand c'est pertinent.
- Mentionne des publications, découvertes ou références RÉELLES. Si tu n'es pas sûr d'une référence, indique-le clairement avec "[référence à vérifier]".
- Distingue CLAIREMENT les faits établis, les preuves, les hypothèses et les spéculations. Utilise des formulations comme "Il est établi que...", "Les preuves suggèrent...", "Selon l'hypothèse de...", "On peut spéculer que...".
- Présente les théories concurrentes et leurs limites respectives.
- Vise une analyse PROFONDE, pas un simple résumé.
- NE FABRIQUE JAMAIS de références bibliographiques fictives. Si tu ne connais pas la référence exacte, décris la source de manière générale.

STYLE :
- Ton académique mais accessible.
- Chaque section doit être substantielle (minimum 4-6 paragraphes développés par section principale).
- Utilise des sous-sections avec des titres en gras (**titre**) au sein de chaque section.
- La section Références doit lister les sources mentionnées dans le texte de manière honnête.

FORMAT :
- Utilise du Markdown pour la mise en forme (gras, italique, listes).
- Chaque section commence par le marqueur [SECTION:NomDeLaSection] sur sa propre ligne.
- N'utilise PAS de titres Markdown (#) pour les sections principales, utilise UNIQUEMENT les marqueurs [SECTION:...].`;
}

function buildUserPrompt(
  topic: string,
  angle?: string,
  depth?: string,
  instructions?: string
): string {
  let prompt = `Rédige un dossier de recherche extrêmement approfondi sur le sujet suivant :

**Sujet** : ${topic}`;
  if (angle) prompt += `

**Angle de recherche** : ${angle}`;
  prompt += `

**Niveau de profondeur** : ${depth || "very deep"} — produis un document visant 20+ pages, avec une analyse exhaustive.`;
  if (instructions) prompt += `

**Instructions supplémentaires** : ${instructions}`;
  prompt += `

Génère le dossier complet avec les 11 sections obligatoires. Chaque section doit être substantielle et détaillée. Privilégie la PROFONDEUR à la brièveté.`;
  return prompt;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, angle, depth, instructions } = await req.json();

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Le sujet (topic) est requis." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Send SSE stream-open comment immediately to prevent timeout
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Keep-alive comment
        controller.enqueue(encoder.encode(": stream-open\n\n"));

        // Heartbeat
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15000);

        try {
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-5",
              messages: [
                { role: "system", content: buildSystemPrompt() },
                { role: "user", content: buildUserPrompt(topic, angle, depth, instructions) },
              ],
              stream: true,
              max_completion_tokens: 24000,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error("AI gateway error:", response.status, errText);

            if (response.status === 429) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Rate limit exceeded. Réessayez dans quelques instants." })}\n\n`));
            } else if (response.status === 402) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Crédits insuffisants. Rechargez votre compte." })}\n\n`));
            } else {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Erreur du service AI." })}\n\n`));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            clearInterval(heartbeat);
            controller.close();
            return;
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);

              if (!line || line.startsWith(":")) continue;
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]") {
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  continue;
                }
                try {
                  const parsed = JSON.parse(jsonStr);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
                  }
                } catch {
                  // partial JSON, skip
                }
              }
            }
          }

          // Flush remaining
          if (buffer.trim()) {
            for (const raw of buffer.split("\n")) {
              const line = raw.trim();
              if (!line || line.startsWith(":")) continue;
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
                  }
                } catch { /* ignore */ }
              }
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" })}\n\n`)
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("generate-research error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
