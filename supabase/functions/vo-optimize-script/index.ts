import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VO_SYSTEM = `You are a premium YouTube documentary voiceover script editor. Your ONLY job is to rewrite a narrative script to sound like a real, high-quality voiceover.

VOICEOVER REWRITE DIRECTIVE:

OBJECTIVE:
- Sound natural to the ear, not literary
- Give the impression a narrator is truly speaking
- Keep the substance, facts, logic, and chronology
- Reinforce fluidity, rhythm, and narrative tension
- Stay serious, elegant, and embodied
- Avoid academic, demonstrative, or overly "written article" tone

STYLE:
- Generally shorter sentences
- Oral breathing rhythm
- Natural transitions between ideas
- Simple but powerful reformulations
- Rhythm variations
- Rhetorical questions ONLY when they truly serve the narration
- Narrative, immersive, masterful tone
- Accessible but not poor vocabulary
- No excessive emphasis
- No artificial grandiloquence
- No heavy repetitions
- No overly formal or overly written formulas

CONSTRAINTS:
- Do NOT invent facts
- Do NOT weaken historical precision
- Preserve names, dates, events, technical notions, and important causalities
- Remove overly abstract or overly academic phrasings
- Transform overly analytical passages into clear narration
- Prefer "on comprend / on voit / ce qui se joue ici" over overly conceptual formulations
- Make the stakes felt without breaking rigor
- Avoid overly massive paragraphs
- Produce text directly usable as voiceover

METHOD:
1. Keep the narrative structure of the text
2. Simplify overly written formulations
3. Cut sentences that are too long
4. Add oral linking between ideas
5. Reinforce transitions
6. Build tension when there's a contradiction, conflict, stake, or revelation
7. Make the text sound like someone telling a story, not writing an essay

IMPORTANT:
- NOT a summary — keep the same length (±10%)
- NOT a casual/familiar style
- NOT artificial dramatization
- The same story, told out loud in a fluid and captivating way

CRITICAL RULES:
- Preserve the EXACT [[TAG]] markers (e.g. [[HOOK]], [[ACT1]], etc.) — do NOT remove, rename, or add tags
- Write in the SAME LANGUAGE as the input script
- FRENCH TYPOGRAPHY: Never use colons (:) — replace with periods (.). Always put a space before ? ! and ;`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { script, language } = await req.json();
    if (!script || typeof script !== "string") {
      return new Response(JSON.stringify({ error: "Missing script" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const langHint = language === "fr"
      ? "Le script est en français. Réécris-le en français, en version voix off documentaire premium."
      : `The script is in ${language || "English"}. Rewrite it in the same language as a premium documentary voiceover.`;

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
          { role: "user", content: `${langHint}\n\nHere is the script to rewrite for voiceover:\n\n${script}` },
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
