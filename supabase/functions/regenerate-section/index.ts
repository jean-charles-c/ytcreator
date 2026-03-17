import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SECTION_DESCRIPTIONS: Record<string, string> = {
  hook: "The HOOK — the opening 3-5 paragraphs that grab attention instantly. Must start with a surprising fact, paradox, or mystery. No greetings, no channel name. Pure curiosity trigger.",
  introduction: "The INTRODUCTION — establishes the world and context. Concrete details: time, place, key characters or objects. Sets up the central question or mystery.",
  act1: "ACT 1 (SETUP) — presents the main contradiction and first intriguing discoveries. Plants clues that will pay off later. Builds the viewer's mental picture.",
  act2: "ACT 2 (ESCALATION) — the longest section. Unfolds the investigation step by step. Each revelation raises new questions. Alternate between evidence, meaning, surprise, and deeper mystery.",
  act3: "ACT 3 (CLIMAX) — tensions converge. The key discovery or turning point. Maximum dramatic intensity.",
  climax: "The REVELATION — the 'aha' moment. Reframes everything the viewer thought they knew. Surprising but logical.",
  conclusion: "The CONCLUSION — resolves the narrative arc. Connects back to the hook. Leaves the viewer with a powerful final thought or image.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sectionKey, sectionLabel, currentContent, otherSections, language, narrativeStyle, sourceText } = await req.json();

    if (!sectionKey || !sectionLabel) {
      return new Response(JSON.stringify({ error: "sectionKey and sectionLabel required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const langLabels: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" };
    const langLabel = langLabels[language || "en"] || "English";
    const styleInstruction = narrativeStyle ? `Use a "${narrativeStyle}" narrative tone.` : "Use an immersive documentary style.";
    const sectionDesc = SECTION_DESCRIPTIONS[sectionKey] || `The "${sectionLabel}" section of the script.`;

    // Build context from other sections
    const contextParts: string[] = [];
    if (otherSections && Array.isArray(otherSections)) {
      for (const s of otherSections) {
        if (s.content && s.content.trim()) {
          contextParts.push(`[${s.label}]:\n${s.content.trim().slice(0, 2000)}`);
        }
      }
    }

    const currentCharCount = currentContent?.length || 0;
    const targetChars = Math.max(500, currentCharCount || 1500);

    const systemPrompt = `You are an expert YouTube documentary narrator. ${styleInstruction}

MANDATORY LANGUAGE: Write the ENTIRE output in ${langLabel}.

YOUR TASK: Regenerate ONLY the "${sectionLabel}" section of a YouTube documentary script.

SECTION ROLE: ${sectionDesc}

STYLE RULES:
- Clear, direct, visual language — like the best YouTube explainer channels
- ONE idea per sentence, each under 100 characters
- Alternate short (30-50 char) and long (60-95 char) sentences
- Active voice, concrete nouns, strong verbs
- No literary flourishes, no abstractions, no poetry

OUTPUT RULES:
- Return ONLY the raw narration text for this section
- NO headers, titles, markers, separators, or meta-commentary
- The text must be immediately usable as voice-over
- Target approximately ${targetChars} characters (±20%)
- Maintain narrative continuity with the surrounding sections`;

    const userMessage = [
      contextParts.length > 0 ? `SURROUNDING SECTIONS (for context and continuity — do NOT repeat their content):\n\n${contextParts.join("\n\n")}` : "",
      currentContent ? `CURRENT CONTENT OF "${sectionLabel}" (to be rewritten/improved):\n${currentContent}` : `The "${sectionLabel}" section is currently empty. Write it from scratch.`,
      sourceText ? `SOURCE MATERIAL (factual reference):\n${sourceText.slice(0, 10000)}` : "",
      `REGENERATE the "${sectionLabel}" section now. Output ONLY the narration text, nothing else.`,
    ].filter(Boolean).join("\n\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        max_completion_tokens: 8000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      const msg = response.status === 429 ? "Trop de requêtes, réessayez." :
                  response.status === 402 ? "Crédits AI épuisés." : "AI gateway error";
      return new Response(JSON.stringify({ error: msg }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Strip any <plan> tags if present
    content = content.replace(/<plan>[\s\S]*?<\/plan>/gi, "").trim();

    return new Response(JSON.stringify({ content, sectionKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("regenerate-section error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
