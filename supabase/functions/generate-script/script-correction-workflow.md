# Script Correction Workflow

Post-generation correction passes triggered by validation checks in `script-validation-spec.md`.

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

## 8. MISSING OR INVALID OUTRO

**Trigger**: Validation checks 1.2, 7.14

**Scope**: Generate or repair the OUTRO block.
**Rule**: Exactly ONE short question directed at the viewer, maximum 100 characters, ending with `?`.

### Correction prompt template

```
You are writing (or repairing) the [[OUTRO]] block of a documentary script.

The OUTRO is ONE short question directed at the viewer, designed to trigger
a YouTube comment. It is the only place in the entire script where the
fourth wall is broken.

SCRIPT SUBJECT: {subject}
CENTRAL TENSION / MYSTERY: {central_mystery}
INSIGHT (intellectual takeaway): {insight_text}
CONCLUSION (sensory closing): {conclusion_text}

RULES:
- Output MUST be a single interrogative sentence ending with `?`.
- Maximum 15 words, maximum 100 characters.
- No narration bridge, no "and you, …", no "let me know in the comments".
- The question must hook a real opinion, memory, or choice from the viewer,
  tied to the specific subject of this script — not a generic closer.
- No "what do you think?" alone. It must carry the subject.
- Write in {langLabel}.

Output ONLY the question. No tag, no explanation.
```
