# Script Validation Spec

This document defines validation checks for scripts produced by `generate-script`. Each rule has a severity, fail criteria, and a detection method.

## 1. STRUCTURE

### 1.1 ALL TAGS PRESENT
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: Fewer than all 15 section tags present, or tags out of canonical order
- **Canonical order**: `[[HOOK]], [[CONTEXT]], [[PROMISE]], [[ACT1]], [[ACT2]], [[ACT2B]], [[ACT3]], [[CLIMAX]], [[INSIGHT]], [[CONCLUSION]], [[OUTRO]], [[END_SCREEN]], [[TRANSITIONS]], [[STYLE CHECK]], [[RISK CHECK]]`
- **Detection**: Tag regex scan; compare indices to canonical order.

### 1.2 OUTRO LENGTH
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: OUTRO exceeds 100 characters or contains more than one sentence before the question
- **Detection**: Character count of OUTRO section; split on `?` and check that at most one sentence precedes it.

### 1.4 OUTRO & END_SCREEN CHAR RANGES
- **Severity**: 🔴 CRITICAL
- **Fail criteria**:
  - OUTRO outside 20-100 characters (excluding the `[[OUTRO]]` tag)
  - END_SCREEN outside 80-400 characters (excluding the `[[END_SCREEN]]` tag)
- **Detection**: Character count of each block's body (trimmed, tag excluded).
- **Feedback**: "OUTRO must be 20-100 chars. END_SCREEN must be 80-400 chars (3-4 conversational sentences with CTAs)."

## 7. NARRATIVE INTEGRITY

### 7.1 PROMISE SOURCE LISTING
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: PROMISE section contains 3+ proper nouns (archives, institutions, publications, named documents)
- **Detection**: Count proper nouns in PROMISE text. Flag if ≥ 3.

### 7.2 CONTEXT ANTICIPATION
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: CONTEXT contains technical terms that also appear in ACT1 or ACT2 (suggesting anticipation)
- **Detection**: Extract top-20 non-trivial nouns from ACT1+ACT2. Check how many appear in CONTEXT. Flag if > 5 shared terms.

### 7.3 CLIMAX RECAPS ACT2
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: CLIMAX shares more than 40% of its non-trivial nouns with ACT2
- **Detection**: Cosine similarity or simple noun overlap between CLIMAX and ACT2 text. Flag if overlap > 40%.

### 7.4 FIRST PERSON CONSISTENCY
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: First-person pronouns appear in 1-3 sections but NOT in HOOK (inconsistent narrator)
- **Detection**:
  - Count sections containing "je ", "j'", "i ", "i've"
  - If count > 0 AND HOOK contains no first person → FLAG
  - If count > 0 AND count < 4 → FLAG (inconsistent)
  - If ALL sections contain first person → PASS (consistent choice)

### 7.5 INSIGHT LENGTH
- **Severity**: 🟢 MINOR
- **Fail criteria**: INSIGHT exceeds 300 characters
- **Detection**: Character count of INSIGHT section.

### 7.6 CONCLUSION ENDS WITH QUESTION
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: Last sentence of CONCLUSION contains "?"
- **Detection**: Extract last sentence. Check for "?".

### 7.7 ACT2B INTRODUCES NEW CONTENT
- **Severity**: 🟡 MEDIUM
- **Pass criteria**: ACT2B shares fewer than 50% of its non-trivial nouns with ACT2
- **Fail criteria**: ACT2B noun overlap with ACT2 exceeds 50%
- **Detection**: Extract non-trivial nouns (excluding articles, prepositions, common verbs) from both sections. Calculate overlap ratio. Flag if > 50%.
- **Feedback**: "ACT2B may be repeating ACT2 content rather than introducing genuine contradictions."

### 7.8 ACT3 STAYS IN CONSEQUENCES
- **Severity**: 🟡 MEDIUM
- **Pass criteria**: ACT3 contains fewer than 2 causal explanation markers ("because", "car", "parce que", "due to", "since", "puisque") used to explain events introduced in ACT2
- **Fail criteria**: 2+ causal explanations pointing back to ACT2 events
- **Detection**: Flag causal markers in ACT3. Check if the subject of the causal clause appears in ACT2.
- **Feedback**: "ACT3 appears to re-explain ACT2 events rather than describing their consequences."

### 7.9 CLIMAX DOES NOT RECAP
- **Severity**: 🟡 MEDIUM
- **Pass criteria**: CLIMAX noun overlap with ACT2 is below 35%
- **Fail criteria**: CLIMAX noun overlap with ACT2 exceeds 35%
- **Detection**: Same method as 7.7.
- **Feedback**: "CLIMAX may be recapping ACT2 rather than resolving the central tension."

