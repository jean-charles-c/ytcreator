# Script Correction Workflow

Post-generation correction passes triggered by validation checks in `script-validation-spec.md`.

## 2. PARAGRAPH LABEL REMOVAL

**Trigger**: Validation check 7.16 (also 7.12 when pillar/list structure is detected)

**Scope**: Rewrite every paragraph in ACT2, ACT2B, or ACT3 whose first line is a detected paragraph label.
**Rule**: Paragraphs must open with a concrete narrative anchor (date+place, name+action, concrete fact), never with a short isolated line that names the theme.

### Correction prompt template

```
You are repairing paragraphs of a documentary script that open with
"paragraph labels" — short isolated lines that name the topic instead
of being part of the narrative flow.

CURRENT [[{section_tag}]]:
{section_text}

DETECTED LABELS (these must be removed or rewritten):
{list_of_label_lines}

REWRITE RULES:
- Delete every detected label line.
- Rewrite the FIRST sentence of the affected paragraph so it opens directly
  with one of these concrete anchors:
    • a date + place ("En mars 1923, à Vienne, …")
    • a named actor + action ("Karl Lueger entre dans la salle du conseil, …")
    • a concrete object or fact ("Le dossier fait sept cents pages.")
    • a temporal pivot ("Quelques semaines plus tard, …")
- Do NOT replace one label with another. The opening must be a full sentence
  with a verb.
- Do NOT invent new facts. Only restructure the existing material.
- Keep approximately the same paragraph length (±15%).
- Write in {langLabel}.

Output ONLY the rewritten section body. No tags, no explanation, no labels.
```

## 6. INTER-SECTION REDUNDANCY

**Trigger**: Validation checks 7.7, 7.8, 7.9, 7.10

**Scope**: Rewrite the specific section that is repeating content, not the section it is repeating from.
**Rule**: Always fix the later section, never the earlier one.

### Priority order
1. Fix ACT2B if it mirrors ACT2
2. Fix ACT3 if it re-explains ACT2
3. Fix CLIMAX if it recaps ACT2/ACT3

### Correction prompt template

```
You are rewriting [[{section_tag}]] of a documentary script
because it repeats content already covered in [[{source_tag}]].

CURRENT [[{section_tag}]]:
{section_text}

CONTENT ALREADY COVERED IN [[{source_tag}]]
(must not be repeated):
{list_of_key_facts_from_source_section}

ROLE OF [[{section_tag}]]:
{insert the Section Role Contract for this section}

REWRITE RULES:
- Remove or replace any sentence that restates a fact already in {source_tag}.
- Replace removed content with material that fulfills the exclusive role of {section_tag}.
- If {section_tag} is ACT2B: introduce contradictions or complications not present in ACT2.
- If {section_tag} is ACT3: show consequences and changes in time, not explanations.
- If {section_tag} is CLIMAX: write a resolution of the central tension, not an inventory.
- Keep approximately the same character count (±15%).
- Write in {langLabel}.

Output ONLY the rewritten section. No tags, no explanation.
```

## 7. FIRST PERSON NARRATOR DETECTED

**Trigger**: Validation check 7.11

**Scope**: Rewrite every core narration block (HOOK → CONCLUSION) where first-person pronouns were detected. OUTRO is exempt.
**Rule**: Narrator is invisible. Third person or impersonal only.

### Correction prompt template

```
You are repairing a documentary script that mistakenly uses a first-person narrator.
The narrator must be INVISIBLE. No "I", no "me", no "mine", no "je", no "moi", no "mes".

CURRENT [[{section_tag}]]:
{section_text}

DETECTED FIRST-PERSON OCCURRENCES:
{list_of_matches}

REWRITE RULES:
- Replace every first-person construction with an impersonal, third-person,
  or direct-descriptive phrasing.
- "Je connais ce son" → "Ce son est reconnaissable / Ce son se reconnaît"
- "Je les trouve incroyables" → "Ils sont incroyables / Ils impressionnent"
- "Mon grand-père disait…" → "Les anciens disaient…" (unless a named witness)
- Do NOT invent new facts. Only rephrase the existing material.
- Keep the same rhythm, the same length (±10%), the same narrative intent.
- Write in {langLabel}.

Output ONLY the rewritten section. No tags, no explanation.
```

