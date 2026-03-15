import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { analysis, structure, text, language } = await req.json();
    if (!analysis || !structure) {
      return new Response(JSON.stringify({ error: "Analyse et structure requises." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const scriptLang = language || "en";
    const langLabels: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" };
    const langLabel = langLabels[scriptLang] || "English";
    const sourceText = text ? text.slice(0, 25000) : "";

    const sectionList = structure.map((s: any) => `- ${s.section_label}: ${s.video_title}`).join("\n");

    const systemPrompt = `You are an expert documentary storyteller and YouTube narrative architect.

MANDATORY LANGUAGE: Write the ENTIRE script in ${langLabel}. Every single word, every section title, every sentence MUST be in ${langLabel}. Section markers like "--- HOOK ---" must also be translated to ${langLabel}.

Your task is to generate a highly engaging YouTube documentary script optimized for:
• viewer retention
• narrative tension
• clarity
• visual storytelling
• cinematic pacing

The script must feel like a HIGH-END DOCUMENTARY NARRATION, not like a lecture or academic text.

---

GLOBAL WRITING RULES:

1. Write in short sentences.
2. Each sentence should express one clear idea.
3. Each idea must be visually representable on screen.
4. Avoid abstract academic language.
5. Prefer concrete imagery over explanations.
6. Maintain narrative tension throughout the script.
7. Frequently raise questions or mysteries.
8. Every 20–30 seconds of narration, introduce:
   • a new question
   • a surprising fact
   • or a narrative twist.
9. The narration must feel like a story unfolding, not like a history lesson.
10. Avoid filler phrases such as:
   - "throughout history"
   - "since the dawn of time"
   - "it is important to note"
11. Write as if the viewer is discovering the mystery in real time.
12. Prefer active voice.
13. Use simple, spoken ${langLabel} suitable for voice-over narration.
14. Each paragraph should contain 2–4 sentences maximum.
15. Insert line breaks between ideas to improve pacing.
16. Each sentence must be STRICTLY UNDER 100 characters.
17. ONE idea per sentence — never two pieces of information in the same sentence.
18. Each scene contains EXACTLY 3 sentences, no more, no less.
19. Separate each scene with an empty line.

---

VISUAL STORYTELLING RULE:

Every sentence must be illustratable with an image or scene.

Good: "A clay tablet lies buried under the desert sand."
Bad: "This discovery had important implications."

Always prefer visible scenes over abstract explanations.

---

MANDATORY STRUCTURE (follow this exact order):
${sectionList}

SECTION-SPECIFIC RULES:

1. HOOK (first 10-20 seconds):
   • Start with a powerful statement, paradox, or mystery.
   • Never begin with greetings or explanations.
   • Do not say "today we will talk about".
   • Introduce an unexpected idea or surprising fact.
   • Create immediate curiosity with one central mystery.
   • End by amplifying curiosity.
   • Minimum 5 scenes.

2. WELCOME / CHANNEL IDENTITY:
   • Keep it very short (2-3 sentences max).
   • Do not break narrative momentum.
   • Minimum 2 scenes.

3. INTRODUCTION OF THE MYSTERY:
   • Clearly state what the video is trying to understand.
   • Present the main historical question.
   • Show why it matters, reinforce curiosity.
   • End by posing a key question.

4. CONTEXT:
   • Describe place, time, and situation with visual descriptions.
   • Focus on environment, people, daily life, technological limitations.
   • The viewer must be able to imagine the scene.

5. ACT 1 — DISCOVERY:
   • Present the first clues of the mystery.
   • Introduce important objects, discoveries, or documents.
   • Use storytelling: who discovered it, where, what they found.
   • End with a new question or problem.

6. ACT 2 — INVESTIGATION:
   • Explore theories and historical developments.
   • Introduce researchers, scholars, or historical actors.
   • Show attempts to understand the mystery.
   • Do not resolve the mystery yet.
   • End with a deeper puzzle.

7. ACT 3 — ESCALATION:
   • Increase narrative stakes.
   • Reveal unexpected implications.
   • Introduce contradictions or surprising evidence.
   • The viewer must feel that the mystery is becoming bigger.

8. CLIMAX:
   • Present the major turning point / key discovery that changes everything.
   • Describe the moment, the people involved, the risk or difficulty.
   • Must feel like a major intellectual breakthrough.

9. REVELATION (if present in structure):
   • Explain the implications of the discovery.
   • Show how it changes our understanding.
   • Must feel intellectually satisfying.

10. CONCLUSION:
   • Reflect on the larger meaning of the story.
   • Do NOT summarize the entire video.
   • Leave the viewer with a powerful final idea.

---

PACING RULES:
• Introduce a new idea every 5–8 seconds.
• Avoid long explanations.
• Maintain constant narrative movement.
• Every section must contain questions, discoveries, visual descriptions, and narrative tension.

---

SCENE STRUCTURE (3 sentences separated by line breaks):
Sentence 1: sets the context or image.
Sentence 2: develops or adds a detail.
Sentence 3: concludes or creates tension.

[empty line between each scene]

---

CRITICAL LENGTH & QUALITY CHECK:
- The final script MUST be between 10,000 and 12,000 characters. This is NON-NEGOTIABLE.
- Each major section needs AT LEAST 6-10 scenes of 3 sentences each.
- Draw extensively from the research material for facts and details.
- Never summarize — always develop and illustrate with specifics.
- ZERO redundancy: if you've already stated a fact, do NOT restate it.
- ZERO filler: every sentence must carry meaningful, visual, story-driven content.
- BEFORE finishing, verify your character count. If under 10,000, ADD MORE SCENES.

Remember: ALL text including section markers must be in ${langLabel}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        max_tokens: 12000,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Narrative analysis:\n${JSON.stringify(analysis, null, 2)}\n\nDocumentary structure:\n${JSON.stringify(structure, null, 2)}\n\nSource text (research material):\n${sourceText}\n\nREMINDER: The script MUST be between 10,000 and 12,000 characters total. Write extensively — do not stop early. Every sentence must be visual, cinematic, and under 100 characters.`,
          },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits AI épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-script error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
