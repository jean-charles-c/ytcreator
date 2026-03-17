import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sectionKey, sectionLabel, content, sourceLanguage } = await req.json();

    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: "No content to translate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const langLabels: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" };
    const sourceLang = langLabels[sourceLanguage || "en"] || "English";

    const systemPrompt = `You are a professional translator specializing in YouTube documentary narration scripts.

TASK: Translate the following section from ${sourceLang} to French.

RULES:
- Maintain the exact same tone, rhythm, and pacing as the original
- Preserve sentence structure and paragraph breaks exactly
- Keep the same narrative energy and dramatic tension
- Use natural, spoken French — not literary or overly formal
- Preserve any rhetorical devices (questions, cliffhangers, repetitions)
- Do NOT add or remove any content
- Do NOT add headers, markers, or annotations
- Output ONLY the translated text, nothing else`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Translate this "${sectionLabel}" section to French:\n\n${content}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      const msg = response.status === 429 ? "Trop de requêtes, réessayez." :
                  response.status === 402 ? "Crédits AI épuisés." : "Erreur de traduction";
      return new Response(JSON.stringify({ error: msg }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let translated = data.choices?.[0]?.message?.content || "";
    translated = translated.replace(/<plan>[\s\S]*?<\/plan>/gi, "").trim();

    return new Response(JSON.stringify({ translated, sectionKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-section error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
