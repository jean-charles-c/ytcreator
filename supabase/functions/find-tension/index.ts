import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const existingTensions = Array.isArray(body?.existing_tensions)
      ? body.existing_tensions
          .filter((t: unknown) => t && typeof t === "object")
          .map((t: { title?: unknown; description?: unknown }) => ({
            title: typeof t.title === "string" ? t.title : "",
            description: typeof t.description === "string" ? t.description : "",
          }))
      : [];

    if (text.length < 100) {
      return jsonResponse({ error: "Texte trop court." }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Keep context concise to reduce latency and avoid request timeouts
    const truncatedText = text.slice(0, 12000);
    const existingList = existingTensions
      .slice(0, 20)
      .map((t, i) => `${i + 1}. ${t.title}: ${t.description}`)
      .join("\n");

    const systemPrompt = `Tu es un analyste narratif expert en documentaires. Trouve exactement UNE nouvelle tension narrative originale, différente des tensions déjà listées.

Tensions déjà identifiées (ne pas répéter) :
${existingList || "(aucune)"}

Réponds UNIQUEMENT avec un appel à la fonction add_tension.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: truncatedText },
          ],
          temperature: 0.7,
          max_tokens: 220,
          tools: [
            {
              type: "function",
              function: {
                name: "add_tension",
                description: "Retourne une nouvelle tension narrative unique.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Titre court de la tension" },
                    description: { type: "string", description: "Description de la tension" },
                  },
                  required: ["title", "description"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "add_tension" } },
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResponse({ error: "Trop de requêtes AI, réessayez dans quelques instants." }, 429);
      }
      if (response.status === 402) {
        return jsonResponse({ error: "Crédits AI épuisés." }, 402);
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return jsonResponse({ error: "Erreur AI gateway." }, 500);
    }

    const data = await response.json();

    let tension: { title?: string; description?: string } | null = null;
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        tension = JSON.parse(toolCall.function.arguments);
      } catch {
        tension = null;
      }
    }

    if (!tension) {
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            tension = JSON.parse(match[0]);
          } catch {
            tension = null;
          }
        }
      }
    }

    const title = tension?.title?.trim();
    const description = tension?.description?.trim();

    if (!title || !description) {
      return jsonResponse({ error: "Réponse IA invalide, réessayez." }, 500);
    }

    return jsonResponse({ tension: { title: title.slice(0, 120), description: description.slice(0, 500) } });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return jsonResponse({ error: "La génération prend trop de temps, réessayez." }, 504);
    }

    console.error("find-tension error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
