# Script Validation Spec

This document defines validation checks for scripts produced by `generate-script`. Each rule has a severity, fail criteria, and a detection method.

## 1. STRUCTURE

### 1.1 ALL TAGS PRESENT
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: Fewer than all 14 section tags present, or tags out of canonical order
- **Canonical order**: `[[HOOK]], [[CONTEXT]], [[PROMISE]], [[ACT1]], [[ACT2]], [[ACT2B]], [[ACT3]], [[CLIMAX]], [[INSIGHT]], [[CONCLUSION]], [[OUTRO]], [[TRANSITIONS]], [[STYLE CHECK]], [[RISK CHECK]]`
- **Detection**: Tag regex scan; compare indices to canonical order.

### 1.2 OUTRO LENGTH
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: OUTRO exceeds 100 characters or contains more than one sentence before the question
- **Detection**: Character count of OUTRO section; split on `?` and check that at most one sentence precedes it.

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
- **Fail criteria**: ACT2 contains enumeration markers such as "trois piliers", "deux axes", "premièrement", "deuxièmement", "first / second / third", "pillar", "axis", "axes", or numbered list patterns
- **Detection**: Regex scan of ACT2 for these markers (case-insensitive); also flag patterns like `^\d+\.\s` at sentence start.
- **Feedback**: "ACT2 reads like a list. Rewrite as a continuous escalation of reveals using temporal/causal/contrastive connectors."

### 7.13 NO VIEWER-DIRECTED QUESTION IN INSIGHT/CONCLUSION
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: INSIGHT or CONCLUSION contains any `?` character
- **Detection**: Simple substring check for `?` in INSIGHT and CONCLUSION sections.
- **Feedback**: "Questions directed at the viewer belong only in OUTRO. Rewrite the INSIGHT/CONCLUSION as a declarative statement."

### 7.14 OUTRO CONTAINS EXACTLY ONE QUESTION
- **Severity**: 🔴 CRITICAL
- **Fail criteria**: OUTRO contains 0 or ≥2 `?` characters, OR the OUTRO does not end with `?`
- **Detection**: Count `?` in OUTRO; check last non-whitespace character.
- **Feedback**: "OUTRO must be exactly ONE short question directed at the viewer."

### 7.15 ILLUSTRABILITY — EDITORIAL COMMENTARY DETECTION
- **Severity**: 🟡 MEDIUM
- **Fail criteria**: Any core narration block contains abstract editorial commentary that cannot be illustrated (phrases like "ce n'est pas un détail", "ce qui est fascinant", "il faut le comprendre", "c'est exactement ce qui", "ce qu'il faut retenir", "on ne peut pas ignorer")
- **Detection**: Regex scan for a dictionary of FR/EN editorial-commentary phrases. Flag if ≥ 2 hits across the narration.
- **Feedback**: "Replace editorial commentary with concrete, illustrable facts, actions, or objects."