## 8A. MISSING OR INVALID OUTRO

**Trigger**: Validation checks 1.2, 1.4, 7.14

**Scope**: Generate or repair the OUTRO block.
**Rule**: Exactly ONE short question directed at the viewer, 20-100 characters, ending with `?`, ZERO CTA vocabulary.

### Correction prompt template

```
You are writing (or repairing) the [[OUTRO]] block of a documentary script.

The OUTRO is ONE short question directed at the viewer, designed to trigger
a real opinion or memory. It is the LAST narrative beat of the film, before
the separate [[END_SCREEN]] layer that carries the CTAs.

SCRIPT SUBJECT: {subject}
CENTRAL TENSION / MYSTERY: {central_mystery}
INSIGHT (intellectual takeaway): {insight_text}
CONCLUSION (sensory closing): {conclusion_text}

RULES:
- Output MUST be a single interrogative sentence ending with `?`.
- Length: 20 to 100 characters, maximum 15 words.
- NO CTA vocabulary whatsoever: no "abonnez", "subscribe", "commentaire",
  "comment", "partagez", "share", "like", "notification", "cloche",
  "chaîne", "channel", "prochain épisode", "newsletter", "rendez-vous",
  "soutenez". Those belong to END_SCREEN, not OUTRO.
- No narration bridge, no "and you, …" template, no "let me know".
- The question must hook a real opinion, memory, or choice from the viewer,
  tied to the specific subject of this script — not a generic closer.
- No "what do you think?" alone. It must carry the subject.
- Write in {langLabel}.

Output ONLY the question. No tag, no explanation.
```

## 8B. MISSING OR INVALID END_SCREEN

**Trigger**: Validation checks 1.1 (missing tag), 1.4, 7.17

**Scope**: Generate or repair the END_SCREEN block.
**Rule**: 3-4 conversational sentences, 80-400 chars, one subscription CTA, one comment invitation with exactly one `?`, optional next-episode tease.

### Correction prompt template

```
You are writing (or repairing) the [[END_SCREEN]] block of a documentary script.

The END_SCREEN is a POST-FILM conversational layer. It is not part of the
continuous narration. Its register is deliberately different: spoken, warm,
direct, the creator talking to the viewer once the film is over.

SCRIPT SUBJECT: {subject}
OUTRO (last narrative beat, do NOT repeat): {outro_text}

RULES:
- Output 3 or 4 short sentences, 80 to 400 characters total.
- Exactly ONE `?` — the comment invitation.
- MUST contain a subscription CTA ("abonnez-vous" / "subscribe" / equivalent).
- MUST contain a comment invitation ending with `?` ("dites-le en commentaire" /
  "tell me in the comments" / equivalent).
- MAY contain an optional next-episode tease or a short thanks.
- NO narration, no poetic imagery, no central-tension recall, no factual
  claim. This is CTA territory, not storytelling.
- Register: conversational, warm, direct. First person ("je" / "I") is
  ALLOWED here (and only here).
- Write in {langLabel}.

Output ONLY the END_SCREEN body. No tag, no explanation.
```

## 8C. CTA VOCABULARY CONTAMINATION

**Trigger**: Validation check 7.18

**Scope**: Rewrite any narration block (HOOK through OUTRO) where CTA vocabulary from the banned list leaked out of END_SCREEN.
**Rule**: CTAs exist ONLY in END_SCREEN. Every other block must be CTA-free.

### Correction prompt template

```
You are repairing a narration block of a documentary script that mistakenly
uses CTA vocabulary. CTAs belong ONLY in the [[END_SCREEN]] block.

CURRENT [[{section_tag}]]:
{section_text}

DETECTED CTA VOCABULARY (must be removed):
{list_of_matches}

REWRITE RULES:
- Delete every occurrence of the detected CTA words and the phrases they
  belong to.
- Replace them with narrative content that fulfills the role of {section_tag}
  (see Section Role Contract for this block).
- Do NOT preserve the CTA meaning. The CTA will be placed in END_SCREEN,
  not here.
- Do NOT invent new facts. Use material already present in the source or
  in neighboring sections.
- Keep approximately the same character count (±15%).
- Write in {langLabel}.

Output ONLY the rewritten section. No tags, no explanation.
```