### 7.10 ACT2B OPENS WITH RUPTURE SIGNAL
- **Severity**: 🟢 MINOR
- **Pass criteria**: ACT2B first sentence contains a contrast/rupture marker
- **Fail criteria**: No rupture marker in first sentence of ACT2B
- **Detection**: Check first 100 characters of ACT2B for: "but", "except", "however", "yet", "sauf", "mais", "pourtant", "or"
- **Feedback**: "ACT2B should open with a rupture signal to clearly separate it from ACT2."

### 7.11 NO FIRST PERSON NARRATOR
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: Any core narration block (HOOK…CONCLUSION, excluding OUTRO) contains first-person singular pronouns
- **Detection**: Regex on core blocks for (case-insensitive, word boundary): `\bje\b`, `\bj'`, `\bmoi\b`, `\bme\b`, `\bma\b`, `\bmon\b`, `\bmes\b`, `\bmien`, `\bi\b`, `\bi'(m|ve|d|ll)`, `\bmy\b`, `\bmine\b`, `\bmyself\b`
- **Feedback**: "First-person narration detected. The narrator is invisible — rewrite in third person or impersonal form."

### 7.12 NO PILLAR/LIST STRUCTURE IN ACT2
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: ACT2, ACT2B, or ACT3 contains enumeration markers such as:
  - Numeric: "premièrement", "deuxièmement", "troisièmement", "first", "second", "third", "one:", "two:", "three:"
  - Pillar/axis: "pilier", "piliers", "axe", "axes", "pillar", "pillars", "axis", "volet", "facette"
  - Categorical: "on one hand / on the other hand", "d'une part / d'autre part", "catégorie", "category", "type", "form"
  - Transitional labels: "moreover", "furthermore", "additionally", "in addition", "par ailleurs", "de plus", "en outre"
  - Numbered list patterns: `^\s*\d+[\.\)]\s`, `^\s*[-•]\s` at sentence/paragraph start
- **Detection**: Regex scan of ACT2, ACT2B, ACT3 for these markers (case-insensitive). Flag on ANY occurrence.
- **Feedback**: "Enumeration detected. Rewrite as a continuous escalation of reveals using temporal/causal/contrastive connectors. See rule 7.16 for paragraph-label detection."

### 7.13 NO VIEWER-DIRECTED QUESTION IN INSIGHT/CONCLUSION
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: INSIGHT or CONCLUSION contains any `?` character
- **Detection**: Simple substring check for `?` in INSIGHT and CONCLUSION sections.
- **Feedback**: "Questions directed at the viewer belong only in OUTRO. Rewrite the INSIGHT/CONCLUSION as a declarative statement."

### 7.14 OUTRO VALIDITY (ONE QUESTION, NO CTA VOCABULARY)
- **Severity**: 🔴 CRITICAL
- **Fail criteria**:
  - OUTRO contains 0 or ≥2 `?` characters, OR
  - OUTRO does not end with `?`, OR
  - OUTRO contains ANY CTA vocabulary (these belong in END_SCREEN)
- **Banned CTA vocabulary in OUTRO** (case-insensitive, word-boundary):
  - FR: `abonnez`, `abonne`, `partagez`, `partage`, `likez`, `like`, `notification`, `cloche`, `newsletter`, `inscrivez`, `prochain épisode`, `semaine prochaine`, `chaîne`, `soutenez`, `envoyez`, `si vous avez aimé`, `merci d'avoir`, `rendez-vous bientôt`, `je reviendrai`, `je publierai`, `soutenez-nous`, `commentaire`, `commentez`
  - EN: `subscribe`, `share`, `like`, `notification`, `bell`, `newsletter`, `sign up`, `next episode`, `next week`, `channel`, `support`, `if you enjoyed`, `thanks for watching`, `see you soon`, `comment`
- **Detection**: Count `?` in OUTRO; check last non-whitespace character; regex scan for any banned CTA word.
- **Feedback**: "OUTRO must be exactly ONE short question directed at the viewer and must contain ZERO CTA vocabulary. Move all CTAs to END_SCREEN."

### 7.15 ILLUSTRABILITY — EDITORIAL COMMENTARY DETECTION
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: Any core narration block (HOOK through OUTRO) contains abstract editorial commentary that cannot be illustrated (phrases like "ce n'est pas un détail", "ce qui est fascinant", "il faut le comprendre", "c'est exactement ce qui", "ce qu'il faut retenir", "on ne peut pas ignorer")
- **Detection**: Regex scan for a dictionary of FR/EN editorial-commentary phrases. Flag if ≥ 2 hits across the narration.
- **Feedback**: "Replace editorial commentary with concrete, illustrable facts, actions, or objects."

