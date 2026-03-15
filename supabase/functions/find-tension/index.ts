import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, existing_tensions } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 100) {
      return new Response(JSON.stringify({ error: "Texte trop court." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const truncated = text.slice(0, 30000);
    const existingList = (existing_tensions || [])
      .map((t: { title: string; description: string }, i: number) => `${i + 1}. ${t.title}: ${t.description}`)
      .join("\n");

    const systemPrompt = `Tu es un analyste narratif expert en documentaires. On te donne un dossier de recherche et une liste de tensions narratives déjà identifiées.

Tu dois trouver UNE SEULE nouvelle tension narrative originale, différente de celles déjà listées. Elle doit couvrir un angle inexploré du sujet (historique, scientifique, humain, politique, philosophique, économique, culturel, etc.).

Tensions déjà identifiées (NE PAS les répéter) :
${existingList || "(aucune)"}

Réponds UNIQUEMENT avec un appel à la fonction add_tension.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: truncated },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "add_tension",
              description: "Retourne une nouvelle tension narrative unique.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Titre court de la tension (5-10 mots)" },
                  description: { type: "string", description: "Description de la tension (2-3 phrases)" },
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

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const tension = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ tension }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("find-tension error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
