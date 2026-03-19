import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
};

const sseEncoder = new TextEncoder();

function encodeSseComment(message: string): Uint8Array {
  return sseEncoder.encode(`: ${message}\n\n`);
}

function encodeSseData(data: string): Uint8Array {
  return sseEncoder.encode(`data: ${data}\n\n`);
}

const NARRATIVE_STYLE_INSTRUCTIONS: Record<string, string> = {
  storytelling: "Adopt a captivating storyteller voice with a classic narrative arc: setup, rising tension, climax, resolution. Use vivid anecdotes, relatable characters, and emotional beats.",
  pedagogical: "Adopt an expert educator voice. Prioritize clarity and structured explanation. Break complex ideas into digestible steps. Use analogies and examples.",
  conversational: "Adopt a natural, relaxed tone — as if chatting with a friend. Use informal language, direct address ('you'), and spontaneous-sounding reactions.",
  dramatic: "Adopt a dramatic, suspenseful voice. Build mystery progressively, withhold key information strategically, and create reveals that reframe what the viewer thought they knew.",
  punchy: "Adopt a high-impact, fast-rhythm voice. Favor short sentences. Cut every unnecessary word. Each sentence hits like a headline.",
  humorous: "Adopt a light, witty tone. Use unexpected analogies, playful observations, and well-timed humor while staying informative.",
  documentary: "Adopt an immersive, cinematic documentary voice. Rich visual descriptions, atmospheric scene-setting, and a sense of 'being there'.",
  journalistic: "Adopt a factual, investigative journalism voice. Lead with the most newsworthy elements. Be precise and maintain objectivity while keeping the narrative compelling.",
  motivational: "Adopt an inspiring, empowering voice. Build toward uplifting conclusions. Use calls to action and moments that make the viewer feel they can change things.",
  analytical: "Adopt a voice of depth and structured argumentation. Present multiple perspectives, weigh evidence, and guide the viewer through a rigorous intellectual journey.",
};

