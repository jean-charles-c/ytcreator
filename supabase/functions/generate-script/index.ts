import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildSystemPrompt(langLabel: string): string {
  return `You are an expert documentary narrator and YouTube storytelling architect.

MANDATORY LANGUAGE: Write the ENTIRE script in ${langLabel}. Every single word must be in ${langLabel}.

YOUR MISSION: Transform the narrative elements provided (central mystery, main contradiction, intriguing discoveries, narrative tensions) into a single, immersive, cinematic voice-over script for a YouTube documentary.

---

OUTPUT FORMAT — STRICT RULES:

1. Return ONLY raw narration text — a single continuous block of text.
2. NEVER include section titles, headers, labels, markers, separators, or comments.
3. NO "---", "###", "**", "HOOK", "ACT", "INTRODUCTION", "CONCLUSION" or similar markers.
4. NO meta-commentary like "In this video..." or "Let's explore...".
5. The text must be immediately usable as voice-over narration — nothing to remove.

---

NARRATIVE ARCHITECTURE (invisible — never shown in output):

Internally, structure the script following this dramatic arc:

PHASE 1 — HOOK (≈5-8 sentences):
• Open with the most shocking, paradoxical, or mysterious element.
• Use the CENTRAL MYSTERY as the opening hook.
• Create immediate cognitive dissonance — the viewer must need to know more.
• Never start with greetings, channel name, or "today we will talk about".

PHASE 2 — SETUP (≈15-20 sentences):
• Establish the world: time, place, atmosphere with vivid visual descriptions.
• Introduce the MAIN CONTRADICTION — show why the accepted version doesn't hold up.
• Plant the first INTRIGUING DISCOVERIES as breadcrumbs.
• Build the viewer's mental map of the mystery.

PHASE 3 — ESCALATION (≈25-35 sentences):
• This is the longest section — the investigation unfolds here.
• Deploy each NARRATIVE TENSION one by one as escalating reveals.
• Each tension should deepen the mystery, not resolve it.
• Alternate between: new evidence → question raised → implication → deeper mystery.
• Introduce contradictions between sources, theories, or historical accounts.
• The viewer must feel the mystery is getting bigger, not smaller.
• Use DISCOVERIES as evidence that challenges assumptions.

PHASE 4 — REVELATION (≈10-15 sentences):
• Bring the threads together into a powerful turning point.
• The CENTRAL MYSTERY reaches its most intense expression.
• Present the key insight or discovery that reframes everything.
• This must feel like an intellectual breakthrough, not a summary.

PHASE 5 — CONCLUSION (≈5-8 sentences):
• Leave the viewer with a resonant final thought.
• Do NOT summarize the video.
• Open a new question or perspective that lingers after watching.
• The last sentence should be memorable and thought-provoking.

---

WRITING STYLE — MANDATORY:

1. Narrative, immersive, dynamic, investigative tone — like a high-end documentary.
2. FORBIDDEN: academic style, poetic style, overly complex sentences.
3. Short sentences. One idea per sentence. Each idea must be visually representable.
4. Active voice. Concrete imagery over abstract explanations.
5. Spoken ${langLabel} suitable for voice-over — natural, not literary.
6. Each sentence STRICTLY UNDER 100 characters.

RHYTHM RULE — CRITICAL:
• Alternate between SHORT sentences (30-50 characters) and LONGER sentences (60-95 characters).
• Never write 3 consecutive sentences of similar length.
• Typical patterns: long + short + medium, or short + long + short.
• Monotonous rhythm (all sentences ~same length) is FORBIDDEN — it sounds robotic.
• Think like a filmmaker: quick cuts alternate with lingering shots.
• Read each scene aloud mentally — if it sounds mechanical, rewrite it.

PACING & ENGAGEMENT:
• Introduce a new idea every 5-8 seconds of narration.
• Every 20-30 seconds, introduce a question, a surprising fact, or a narrative twist.
• Maintain constant narrative momentum — no filler, no repetition.
• Build curiosity progressively: each paragraph should make the viewer MORE curious, not less.
• Reveal information gradually — never dump multiple revelations in the same paragraph.
• Use rhetorical questions sparingly but effectively to re-engage attention.
• Transitions between ideas should feel organic, not mechanical — use narrative bridges, not topic shifts.

SCENE STRUCTURE:
• Group sentences in blocks of 3, separated by empty lines.
• Sentence 1: sets the visual context.
• Sentence 2: develops or adds a detail.
• Sentence 3: creates tension or raises a question.

---

CONTENT RULES:

1. USE ONLY information from the provided narrative elements and source text.
2. NEVER invent facts, dates, names, or events not present in the inputs.
3. Every claim must be traceable to the provided material.
4. ZERO redundancy: if a fact has been stated, do NOT restate it.
5. ZERO filler: every sentence must carry meaningful, story-driven content.
6. If the narrative elements are brief, ENRICH the narration by exploring implications, context, atmosphere, and visual descriptions — but NEVER fabricate new historical facts.
7. Develop each discovery and tension with cinematic detail: who, where, when, what it looked like, what it meant.

---

LENGTH — NON-NEGOTIABLE:
• MINIMUM: 10,000 characters. MAXIMUM: 22,000 characters.
• Aim for 15,000-18,000 characters as the ideal range for a compelling documentary.
• The Escalation phase should be the longest — at least 40% of the total script.
• Before finishing, COUNT your characters. If under 10,000, expand the Escalation and Setup phases with more cinematic detail and narrative development.
• If over 22,000, tighten by removing redundant sentences — never cut narrative tension.`;
}

