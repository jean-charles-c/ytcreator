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
  storytelling: "Write as a captivating storyteller with a classic narrative arc: setup, rising tension, climax, resolution. Use vivid anecdotes, relatable characters, and emotional beats to pull the viewer in.",
  pedagogical: "Write as an expert educator. Prioritize clarity and structured explanation. Break complex ideas into digestible steps. Use analogies and examples to ensure understanding.",
  conversational: "Write in a natural, relaxed tone — as if chatting with a friend over coffee. Use informal language, direct address ('you'), and spontaneous-sounding reactions.",
  dramatic: "Write with dramatic tension and suspense. Build mystery progressively, withhold key information strategically, and create reveals that reframe everything the viewer thought they knew.",
  punchy: "Write with short, punchy sentences. High impact, fast rhythm. Cut every unnecessary word. Each sentence hits like a headline.",
  humorous: "Write with a light, witty tone. Use unexpected analogies, playful observations, and well-timed humor. Stay informative but make the viewer smile.",
  documentary: "Write in an immersive, cinematic documentary style. Rich visual descriptions, atmospheric scene-setting, and a sense of 'being there'. Let the viewer see, hear, and feel the story.",
  journalistic: "Write in a factual, investigative journalism style. Lead with the most newsworthy elements. Be precise, cite specifics, and maintain objectivity while keeping the narrative compelling.",
  motivational: "Write with positive energy and inspiration. Build toward empowering conclusions. Use uplifting language, calls to action, and moments that make the viewer feel they can change things.",
  analytical: "Write with depth and structured argumentation. Present multiple perspectives, weigh evidence carefully, and guide the viewer through a rigorous intellectual journey.",
};