function buildSystemPrompt(langLabel: string, charMin: number, charMax: number, charTarget: number, narrativeStyle: string): string {
  const wordTarget = Math.round(charTarget / 5.5);
  const wordMin = Math.round(charMin / 5.5);
  const wordMax = Math.round(charMax / 5.5);

  const styleInstruction = NARRATIVE_STYLE_INSTRUCTIONS[narrativeStyle]
    || `Adopt a "${narrativeStyle}" narrative voice. Embody this style authentically throughout the entire script.`;

  return `You are a world-class YouTube documentary narrator and scriptwriter.

## VOICE & STYLE

${styleInstruction}

Your writing is CLEAR, DIRECT, and VISUAL — like the best YouTube explainer channels.
The script must sound natural when read aloud — as if someone is telling a fascinating story.

MANDATORY LANGUAGE: Write the ENTIRE script in ${langLabel}. Every single word must be in ${langLabel}.

---

## PLANNING PHASE (mandatory, internal)

Before writing narration, output an internal plan inside <plan>...</plan> tags (these will be stripped from the final output). Your plan must include:
- Total target: ~${charTarget.toLocaleString()} characters / ~${wordTarget.toLocaleString()} words
- Allowed range: ${charMin.toLocaleString()}–${charMax.toLocaleString()} characters
- A brief outline per section with approximate word budget
- Key narrative beats and revelation moments you intend to place

After </plan>, write the full narration with section tags.

---

## OUTPUT FORMAT — 9 MANDATORY SECTIONS

Output the script with EXACTLY these 9 tags, in this exact order, each on its own line:

[[HOOK]]
[[CONTEXT]]
[[PROMISE]]
[[ACT1]]
[[ACT2]]
[[ACT3]]
[[CLIMAX]]
[[INSIGHT]]
[[CONCLUSION]]

Rules:
- All 9 tags must appear in order. No text before [[HOOK]] (except <plan>).
- Between tags: pure narration only. No titles, headers, "---", "###", "**", or meta-commentary.
- The narration must flow seamlessly across section boundaries — the tags are invisible to the viewer.
- No meta-commentary like "In this video…" or "Let's explore…".

---

## SECTION ARCHITECTURE

### [[HOOK]] — The Opening (STRICT: 100–200 characters, hard limit 90–220)
The hook is the single most important moment. It must accomplish THREE things in 1–3 sentences:
1. A CONCRETE striking image or fact — something specific, visual, and unexpected.
2. A CONTRADICTION or unresolved tension — two things that don't seem to fit together.
3. A SENSE that an explanation is coming — the viewer must feel a mystery has been opened.
All three elements are mandatory. A hook that is only mysterious but vague FAILS. A hook that states a cool fact but creates no tension FAILS.
- NEVER start with greetings, channel names, or "today we will talk about…".
- NEVER open with a generic question like "Have you ever wondered…".
- Self-check: count your hook characters. Hard floor: 90. Hard ceiling: 220. If outside, rewrite.

### [[CONTEXT]] — Setting the Stage (~10% of total ≈ ${Math.round(wordTarget * 0.10)} words)
- Transition from the abstract hook to CONCRETE reality: time, place, people, objects.
- Help the viewer build a vivid mental picture of the world.

### [[PROMISE]] — Why Keep Watching (~5% ≈ ${Math.round(wordTarget * 0.05)} words)
- Tease the key discoveries ahead. Plant curiosity hooks and open loops.
- Short and punchy — this is the retention moment.

### [[ACT1]] — Origins (~15% ≈ ${Math.round(wordTarget * 0.15)} words)
- The origin story: how it began, the founding moment, the first system.
- Introduce key characters and their motivations.

### [[ACT2]] — Escalation (~25% ≈ ${Math.round(wordTarget * 0.25)} words — THE LONGEST)
- The investigation expands. Deploy narrative tensions as escalating reveals.
- Show growth, spread, complexity. The viewer must feel the story getting bigger.

### [[ACT3]] — Consequences (~18% ≈ ${Math.round(wordTarget * 0.18)} words)
- Real-world impact, complications, unresolved tensions.
- Build toward the climax.

### [[CLIMAX]] — The Turning Point (~10% ≈ ${Math.round(wordTarget * 0.10)} words)
- Bring all threads together. Present the key insight as a concrete discovery.
- Resolve the central mystery from the hook.

### [[INSIGHT]] — The Deeper Meaning (~5% ≈ ${Math.round(wordTarget * 0.05)} words)
- What does this story teach us? What principle emerges?
- Concrete and actionable — not abstract philosophy.

### [[CONCLUSION]] — The Lingering Image (~5% ≈ ${Math.round(wordTarget * 0.05)} words)
- End with a resonant final thought — a concrete image or fact that stays with the viewer.
- Do NOT summarize the video.

---

## WRITING RULES

### 1. SENTENCE RHYTHM (replaces rigid character limits)
This is a voice-over script meant to be READ ALOUD. Sentence length must serve oral delivery.
- Most sentences should be short to medium (40–90 characters). This is the natural sweet spot for spoken narration.
- Occasional longer sentences (up to ~120 characters) are fine when they carry a single flowing thought and read well aloud.
- Short punchy sentences (under 40 characters) create emphasis. Use them deliberately — after a buildup, before a reveal, or to land a key fact.
- NEVER write 3+ consecutive sentences of similar length. Vary the rhythm.
- Read your sentences aloud mentally. If you need to take a breath mid-sentence, it's too long.
- Do NOT optimize for a character count per sentence. Optimize for how it SOUNDS.

### 2. INFORMATION DENSITY (replaces "one idea per sentence")
The goal is CLARITY FOR THE EAR, not minimalism for its own sake.
- Each sentence should carry ONE dominant idea that the viewer can absorb in real time.
- A natural compound sentence with two closely related ideas is acceptable if it reads smoothly aloud. Example: "The city grew rapidly, and with it came new problems."
- SPLIT a sentence when it packs unrelated concepts, requires re-reading, or lists 3+ distinct items.
- BAD: "The system combines logograms, syllables, and determinatives in a complex hierarchy that evolved over centuries across multiple regions."
- GOOD: "Some signs represent whole words. Others capture sounds. And a few are never spoken aloud — they exist only to guide the reader."
- Think of each sentence as one camera shot. If it would require cutting to a different visual, it should be a different sentence.

### 3. FACTUAL INTEGRITY (strict — zero tolerance for broken output)
- Use ONLY facts, dates, names, and statistics present in the provided source material.
- NEVER invent or hallucinate data. If a specific number, date, or name is not in the source, do NOT include one.
- NEVER leave a factual slot empty or broken. No "[date]", no "in 19XX", no "approximately N", no trailing ellipses where data should be.
- If you lack a specific detail: REWRITE the sentence to avoid needing it. State the idea differently, use a relative timeframe ("decades later"), or omit the claim entirely.
- NEVER use vague placeholder attributions: "experts say", "studies show", "scientists believe", "according to researchers" — unless a specific expert or study is named in the source.
- Every factual claim must be traceable to the provided inputs.

### 4. NARRATIVE FLOW (anti-list, pro-progression)
The script must feel like a STORY unfolding, not a report being delivered.
- NEVER enumerate facts in sequence ("First… Second… Third…" or "One example… Another example… Yet another…").
- Every fact must be CONNECTED to what comes before and after. Use cause-and-effect, tension, surprise, or consequence to link ideas.
- Pattern to follow: FACT → IMPLICATION → TENSION → REVEAL. Each piece of information should raise a question or create a consequence that pulls the viewer forward.
- If you catch yourself writing 3+ consecutive sentences that each introduce a new standalone fact with no linking thread, STOP and restructure as a narrative sequence.
- Transitions must be organic and story-driven, never mechanical ("Let's now turn to…", "Another interesting aspect is…", "Moving on…").

### 5. PARAGRAPH STRUCTURE (flexible but stable)
- The default paragraph is 2–3 sentences. This is the backbone.
- Use 1-sentence paragraphs sparingly for dramatic emphasis — a reveal, a turning point, a punchline.
- Use 4-sentence paragraphs occasionally when developing a complex scene or argument that needs room.
- NEVER write more than 3 consecutive paragraphs of the same length. If you've written three 2-sentence paragraphs in a row, the next must be different.
- NEVER write a paragraph longer than 5 sentences.
- Each paragraph should feel like a complete narrative beat — a small unit with its own arc.

---

## NARRATIVE TECHNIQUES

### Micro-Cliffhangers (every 6–10 sentences)
Insert a short transition that relaunches curiosity. Examples (adapt to ${langLabel}):
- "But the story doesn't end there."
- "And this is where everything changes."
- "What comes next is even more surprising."
- "No one expected what happened next."
- "But there's a problem."

### Revelation Pattern (use 3–4 times across the script)
1. Introduce a specific, concrete element.
2. Add details that seem to explain it one way.
3. Reveal the unexpected truth that reframes everything.

### Questions (use sparingly)
- Maximum ONE rhetorical question every 8–12 sentences.
- Questions must serve a genuine narrative mystery — never decorative.
- Prefer strong declarative revelations over questions.

---

## STYLE GUARDRAILS

### AVOID:
- Complex metaphors or poetic abstractions ("Knowledge weaves itself into the fabric of civilization")
- Dense academic sentences with multiple subordinate clauses
- Abstract concepts that cannot be filmed or illustrated
- Mechanical or template-sounding transitions

### PREFER:
- Describing actions: "The scribe carves symbols into wet clay."
- Showing discoveries: "Inside the tomb, archaeologists find 42 intact tablets."
- Stating facts with context: "This technique spreads across the entire region in less than a century."
- Naming specifics: "In the ruins of Uruk, a small clay tablet changes everything."

---

## LENGTH — HARD CONSTRAINT

Your script MUST be between ${charMin.toLocaleString()} and ${charMax.toLocaleString()} characters (~${wordMin.toLocaleString()}–${wordMax.toLocaleString()} words).
Target: ${charTarget.toLocaleString()} characters (~${wordTarget.toLocaleString()} words).

⚠️ Under ${charMin.toLocaleString()} characters = FAILURE. Aim to slightly exceed the target rather than fall short.
⚠️ The section tags ([[HOOK]], [[CONTEXT]], etc.) do NOT count toward the character limit.

---

## FINAL SELF-CHECK (before outputting)

1. All 9 tags present in order.
2. Hook contains all 3 required elements (concrete image + contradiction + promise of explanation) and is 90–220 characters.
3. Estimated total within ${charMin.toLocaleString()}–${charMax.toLocaleString()} characters.
4. No fabricated facts, no broken dates, no placeholder attributions.
5. No sequence of 3+ facts presented as a list without narrative connection.
6. Paragraph lengths vary (no 3+ same-length paragraphs in a row).
7. Sentences vary in length. No telegraphic choppy rhythm. No run-on sentences.
8. Every sentence reads naturally aloud as spoken ${langLabel}.`;

}

