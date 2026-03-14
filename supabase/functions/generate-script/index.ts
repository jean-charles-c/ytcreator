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

    const systemPrompt = `You are an expert YouTube documentary scriptwriter. You write immersive, detailed, and captivating voice-over scripts.

MANDATORY LANGUAGE: Write the ENTIRE script in ${langLabel}. Every single word, every section title, every sentence MUST be in ${langLabel}. Section markers like "--- HOOK ---" must also be translated to ${langLabel}.

MISSION: Generate a COMPLETE and THOROUGH documentary script of AT LEAST 10,000 characters (target: 12,000 to 18,000 characters). Each section must be developed in depth with details, concrete examples, anecdotes, and vivid descriptions.

MANDATORY STRUCTURE (follow this exact order):
${sectionList}

ABSOLUTE WRITING RULES — NEVER DEVIATE:
1. Each sentence must be STRICTLY UNDER 100 characters (count characters!)
2. ONE idea per sentence — never two pieces of information in the same sentence
3. Each scene contains EXACTLY 3 sentences, no more, no less
4. Separate each scene with an empty line
5. Separate each section with a marker: --- [SECTION NAME IN ${langLabel.toUpperCase()}] ---
6. The tone is immersive, captivating, mysterious
7. Use short, punchy sentences — NEVER long sentences
8. Alternate rhetorical questions and affirmations
9. Create suspense between sections
10. The Hook must captivate in 5 punchy sentences maximum
11. "Welcome to Mysteria Mundi" must be a natural transition
12. Each section must contain AT LEAST 1200 characters (many scenes of 3 sentences)
13. Add historical, scientific, or narrative details to enrich each scene
14. Use sensory descriptions and strong mental images
15. Integrate fluid transitions between scenes
16. If a sentence exceeds 90 characters, SPLIT IT into two shorter sentences
17. Favor simple words and subject-verb-object structures
18. MULTIPLY scenes to reach the 10,000+ character target — do NOT write superficial summaries
19. Each section should have AT LEAST 6-8 scenes of 3 sentences each
20. Develop each point with specific facts, dates, names, and places from the research material

SCENE STRUCTURE (3 sentences separated by line breaks):
Sentence 1: sets the context or image.
Sentence 2: develops or adds a detail.
Sentence 3: concludes or creates tension.

[empty line between each scene]

OUTPUT FORMAT:
--- HOOK ---
[scenes of 3 sentences — minimum 5 scenes]

--- WELCOME TO MYSTERIA MUNDI ---
[scenes of 3 sentences — minimum 2 scenes]

[etc. for each section — each section well developed with many scenes]

CRITICAL LENGTH CHECK: The final script MUST exceed 10,000 characters. To achieve this:
- Write AT LEAST 6 scenes per major section
- Each scene = exactly 3 short sentences (under 100 chars each)
- Draw extensively from the research material for facts and details
- Never summarize — always develop and illustrate with specifics

Remember: ALL text including section markers must be in ${langLabel}.`;

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
          {
            role: "user",
            content: `Narrative analysis:\n${JSON.stringify(analysis, null, 2)}\n\nDocumentary structure:\n${JSON.stringify(structure, null, 2)}\n\nSource text (research material):\n${sourceText}`,
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

    // Stream the response back
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