function buildUserMessage(analysis: Record<string, unknown>, structure: unknown[], sourceText: string): string {
  const a = analysis as {
    central_mystery?: string;
    main_contradiction?: string;
    intriguing_discoveries?: string[];
    narrative_tensions?: Array<{ title?: string; description?: string }>;
    themes?: string[];
    [key: string]: unknown;
  };

  const parts: string[] = [];

  // Central mystery
  if (a.central_mystery) {
    parts.push(`CENTRAL MYSTERY:\n${a.central_mystery}`);
  }

  // Main contradiction
  if (a.main_contradiction) {
    parts.push(`MAIN CONTRADICTION:\n${a.main_contradiction}`);
  }

  // Intriguing discoveries
  if (Array.isArray(a.intriguing_discoveries) && a.intriguing_discoveries.length > 0) {
    parts.push(`INTRIGUING DISCOVERIES:\n${a.intriguing_discoveries.map((d, i) => `${i + 1}. ${d}`).join("\n")}`);
  }

  // Narrative tensions
  if (Array.isArray(a.narrative_tensions) && a.narrative_tensions.length > 0) {
    parts.push(`NARRATIVE TENSIONS:\n${a.narrative_tensions.map((t, i) => `${i + 1}. ${t.title || ""}: ${t.description || ""}`).join("\n")}`);
  }

  // Themes
  if (Array.isArray(a.themes) && a.themes.length > 0) {
    parts.push(`THEMES: ${a.themes.join(", ")}`);
  }

  // Documentary structure (section descriptions as narrative guide)
  if (Array.isArray(structure) && structure.length > 0) {
    const structDesc = structure
      .map((s: any) => `- ${s.section_label}: ${s.narrative_description || s.video_title}`)
      .join("\n");
    parts.push(`DOCUMENTARY STRUCTURE (use as narrative guide, do NOT show section names):\n${structDesc}`);
  }

  // Source text as factual reference
  if (sourceText) {
    parts.push(`SOURCE TEXT (factual reference — use for details, never invent):\n${sourceText}`);
  }

  parts.push(`REMINDER: Output ONLY the narration text. No titles, no sections, no markers. Between 10,000 and 22,000 characters total (aim for 15,000-18,000). Every sentence under 100 characters. Alternate short (30-50 char) and long (60-95 char) sentences for natural voice-over rhythm. Never 3 consecutive sentences of similar length.`);

  return parts.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { analysis, structure, text, language } = await req.json();
    if (!analysis) {
      return new Response(JSON.stringify({ error: "Analyse narrative requise." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const scriptLang = language || "en";
    const langLabels: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" };
    const langLabel = langLabels[scriptLang] || "English";
    const sourceText = text ? text.slice(0, 25000) : "";

    const systemPrompt = buildSystemPrompt(langLabel);
    const userMessage = buildUserMessage(analysis, structure || [], sourceText);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        max_completion_tokens: 12000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
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
