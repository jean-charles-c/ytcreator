import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SECTION_ORDER = ["hook", "context", "promise", "act1", "act2", "act3", "climax", "insight", "conclusion"];

const SECTION_DESCRIPTIONS: Record<string, string> = {
  hook: "The HOOK — the opening paragraphs that grab attention instantly. Must start with a surprising fact, paradox, or mystery. No greetings, no channel name. Pure curiosity trigger.",
  context: "The CONTEXT — establishes the world with concrete details: time, place, key characters or objects. Transition from abstract hook to concrete reality.",
  promise: "The PROMISE — teases what the viewer will discover. Plants curiosity hooks and open loops. Short and punchy.",
  act1: "ACT 1 (SETUP) — the origin story. How it began, the invention, the founding moment. Presents key characters and motivations.",
  act2: "ACT 2 (ESCALATION) — the longest section. Unfolds the investigation step by step. Each revelation raises new questions. The story gets BIGGER.",
  act3: "ACT 3 (IMPACT) — consequences and real-world effects. Final complications before the climax. Builds toward resolution.",
  climax: "The CLIMAX — threads converge into a powerful turning point. The key discovery or realization. Resolves the central mystery.",
  insight: "The INSIGHT — the intellectual takeaway. What does this story teach us? Concrete and actionable, not philosophical.",
  conclusion: "The CONCLUSION — a resonant final thought. No summary. End with a concrete image or fact that lingers.",
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
    const allSections: Record<string, { label: string; content: string }> = {};
    if (otherSections && Array.isArray(otherSections)) {
      for (const s of otherSections) {
        allSections[s.key] = { label: s.label, content: s.content || "" };
        if (s.content && s.content.trim()) {
          contextParts.push(`[${s.label}]:\n${s.content.trim().slice(0, 2000)}`);
        }
      }
    }

    // Identify adjacent sections for coherence
    const idx = SECTION_ORDER.indexOf(sectionKey);
    const prevKey = idx > 0 ? SECTION_ORDER[idx - 1] : null;
    const nextKey = idx < SECTION_ORDER.length - 1 ? SECTION_ORDER[idx + 1] : null;
    const prevSection = prevKey && allSections[prevKey]?.content ? allSections[prevKey] : null;
    const nextSection = nextKey && allSections[nextKey]?.content ? allSections[nextKey] : null;

    // Build transition constraints
    const transitionRules: string[] = [];
    if (prevSection) {
      const lastParas = prevSection.content.trim().split(/\n\s*\n/).slice(-2).join("\n\n");
      transitionRules.push(`PREVIOUS SECTION ENDING (${prevSection.label}):\n"${lastParas.slice(-500)}"\n→ Your opening must flow naturally from this ending. No abrupt topic changes.`);
    }
    if (nextSection) {
      const firstParas = nextSection.content.trim().split(/\n\s*\n/).slice(0, 2).join("\n\n");
      transitionRules.push(`NEXT SECTION BEGINNING (${nextSection.label}):\n"${firstParas.slice(0, 500)}"\n→ Your closing must set up a smooth transition into this beginning.`);
    }

    const currentCharCount = currentContent?.length || 0;
    // Hook has a strict 100-200 char limit (±10%)
    const isHook = sectionKey === "hook";
    const targetChars = isHook ? 150 : Math.max(500, currentCharCount || 1500);
    const hookConstraint = isHook
      ? `\n\n⚠️ STRICT HOOK LENGTH: The Hook MUST be between 100 and 200 characters (±10% → 90-220 absolute). Write 1-3 SHORT sentences maximum. Count your characters carefully. If over 220, CUT. If under 90, EXPAND slightly.`
      : "";

    const systemPrompt = `You are an expert YouTube documentary narrator. ${styleInstruction}

MANDATORY LANGUAGE: Write the ENTIRE output in ${langLabel}.

YOUR TASK: Regenerate ONLY the "${sectionLabel}" section of a YouTube documentary script.

SECTION ROLE: ${sectionDesc}

NARRATIVE COHERENCE RULES (CRITICAL):
- The script is a continuous narration split into sections for editing purposes
- The viewer hears ALL sections as ONE uninterrupted voice-over
- Your section must feel like a seamless continuation, NOT a separate piece
- Match the tone, vocabulary level, and pacing of the surrounding sections
- Do NOT repeat information already covered in other sections
- Do NOT introduce characters or concepts that contradict other sections
- Transitions between sections must be invisible to the listener
${transitionRules.length > 0 ? "\nTRANSITION CONSTRAINTS:\n" + transitionRules.join("\n\n") : ""}

STYLE RULES:
- Clear, direct, visual language — like the best YouTube explainer channels
- ONE idea per sentence, each under 100 characters
- Alternate short (30-50 char) and long (60-95 char) sentences
- Active voice, concrete nouns, strong verbs
- No literary flourishes, no abstractions, no poetry

HUMANIZE (MANDATORY):
- Write as a PASSIONATE HUMAN EXPERT, not an AI. Take intellectual positions. Use personal authority ("What's often missed is...", "The real question isn't X, it's Y").
- Allow controlled asymmetry: vary paragraph lengths, break patterns deliberately, use sentence fragments for rhythm.
- Include micro-reactions a real narrator would have: brief asides, moments of emphasis, rhetorical pivots that feel unscripted.
- NEVER produce text that reads like a filled-in template. If a sentence could appear in ANY documentary about ANY subject, rewrite it with details specific to THIS story.
- Let wonder, indignation, irony, or fascination emerge NATURALLY from the facts. Don't manufacture emotion; present facts so the emotion emerges in the LISTENER.
- Vary connectors unpredictably. Don't cycle through "However... Moreover... Furthermore..." mechanically.

OUTPUT RULES:
- Return ONLY the raw narration text for this section
- NO headers, titles, markers, separators, or meta-commentary
- The text must be immediately usable as voice-over
- Target approximately ${targetChars} characters (±20%)${hookConstraint}`;

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
    content = content.replace(/<plan>[\s\S]*?<\/plan>/gi, "").trim();

    // --- Coherence check: lightweight pass to detect transition issues ---
    let transitionFixes: { key: string; label: string; fixedContent: string }[] = [];

    // Only run coherence check if we have adjacent sections with content
    if (content && (prevSection || nextSection)) {
      try {
        const coherencePrompt = buildCoherencePrompt(
          sectionKey, sectionLabel, content,
          prevKey, prevSection,
          nextKey, nextSection,
          langLabel, styleInstruction
        );

        const coherenceResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: coherencePrompt.system },
              { role: "user", content: coherencePrompt.user },
            ],
            tools: [{
              type: "function",
              function: {
                name: "report_transition_fixes",
                description: "Report any transition fixes needed for adjacent sections",
                parameters: {
                  type: "object",
                  properties: {
                    needs_fixes: { type: "boolean", description: "Whether any adjacent section needs a transition fix" },
                    fixes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          key: { type: "string", description: "Section key to fix (e.g. 'introduction', 'act1')" },
                          label: { type: "string", description: "Section label" },
                          original_transition: { type: "string", description: "The 1-3 sentences that need adjustment" },
                          fixed_transition: { type: "string", description: "The improved 1-3 sentences" },
                        },
                        required: ["key", "label", "original_transition", "fixed_transition"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["needs_fixes", "fixes"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "report_transition_fixes" } },
          }),
        });

        if (coherenceResp.ok) {
          const coherenceData = await coherenceResp.json();
          const toolCall = coherenceData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const args = JSON.parse(toolCall.function.arguments);
            if (args.needs_fixes && args.fixes?.length > 0) {
              // Apply transition fixes: replace the original transition text in adjacent sections
              for (const fix of args.fixes) {
                const targetSection = allSections[fix.key];
                if (targetSection && fix.original_transition && fix.fixed_transition) {
                  const fixedContent = targetSection.content.replace(fix.original_transition, fix.fixed_transition);
                  if (fixedContent !== targetSection.content) {
                    transitionFixes.push({ key: fix.key, label: fix.label, fixedContent });
                  }
                }
              }
            }
          }
        }
      } catch (coherenceErr) {
        // Coherence check is optional — don't fail the whole request
        console.error("Coherence check error (non-blocking):", coherenceErr);
      }
    }

    return new Response(JSON.stringify({ content, sectionKey, transitionFixes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("regenerate-section error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildCoherencePrompt(
  sectionKey: string, sectionLabel: string, newContent: string,
  prevKey: string | null, prevSection: { label: string; content: string } | null,
  nextKey: string | null, nextSection: { label: string; content: string } | null,
  langLabel: string, styleInstruction: string,
) {
  const system = `You are a narrative coherence editor. ${styleInstruction}
Language: ${langLabel}.

You analyze whether adjacent sections need MINIMAL transition adjustments after one section was rewritten.

RULES:
- Only fix the LAST 1-3 sentences of the previous section OR the FIRST 1-3 sentences of the next section
- Only suggest fixes if there's an actual continuity break (topic contradiction, jarring tonal shift, or repeated information)
- Do NOT rewrite entire sections — only fix transition sentences
- If transitions are already smooth, report needs_fixes=false
- Preserve the original style, tone, and vocabulary`;

  const parts: string[] = [];
  if (prevSection) {
    parts.push(`PREVIOUS SECTION [${prevSection.label}] (last 500 chars):\n"${prevSection.content.slice(-500)}"`);
  }
  parts.push(`REGENERATED SECTION [${sectionLabel}]:\n"${newContent.slice(0, 1500)}...${newContent.slice(-500)}"`);
  if (nextSection) {
    parts.push(`NEXT SECTION [${nextSection.label}] (first 500 chars):\n"${nextSection.content.slice(0, 500)}"`);
  }
  parts.push("Analyze the transitions. If any adjacent section needs a minimal fix, report it. Otherwise set needs_fixes=false.");

  return { system, user: parts.join("\n\n") };
}