### 7.16 ACT2 PARAGRAPH LABEL DETECTION
- **Severity**: 🔴 CRITICAL
- **Applies to**: ACT2, ACT2B, ACT3
- **Fail criteria**: A paragraph opens with a line that functions as a label — a short isolated phrase that names the topic of the following paragraph rather than being part of the narrative flow. Three detectable patterns:
  1. **Short isolated line followed by a paragraph break**: a line ≤ 60 characters not ending with `.`, `?`, `!` before a `\n\n` break.
  2. **Thematic/descriptive noun phrase at paragraph start**: pattern like `^[A-Z][a-zéèêàâîôûç ]{2,60}\.\s*\n` where the phrase names a theme (e.g. "Les conséquences économiques.", "The political fallout.", "Le tournant décisif.").
  3. **"The X of Y" / "Les X de Y" constructions as standalone openers**: noun-phrase titles with no verb, functioning as a header.
- **Detection**:
  - For each paragraph in ACT2/ACT2B/ACT3, extract the first line.
  - Remove-and-check test: if removing the first line leaves a grammatically/narratively complete paragraph, the line is a label.
  - Flag any match.
- **Feedback**: "Paragraph label detected at the start of '[paragraph]'. Remove the label and rewrite the paragraph so it opens directly with a date+place, name+action, or concrete fact. See generate-script §PARAGRAPH LABEL PROHIBITION."

### 7.17 END_SCREEN VALIDITY
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: END_SCREEN fails ANY of:
  - Not present, or outside 80-400 character range (see 1.4)
  - Fewer than 2 or more than 5 sentences
  - Does NOT contain a subscription CTA (subscribe/abonnez/abonne)
  - Does NOT contain a comment invitation (comment/commentaire/commentez or a `?` inviting feedback)
  - Contains 0 or ≥2 `?` characters (must contain exactly one `?`, the comment invitation)
- **Detection**: Character count, sentence split on `[.!?]`, regex for subscription and comment vocabulary, `?` count.
- **Feedback**: "END_SCREEN must be 3-4 conversational sentences containing a subscription CTA, a comment invitation (exactly one `?`), and optionally a next-episode tease."

### 7.19 CLIMAX MIN LENGTH
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: CLIMAX contains fewer than 6 sentences
- **Detection**: Split CLIMAX body on `[.!?]` followed by whitespace or end of block. Count non-empty segments.
- **Feedback**: "CLIMAX must contain at least 6 sentences to properly resolve every HOOK element. Rewrite longer."

### 7.20 CLIMAX HOOK CLOSURE
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: CLIMAX does not explicitly close every tension/image/contradiction opened in HOOK
- **Detection**: Extract non-trivial nouns and named entities from HOOK. Verify at least 60% of them (or their explicit pronominal reference) reappear in CLIMAX. If HOOK contains a question or contradiction, CLIMAX must contain a declarative resolution of that tension.
- **Feedback**: "CLIMAX fails the HOOK closure contract. Every tension/image opened in HOOK must have an explicit resolution in CLIMAX."

### 7.21 INSIGHT MIN LENGTH
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: INSIGHT contains fewer than 3 sentences (cannot carry S1 universal / S2 demonstration / S3 implication structure)
- **Detection**: Sentence count on INSIGHT body. Flag if < 3.
- **Feedback**: "INSIGHT must be 3–4 sentences to build universal → demonstration → implication."

### 7.22 END_SCREEN UNCONFIRMED TEASE
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: END_SCREEN contains a specific next-episode subject (named topic, specific title) when no `{next_episode_subject}` was provided in the user message
- **Detection**: Regex scan for "prochain épisode", "next episode", "la semaine prochaine", "next week", followed by a named topic. If the user message did not supply a confirmed next subject, flag any concrete topic tease. A generic fallback like "D'autres enquêtes dans ce style arrivent." passes.
- **Feedback**: "END_SCREEN teases a next episode that was not confirmed in the input. Use the generic fallback instead."

### 7.23 TRUNCATED WORD DETECTION
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: Any core narration block starts a sentence with a 1–3 letter word fragment followed by an unrelated longer word (generation truncation artifact)
- **Detection**: Regex `/(?<=[.!?]\s|^)[a-zà-ü]{1,3}\s+[a-zà-ü]{4,}/im` on each block. Common false positives ("le chat", "un homme", "la main", "de la", "et ils", "il y a") must be whitelisted.
- **Feedback**: "Truncated word fragment detected — the generation was cut mid-stream. Rewrite the affected sentence."

### 7.18 CTA VOCABULARY CONTAINMENT
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: Any CTA vocabulary (the full banned list from 7.14) appears in ANY block OTHER than `[[END_SCREEN]]`. This is the corollary of 7.14, extended to all narration blocks.
- **Detection**: For each block in {HOOK, CONTEXT, PROMISE, ACT1, ACT2, ACT2B, ACT3, CLIMAX, INSIGHT, CONCLUSION, OUTRO}, regex scan for any banned CTA word from 7.14.
- **Feedback**: "CTA vocabulary '[word]' found in [[BLOCK]]. CTAs belong ONLY in END_SCREEN. Remove from narration and move to END_SCREEN."