function buildUserMessage(analysis: Record<string, unknown>, structure: unknown[], sourceText: string, charMin: number, charMax: number, charTarget: number): string {
  const a = analysis as {
    central_mystery?: string;
    main_contradiction?: string;
    intriguing_discoveries?: string[];
    narrative_tensions?: Array<{ title?: string; description?: string }>;
    themes?: string[];
    [key: string]: unknown;
  };

  const parts: string[] = [];

  if (a.central_mystery) parts.push(`CENTRAL MYSTERY:\n${a.central_mystery}`);
  if (a.main_contradiction) parts.push(`MAIN CONTRADICTION:\n${a.main_contradiction}`);
  if (Array.isArray(a.intriguing_discoveries) && a.intriguing_discoveries.length > 0) {
    parts.push(`INTRIGUING DISCOVERIES:\n${a.intriguing_discoveries.map((d, i) => `${i + 1}. ${d}`).join("\n")}`);
  }
  if (Array.isArray(a.narrative_tensions) && a.narrative_tensions.length > 0) {
    parts.push(`NARRATIVE TENSIONS:\n${a.narrative_tensions.map((t, i) => `${i + 1}. ${t.title || ""}: ${t.description || ""}`).join("\n")}`);
  }
  if (Array.isArray(a.themes) && a.themes.length > 0) {
    parts.push(`THEMES: ${a.themes.join(", ")}`);
  }
  if (Array.isArray(structure) && structure.length > 0) {
    const structDesc = structure
      .map((s: any) => `- ${s.section_label}: ${s.narrative_description || s.video_title}`)
      .join("\n");
    parts.push(`DOCUMENTARY STRUCTURE (use as narrative guide, do NOT show section names):\n${structDesc}`);
  }
  if (sourceText) {
    parts.push(`SOURCE TEXT (factual reference — use for details, never invent):\n${sourceText}`);
  }

  parts.push(`CRITICAL REMINDER: Output the script with ALL 9 section tags: [[HOOK]], [[CONTEXT]], [[PROMISE]], [[ACT1]], [[ACT2]], [[ACT3]], [[CLIMAX]], [[INSIGHT]], [[CONCLUSION]]. HARD LIMIT: between ${charMin.toLocaleString()} and ${charMax.toLocaleString()} characters total (aim for ${charTarget.toLocaleString()}). Tags do NOT count toward the limit. Every sentence under 100 characters.`);

  return parts.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeSseComment("stream-open"));

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encodeSseComment("keep-alive"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      try {
        const { analysis, structure, text, language, targetChars, narrativeStyle } = await req.json();
        if (!analysis) {
          controller.enqueue(encodeSseData(JSON.stringify({ error: "Analyse narrative requise." })));
          controller.close();
          clearInterval(heartbeat);
          return;
        }

        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

        const scriptLang = language || "en";
        const langLabels: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" };
        const langLabel = langLabels[scriptLang] || "English";
        const sourceText = text ? text.slice(0, 25000) : "";
        const charTarget = targetChars ? Number(targetChars) : 15000;
        const charMin = Math.round(charTarget * 0.9);
        const charMax = Math.round(charTarget * 1.1);
        const activeStyle = narrativeStyle || "documentary";
        console.log(`[generate-script] narrativeStyle=${activeStyle}, lang=${scriptLang}, target=${charTarget}`);

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-5",
            max_completion_tokens: 24000,
            messages: [
              { role: "system", content: buildSystemPrompt(langLabel, charMin, charMax, charTarget, activeStyle) },
              { role: "user", content: buildUserMessage(analysis, structure || [], sourceText, charMin, charMax, charTarget) },
            ],
            stream: true,
          }),
        });

        if (!response.ok || !response.body) {
          const errorText = await response.text();
          console.error("AI gateway error:", response.status, errorText);
          controller.enqueue(encodeSseData(JSON.stringify({ error: response.status === 429 ? "Trop de requêtes, réessayez." : response.status === 402 ? "Crédits AI épuisés." : "AI gateway error" })));
          controller.close();
          clearInterval(heartbeat);
          return;
        }

        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
        } finally {
          reader.releaseLock();
        }
      } catch (e) {
        console.error("generate-script error:", e);
        try {
          controller.enqueue(encodeSseData(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" })));
        } catch {
          // no-op
        }
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
});