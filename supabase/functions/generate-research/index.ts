import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SECTION_DESCRIPTIONS: Record<string, string> = {
  "Introduction": "Présente le sujet, son importance, les enjeux et la méthodologie de recherche. Pose les questions centrales.",
  "Contexte historique": "Retrace l'évolution historique du sujet avec dates, personnages clés et événements marquants.",
  "Sources primaires": "Identifie et analyse les sources directes : textes originaux, témoignages, documents d'archive.",
  "Preuves archéologiques ou empiriques": "Présente les preuves matérielles, découvertes archéologiques, données expérimentales.",
  "Interprétations scientifiques": "Analyse les théories scientifiques dominantes avec leurs fondements et méthodologies.",
  "Théories alternatives": "Expose les hypothèses minoritaires ou controversées, en évaluant leur crédibilité.",
  "Analyse critique": "Confronte les différentes interprétations, identifie les biais et les limites méthodologiques.",
  "Interprétations les plus plausibles": "Synthétise les conclusions les mieux étayées par les preuves disponibles.",
  "Questions non résolues": "Identifie les lacunes dans les connaissances actuelles et les pistes de recherche futures.",
  "Conclusion": "Synthèse finale, implications et perspectives pour la recherche et la vulgarisation.",
  "Références et bibliographie": "Liste structurée des sources citées dans le dossier. NE PAS INVENTER de références.",
};

const SECTIONS = Object.keys(SECTION_DESCRIPTIONS);

function buildSectionPrompt(
  topic: string,
  sectionName: string,
  sectionDesc: string,
  angle?: string,
  depth?: string,
  instructions?: string,
  previousSections?: string
): string {
  let prompt = `Tu es un chercheur académique expert. Tu rédiges la section "${sectionName}" d'un dossier de recherche en français sur :

**Sujet** : ${topic}`;
  if (angle) prompt += `\n**Angle** : ${angle}`;
  prompt += `\n**Profondeur** : ${depth || "very deep"}`;
  if (instructions) prompt += `\n**Instructions** : ${instructions}`;

  prompt += `

**Section à rédiger** : ${sectionName}
**Description** : ${sectionDesc}

RÈGLES :
- Rédige UNIQUEMENT cette section, de manière substantielle (minimum 4-6 paragraphes développés).
- Ton académique mais accessible, entièrement en français.
- Inclus des dates, noms de chercheurs, figures historiques quand pertinent.
- Distingue CLAIREMENT faits établis, preuves, hypothèses et spéculations.
- Utilise du Markdown (gras, italique, listes, sous-sections avec **titre**).
- NE commence PAS par un marqueur [SECTION:...], écris directement le contenu.
- NE FABRIQUE JAMAIS de références fictives. Si incertain, indique "[référence à vérifier]".
- Vise la PROFONDEUR, pas la brièveté.`;

  if (previousSections) {
    prompt += `\n\nPour cohérence, voici un résumé des sections précédentes :\n${previousSections}`;
  }

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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(": stream-open\n\n"));

        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 10000);

        try {
          let previousSummaries = "";

          for (let i = 0; i < SECTIONS.length; i++) {
            const sectionName = SECTIONS[i];
            const sectionDesc = SECTION_DESCRIPTIONS[sectionName];

            // Emit section marker
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: `[SECTION:${sectionName}]\n` })}\n\n`)
            );

            // Emit progress info
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ progress: { current: i + 1, total: SECTIONS.length, section: sectionName } })}\n\n`)
            );

            const userPrompt = buildSectionPrompt(
              topic, sectionName, sectionDesc, angle, depth, instructions,
              previousSummaries || undefined
            );

            const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "user", content: userPrompt },
                ],
                stream: true,
                max_completion_tokens: 4000,
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              console.error(`AI error for section ${sectionName}:`, response.status, errText);

              if (response.status === 429) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Rate limit. Réessayez dans quelques instants." })}\n\n`));
              } else {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Erreur AI pour la section ${sectionName}.` })}\n\n`));
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              clearInterval(heartbeat);
              controller.close();
              return;
            }

            // Stream section content
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let sectionContent = "";

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
                  if (jsonStr === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      sectionContent += content;
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
                    }
                  } catch { /* partial JSON */ }
                }
              }
            }

            // Add trailing newlines between sections
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: "\n\n" })}\n\n`));

            // Keep a short summary for context continuity (first 200 chars)
            const summary = sectionContent.slice(0, 200).replace(/\n/g, " ");
            previousSummaries += `\n- ${sectionName}: ${summary}...`;
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
