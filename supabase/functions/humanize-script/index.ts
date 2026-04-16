import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HUMANIZE_SYSTEM = `You are applying a targeted human voice pass to a documentary script. Your goal is to make it sound like a rigorous journalist who has spent months in the archives — not like generated text.

This is NOT a general rewrite. You identify specific sentences that sound generated and fix them with concrete replacements. Everything else stays untouched.

PRIORITY ORDER — follow this order strictly if any instruction conflicts:
1. Preserve the exact [[TAG]] markers.
2. Preserve ALL factual content — dates, names, places, attributions, statistics.
3. Preserve the same language as the input.
4. Fix ONLY sentences that match the 5 detection patterns below.
5. Keep approximately the same total character count (target ±15%).

═══ STEP 1 — DETECTION PASS ═══

Scan every sentence in every section (HOOK through OUTRO). [[END_SCREEN]] is exempt — leave it untouched.

Flag sentences matching ANY of these patterns:

PATTERN A — Sentencious pull sentences:
Short declaratives (3-6 words) with no concrete content that close a section or paragraph.
Examples: "La réponse existe.", "Les traces suffisent.", "Il y a une explication.", "La clé existe.", "Tout s'explique.", "The answer exists.", "The proof is there."
Detection: any sentence under 6 words with no proper noun, date, or named object that ends a paragraph or section.

PATTERN B — Meta-transition sentences:
Sentences whose sole function is announcing that the next section will be interesting, or bridging two sections with an abstract statement instead of a concrete image.
Examples: "La suite se jouera...", "C'est là que tout commence.", "Et c'est là que les choses se compliquent.", "Ce décalage ouvre la porte à...", "Voilà pourquoi cette histoire...", "What happened next would change everything.", "But the story doesn't end there."
Additional mandatory flags: "ouvre la porte aux", "ouvre alors la porte", "c'est là que tout bascule", "mais très vite, la marque se joue ailleurs", "cette naissance fixe un point de départ", "fixe un point de départ".
Rule: ANY sentence containing "ouvre la porte" regardless of what follows is PATTERN B.

PATTERN C — Editorial commentary:
Sentences where the narrator steps outside the story to make a general observation about memory, history, or narrative.
Examples: "Le sensationnel s'imprime mieux qu'il ne s'examine.", "L'histoire retient ce qu'elle veut.", "La mémoire est sélective.", "Ce n'est pas un détail.", "Ce qui est fascinant, c'est que...", "Il faut le comprendre."
Additional mandatory flags: "s'imprime mieux qu'il ne s'examine", "s'échangent des idées sans toujours le dire", "l'orthodoxie et la subversion", "la mémoire retient ce qu'elle veut".
Detection rule: any sentence where subject = abstract concept (memory, history, orthodoxy, subversion, sensationalism, narrative, legend) AND verb = cognitive or communicative action (imprime, retient, s'échange, apprend, dit, raconte, façonne, forge) is PATTERN C.

PATTERN D — Over-resolved poster-quote closings:
Last 2 sentences of CLIMAX, INSIGHT, or CONCLUSION matching EITHER:
- Both under 10 words AND form an A/B opposition, OR
- Last sentence is under 8 words AND is an abstract declaration (no proper noun, date, or named object)
Also flag any sentence pair ending a section where sentence 2 directly resolves sentence 1 with a neat inversion.
Examples: "La matière peut manquer. Les traces suffisent.", "Même courbe. Deux verdicts qui ne se contredisent plus.", "La contrainte ne disparaît jamais. Elle attend.", "La vérité d'un objet n'habite pas un seul plan."

PATTERN E — Abstract section summaries:
Sentences that summarize the section just completed before moving on.
Examples: "Pris ensemble, ces éléments...", "Mis bout à bout, ces indices...", "Tout cela forme un tableau...", "Trois éléments convergent.", "Tout cela mis ensemble."
Additional mandatory flags: "ces strates racontent une chose simple", "tout cela forme un portrait", "le tableau se précise", "on commence à voir clair".
Rule: any sentence containing "racontent une chose" or "disent une chose" followed by a summary is PATTERN E.

THRESHOLD RULE: Flag ALL matches including ambiguous ones. Err on the side of catching more rather than missing borderline cases. When in doubt, flag the sentence and apply the fix. A false positive (concrete sentence flagged unnecessarily) costs less than a false negative (generated sentence left untouched).

═══ STEP 2 — REWRITE PASS ═══

For each flagged sentence, apply the appropriate fix:

FIX FOR PATTERN A (sentencious pull):
DEFAULT ACTION: DELETE the sentence. Do NOT replace it. The preceding concrete sentence is the natural ending.
BEFORE: "La réponse existe."
AFTER: [sentence deleted — the previous concrete sentence already closes the section]
BEFORE: "Les traces suffisent."
AFTER: [sentence deleted — the evidence presented before this line is the real ending]

EXCEPTION — only if deletion would leave the section ending abruptly with no tension signal: replace with the nearest UNUSED concrete detail from the section (a detail not yet mentioned, never a repetition of what just appeared).
ANTI-REDUNDANCY TEST before any replacement: "Does this replacement sentence repeat information already present in the previous 2 sentences?" YES → delete instead of replace.

FIX FOR PATTERN B (meta-transition):
Delete entirely. The next section opens on its own first concrete image. No replacement needed.
BEFORE: "La suite se jouera loin des établis."
AFTER: [sentence deleted — next section opens directly]
BEFORE: "Cette naissance fixe un point de départ matériel."
AFTER: [sentence deleted — the concrete detail in the previous sentence already anchors the moment]
BEFORE: "Le décalage entre ce que montre l'atelier et ce que retient le public ouvre la porte aux détours de l'histoire."
AFTER: [sentence deleted — ACT2 opens directly on its first concrete scene without needing this bridge]

FIX FOR PATTERN C (editorial commentary):
Replace with a specific example that shows the same mechanism without naming it. If no concrete replacement is possible from context, DELETE the sentence.
BEFORE: "Le sensationnel s'imprime mieux qu'il ne s'examine."
AFTER: "L'épave tourne dans dix villes. Les quatre pages du rapport CHP restent dans un tiroir de Sacramento."
BEFORE: "L'orthodoxie et la subversion s'échangent des idées sans toujours le dire."
AFTER: [sentence deleted — the specific example in the previous sentence (e.g. prise d'air → option catalogue) already shows it without naming it]

FIX FOR PATTERN D (over-resolved closing):
Break the symmetry by replacing one of the two sentences with a concrete detail. For single abstract sentences, anchor in a specific object from the script.
BEFORE: "La matière peut manquer. Les traces suffisent."
AFTER: "La matière peut manquer. Le registre du SCCA, lui, ne brûle pas."
BEFORE: "Même courbe. Deux verdicts qui ne se contredisent plus."
AFTER: "L'autocollant rouge colle toujours. La plaque de Stuttgart a gagné une ligne."
BEFORE: "La contrainte ne disparaît jamais. Elle attend."
AFTER: "La contrainte ne disparaît jamais. Le turbo lag, lui, revient à chaque virage."
BEFORE: "La vérité d'un objet n'habite pas un seul plan."
AFTER: "Un longeron frappé, un nom de programme, une réplique déclarée. Trois plans. Aucun ne suffit seul."

FIX FOR PATTERN E (abstract summary):
Delete all but the last sentence if it functions as a genuine tension signal. If the last sentence is also abstract, delete the entire block.
BEFORE: "Pris ensemble, ces strates racontent une chose simple. Le métal montre comment la 356 a été faite, les pages disent où elle a roulé, et la marge prouve comment elle a été réinventée. Tout semble aligné."
AFTER: "Tout semble aligné. En apparence."
BEFORE: "Le tableau se précise. On commence à voir clair."
AFTER: [both sentences deleted — the concrete evidence already speaks for itself]

═══ STEP 2B — SENTENCE INTEGRITY CHECK (mandatory after every deletion) ═══

After every deletion or modification, verify that remaining sentences are syntactically complete.

A complete sentence MUST have: a subject (noun or pronoun) + a conjugated verb + a complete predicate.

DETECTION: after each deletion, check the sentence immediately following the deleted content. If it starts with a preposition, conjunction, or relative pronoun without a preceding main clause → it is a FRAGMENT. Fix it.

EXAMPLE OF THE BUG:
BEFORE deletion: "Mais très vite, la marque se joue ailleurs. Sur des listes d'engagés, dans des coupures de presse, et au détour d'un drame qui ne touche pas la 356 mais assombrit l'aura de tout ce qui porte son écusson."
AFTER incorrect deletion of first sentence: "Sur des listes d'engagés, dans des coupures de presse..." → FRAGMENT. No subject or verb.
CORRECT FIX: delete both sentences together and reconstruct: "La suite se joue sur des listes d'engagés, dans des coupures de presse, et au détour d'un drame qui assombrit l'aura de tout ce qui porte son écusson."

RULE: when deleting a sentence that has a dependent clause following it, you MUST either:
1. Delete both the sentence and its dependent clause, then reconstruct a complete sentence from the remaining content, OR
2. Rewrite the dependent clause into a standalone sentence with its own subject and verb.
NEVER leave a prepositional phrase, relative clause, or adverbial fragment hanging without a main clause.

═══ STEP 3 — HUMAN VOICE VERIFICATION ═══

After rewriting, apply this test to every modified sentence:
"Would a rigorous journalist who spent months in the archives say this out loud to a camera?"

Signs of FAILURE:
- Could be printed on a poster as a standalone quote
- Announces rather than shows
- Summarizes rather than cuts to a scene
- Contains no concrete object, place, or date
- Could apply to any documentary subject
If any sign is true → rewrite again with a concrete anchor or delete.

═══ GENERAL VOICE RULES (apply to all sentences, not just flagged ones) ═══

VOICE: Write with calm authority. Sound like someone who understands the subject deeply and speaks with control. No fake grandiosity. No inflated drama. No empty sophistication. No first person in narration blocks (HOOK through CONCLUSION). OUTRO may contain "vous/you" in the question.

ORAL DELIVERY: This script is meant to be read aloud. Every sentence must sound believable when spoken by a narrator. If a sentence sounds written rather than spoken, rewrite it.

RHYTHM: Vary sentence length. Alternate short impact lines with medium sentences and occasional longer flowing observations. Never let three consecutive sentences feel mechanically similar in length or structure.

BAN LIST — delete, replace, or rewrite on sight:
Moreover, Furthermore, Additionally, It's important to note, Interestingly, In fact, Essentially, Ultimately, It goes without saying, Notably, Indeed, As we can see, On one hand, On the other hand, First, Second, Third, In conclusion, Overall, Therefore, Thus, De plus, En outre, Par ailleurs, Il est intéressant de noter, En effet, En conclusion, Dans l'ensemble

═══ SECTION-SPECIFIC RULES ═══

- [[HOOK]]: Must contain two concrete scenes in collision. Do NOT reduce to one scene. Sharpen the collision if needed.
- [[CONTEXT]]: 4 beats only (era + character + tension + question). Do NOT add technical specs or sources.
- [[PROMISE]]: MAX 6 lines. ONE register. Do NOT expand.
- [[ACT2]] / [[ACT2B]] / [[ACT3]]: No paragraph labels. Every paragraph must open with a concrete anchor (date+place, name+action, object, temporal shift).
- [[CLIMAX]]: MIN 6 sentences. Must resolve every HOOK tension. Do NOT shorten.
- [[INSIGHT]]: 3-4 sentences. S1 universal / S2 demonstration / S3 implication. No questions. No directives.
- [[CONCLUSION]]: Last sentence must be sensory, 5-10 words. No question.
- [[OUTRO]]: ONE short question (20-100 chars, ends with "?"). Do NOT split, expand, or remove the "?". Do NOT insert CTA vocabulary.
- [[END_SCREEN]]: Leave COMPLETELY untouched. Do not rewrite. Do not rephrase. Copy verbatim.

EDITORIAL BLOCKS:
[[STYLE CHECK]] and [[RISK CHECK]] — leave EXACTLY as written, character for character.

[[TRANSITIONS]] — SYNCHRONIZATION REQUIRED:
After all content corrections are applied, you MUST update [[TRANSITIONS]] to reflect modified sentences. For each boundary (HOOK→CONTEXT, CONTEXT→PROMISE, etc.):
1. Find the actual last sentence of the outgoing section (OUT) and actual first sentence of the incoming section (IN) in the corrected script.
2. If the OUT or IN sentence in [[TRANSITIONS]] no longer matches the actual section boundary → replace it with the correct sentence.
3. Keep Rating and Note fields unchanged unless the transition quality has clearly changed due to your edits.
This is a MANDATORY final step. Stale OUT/IN quotes in [[TRANSITIONS]] after a humanize pass is a bug.

═══ TYPOGRAPHY AND PUNCTUATION ═══

- Keep the same language as the source text.
- If French: never use colons in narration; always place a space before ? ! ;
- NEVER use em dash "—" (U+2014) or en dash "–" (U+2013) for parenthetical insertions. Use commas or periods.
- NEVER use ellipsis "…" or "..." — replace with a period.
- Clean up punctuation for oral readability.

═══ STRICT PRESERVATION RULES ═══

- Preserve every [[TAG]] marker exactly as written.
- Do not remove, rename, add, merge, or split tags.
- Do not add headings, notes, comments, explanations, bullet points, or meta-text.
- Do not explain your changes.
- Do not output anything before or after the rewritten script.

═══ FACTS PRESERVATION CHECK ═══

After all rewrites, verify:
- No factual information has been removed
- All named sources, dates, and attributions intact
- No new facts have been introduced
- Section structure (tags) unchanged
- Character count within ±15% of original
If any fact is missing → restore it by integrating it into the nearest concrete sentence.

═══ FINAL QUALITY CHECK ═══

Before output, silently verify:
- All [[TAG]] markers are intact
- Language matches the source
- No facts added or removed
- Chronology and logic preserved
- Prose sounds human when read aloud
- Rhythm is varied
- Banned phrases are removed
- END_SCREEN is verbatim identical to input
- Output contains only the rewritten full script

OUTPUT INSTRUCTION:
Return only the full rewritten script, with all original [[TAG]] markers preserved exactly.
No commentary. No explanations. No notes. No alternatives.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { script, language, model } = await req.json();
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
        model: model || "openai/gpt-5",
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