function buildSystemPrompt(langLabel: string, charMin: number, charMax: number, charTarget: number, narrativeStyle: string): string {
  const wordTarget = Math.round(charTarget / 5.5);
  const wordMin = Math.round(charMin / 5.5);
  const wordMax = Math.round(charMax / 5.5);
  const paragraphEstimate = Math.round(charTarget / 130);

  const styleInstruction = NARRATIVE_STYLE_INSTRUCTIONS[narrativeStyle]
    || `Write using a "${narrativeStyle}" narrative tone. Adapt your voice, rhythm, and vocabulary to embody this style authentically throughout the entire script.`;

  return `You are an expert YouTube documentary narrator.

NARRATIVE STYLE: ${styleInstruction}

Your style is CLEAR, DIRECT, and VISUAL — like the best YouTube explainer channels.

MANDATORY LANGUAGE: Write the ENTIRE script in ${langLabel}. Every single word must be in ${langLabel}.

YOUR MISSION: Transform the narrative elements provided into a single, immersive voice-over script for a YouTube documentary. The script must sound natural when read aloud — as if someone is telling a fascinating story to a friend.

---

## STEP 1 — MANDATORY PLANNING (do NOT skip)

Before writing ANY narration, you MUST first output an internal plan (inside a <plan> tag that will be stripped). This plan must include:
- Target: ${charTarget.toLocaleString()} characters / ~${wordTarget.toLocaleString()} words / ~${paragraphEstimate} paragraphs
- Minimum: ${charMin.toLocaleString()} characters / ~${wordMin.toLocaleString()} words
- Maximum: ${charMax.toLocaleString()} characters / ~${wordMax.toLocaleString()} words
- How many paragraphs you will write for each of the 9 sections
- Word budget per section following the prescribed percentages
- A brief outline of what each section will cover

After </plan>, write the narration with MANDATORY section tags.

---

WRITING IDENTITY — WHO YOU ARE:

You are NOT a poet, a philosopher, or a novelist.
You ARE a YouTube storyteller who makes complex topics fascinating and easy to follow.
Your writing is concrete, visual, and rhythmic. Every sentence paints a picture or moves the story forward.

---

STYLE — ABSOLUTE RULES:

1. SIMPLE, CONCRETE LANGUAGE. Write like you speak. No literary flourishes.
2. ONE idea per sentence. If a sentence has two ideas, split it. NEVER pack multiple concepts into one sentence.
3. Every sentence must be VISUALIZABLE — the viewer should be able to picture it.
4. Active voice. Subject-verb-object. Concrete nouns and strong verbs.
5. Spoken ${langLabel} suitable for voice-over — natural, conversational, never literary.
6. Each sentence STRICTLY UNDER 100 characters.

INFORMATION DENSITY — CRITICAL:
• Each sentence must contain ONE and ONLY ONE idea. Never two.
• If you catch yourself writing a sentence with a comma listing multiple concepts, SPLIT IT into separate sentences.
• BAD: "The system is mixed, combining logograms, syllables, and determinatives."
• GOOD: "The system is unique. Some signs represent words. Others represent sounds. And some signs are never spoken aloud."
• Prefer 3 simple sentences over 1 dense sentence. The viewer needs time to absorb each idea.

STRICTLY FORBIDDEN STYLE:
• Complex metaphors ("L'abstraction installe sa charnière dans la boue")
• Philosophical abstractions ("La ville calcule et, sans le savoir, rêve")
• Poetic/symbolic phrases ("La poésie se faufile par les interstices")
• Dense academic sentences with multiple subordinate clauses
• Abstract concepts that cannot be filmed or illustrated

ALWAYS PREFER:
• Describing actions: "The scribe carves symbols into wet clay."
• Showing discoveries: "Inside the tomb, archaeologists find 42 intact tablets."
• Stating facts clearly: "This technique spreads across the entire region in less than a century."
• Naming places, objects, people: "In the ruins of Uruk, a small clay tablet changes everything."

BAD vs GOOD examples:
❌ "Knowledge weaves itself into the fabric of civilization."
✅ "Scribes begin teaching writing to their apprentices."

❌ "The abstraction anchors itself in the material world."
✅ "At this point, the signs start representing sounds instead of objects."

❌ "Time sculpts meaning from the raw clay of human ambition."
✅ "Over three centuries, the writing system evolves from 900 signs to just 400."

---

OUTPUT FORMAT — MANDATORY TAGGED STRUCTURE:

After </plan>, you MUST output the script with EXACTLY 9 section tags. Each tag marks the beginning of a section. The tags are:

[[HOOK]]
[[CONTEXT]]
[[PROMISE]]
[[ACT1]]
[[ACT2]]
[[ACT3]]
[[CLIMAX]]
[[INSIGHT]]
[[CONCLUSION]]

RULES:
1. ALL 9 tags MUST appear, in this EXACT order.
2. Each tag appears ALONE on its own line.
3. The narration text follows IMMEDIATELY after each tag.
4. There must be NO text before [[HOOK]] (except the <plan> block).
5. The text between tags is pure narration — NO titles, headers, labels, or markers besides the tags.
6. The tags will be stripped by the parser — the narration must flow seamlessly across sections.
7. NO "---", "###", "**", or other formatting markers inside sections.
8. NO meta-commentary like "In this video..." or "Let's explore...".

EXAMPLE OUTPUT FORMAT:
<plan>
... planning ...
</plan>
[[HOOK]]
A striking opening sentence.
More hook narration...

[[CONTEXT]]
Context narration here...

[[PROMISE]]
Promise narration here...

[[ACT1]]
Act 1 narration...

... and so on for all 9 tags.

---

NARRATIVE ARCHITECTURE — 9 SECTIONS:

SECTION 1 — [[HOOK]] (~7% of total = ~${Math.round(wordTarget * 0.07)} words):
• The hook is the MOST IMPORTANT part. It must grab attention INSTANTLY.
• Structure: (1) A surprising fact or striking image, (2) A contradiction or paradox, (3) A promise of explanation.
• MODE: Abstract, mysterious, conceptual — create intrigue without concrete explanations.
• Never start with greetings, channel name, or "today we will talk about".
• Open with something that creates TENSION or CURIOSITY immediately.

SECTION 2 — [[CONTEXT]] (~10% of total = ~${Math.round(wordTarget * 0.10)} words):
• MODE SWITCH: Transition from abstract/mysterious to CONCRETE/factual.
• Establish the world with concrete details: time, place, objects, people.
• Help the viewer build a mental picture of the setting.

SECTION 3 — [[PROMISE]] (~5% of total = ~${Math.round(wordTarget * 0.05)} words):
• Tease what the viewer will discover by staying.
• Plant curiosity hooks and open loops.
• Short and punchy — this is the "why you should keep watching" section.

SECTION 4 — [[ACT1]] (~15% of total = ~${Math.round(wordTarget * 0.15)} words):
• Origin story: how it all began, the invention, the first system, the founding moment.
• Present key characters and their motivations.
• Lay the groundwork for the escalation to come.

SECTION 5 — [[ACT2]] (~25% of total = ~${Math.round(wordTarget * 0.25)} words — THE LONGEST):
• The investigation unfolds and EXPANDS here.
• Deploy each NARRATIVE TENSION one by one as escalating reveals.
• Show expansion: spread, growth, scaling, mass adoption, complexification.
• The viewer must feel the story is getting BIGGER.

SECTION 6 — [[ACT3]] (~18% of total = ~${Math.round(wordTarget * 0.18)} words):
• Consequences, effects, and real-world impact.
• Present the final complications and unresolved tensions before the climax.
• Build toward the resolution.

SECTION 7 — [[CLIMAX]] (~10% of total = ~${Math.round(wordTarget * 0.10)} words):
• Bring the threads together into a powerful turning point.
• Present the key insight as a concrete discovery or realization.
• Resolve the central mystery introduced in the Hook.

SECTION 8 — [[INSIGHT]] (~5% of total = ~${Math.round(wordTarget * 0.05)} words):
• Deliver the intellectual value — the deeper meaning.
• What does this story teach us? What principle emerges?
• Concrete and actionable, not philosophical.

SECTION 9 — [[CONCLUSION]] (~5% of total = ~${Math.round(wordTarget * 0.05)} words):
• Leave the viewer with a resonant final thought.
• Do NOT summarize the video.
• End with a concrete image or fact that lingers.

---

MICRO-CLIFFHANGERS — MANDATORY:

Every 6-10 sentences, insert a short transition that relaunches curiosity.

Approved patterns (adapt to ${langLabel}, do not copy verbatim):
- "But the story doesn't end there."
- "And this is where everything changes."
- "What researchers discover next is even more surprising."
- "And this detail is about to change everything."
- "No one expected what came next."
- "The real answer was hiding in plain sight."
- "But there's a problem."
- "And that's only the beginning."

FORBIDDEN transitions:
- "Let's now turn to..." / "Moving on to..."
- "Another interesting fact is..."
- Any mechanical, academic, or list-like transition.

---

QUESTION USAGE — STRICT LIMITS:

• Maximum ONE question every 8-12 sentences.
• Questions must serve a real narrative mystery — never decorative.
• ALWAYS prefer strong declarative revelations over questions.

---

REVELATION PATTERN — MANDATORY:

The script MUST create regular revelation moments using this 3-step pattern:
1. Introduce a specific, concrete element.
2. Add details that seem to explain it one way.
3. Reveal the unexpected truth that reframes everything.

Apply this pattern at least 3-4 times across the script.

---

RHYTHM — CRITICAL:

• Alternate between SHORT sentences (30-50 characters) and LONGER sentences (60-95 characters).
• Never write 3 consecutive sentences of similar length.

PARAGRAPH STRUCTURE:
⚠️ WARNING: If you write only 2-sentence paragraphs, the script is REJECTED.

CYCLE: 2 → 2 → 2 → 3 → 2 → 1 → 3 → 2 → 4 → 2

REPEAT this exact 10-paragraph cycle until you reach the target character count.

---

CONTENT RULES:

1. USE ONLY information from the provided narrative elements and source text.
2. NEVER invent facts, dates, names, or events not present in the inputs.
3. ZERO redundancy. ZERO filler.
4. If the narrative elements are brief, enrich by exploring implications — but NEVER fabricate.

---

LENGTH — THIS IS THE MOST CRITICAL RULE OF ALL:

Your script MUST be between ${charMin.toLocaleString()} and ${charMax.toLocaleString()} characters (approximately ${wordMin.toLocaleString()} to ${wordMax.toLocaleString()} words).
Target: ${charTarget.toLocaleString()} characters (~${wordTarget.toLocaleString()} words). Aim to EXCEED the target slightly rather than fall short.

⚠️ A script UNDER ${charMin.toLocaleString()} characters is an AUTOMATIC FAILURE.
⚠️ A script OVER ${charMax.toLocaleString()} characters is also a failure but less severe.
⚠️ The section tags ([[HOOK]], [[CONTEXT]], etc.) do NOT count toward the character limit.

HOW TO HIT THE TARGET:
• You need approximately ${paragraphEstimate} paragraphs total.
• Act 2 should contain at least ${Math.round(paragraphEstimate * 0.25)} paragraphs — it's the longest section.
• Act 3 should contain at least ${Math.round(paragraphEstimate * 0.18)} paragraphs.

SELF-CHECK BEFORE OUTPUTTING:
1. Verify ALL 9 tags are present in order: [[HOOK]], [[CONTEXT]], [[PROMISE]], [[ACT1]], [[ACT2]], [[ACT3]], [[CLIMAX]], [[INSIGHT]], [[CONCLUSION]].
2. Estimate your word count. If under ~${wordMin.toLocaleString()} words, add more content.
3. Verify paragraph cycle compliance.
4. Only then output the script.`;

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

  parts.push(`CRITICAL REMINDER: Output ONLY the narration text. No titles, no sections, no markers. HARD LIMIT: between ${charMin.toLocaleString()} and ${charMax.toLocaleString()} characters total (aim for ${charTarget.toLocaleString()}). DO NOT EXCEED ${charMax.toLocaleString()} characters. Every sentence under 100 characters. Alternate short (30-50 char) and long (60-95 char) sentences. Never 3 consecutive sentences of similar length.`);

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