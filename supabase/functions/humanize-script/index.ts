import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HUMANIZE_SYSTEM = `You are a world-class documentary script editor. Your ONLY job is to HUMANIZE a narrative script.

HUMANIZE DIRECTIVE — mandatory rewrite pass:
1. AUTHORITY: Write as a seasoned expert sharing hard-won insight. Use "I" sparingly but with conviction. No hedging, no "it's worth noting", no "interestingly".
2. RHYTHM: Vary sentence length aggressively. Short punches. Then a longer, winding observation that lets the viewer breathe. Never three sentences of the same length in a row.
3. BAN LIST — delete on sight: "Moreover", "Furthermore", "Additionally", "It's important to note", "Interestingly", "In fact", "Essentially", "Ultimately", "It goes without saying". Replace with nothing or a natural bridge.
4. ORAL FEEL: This script will be READ ALOUD. Every sentence must sound natural when spoken. Read each line in your head — if it sounds like a Wikipedia article, rewrite it.
5. SPECIFIC > GENERIC: Replace vague claims with concrete details, numbers, names, dates when available.
6. NO TEMPLATE STRUCTURES: Avoid "First... Second... Third..." or "On one hand... On the other hand..." patterns. Let ideas flow organically.
7. SURPRISE: At least once per section, include an unexpected angle, a provocative question, or a counter-intuitive observation.
8. FRENCH TYPOGRAPHY RULES: Never use colons (:) — replace with periods (.). Always put a space before ? ! and ;

CRITICAL RULES:
- Preserve the EXACT [[TAG]] markers (e.g. [[HOOK]], [[ACT1]], etc.) — do NOT remove, rename, or add tags.
- Preserve the factual content and narrative structure — you are REWRITING for style, not changing the story.
- Keep approximately the same character count (±10%).
- Output the full rewritten script with all [[TAG]] markers intact.
- Write in the SAME LANGUAGE as the input script.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { script, language } = await req.json();
    if (!script || typeof script !== "string") {
      return new Response(JSON.stringify({ error: "Missing script" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const langHint = language === "fr" ? "Le script est en français. Réécris en français." : `The script is in ${language || "English"}. Rewrite in the same language.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: HUMANIZE_SYSTEM },
          { role: "user", content: `${langHint}\n\nHere is the script to humanize:\n\n${script}` },
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
    console.error("humanize-script error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
