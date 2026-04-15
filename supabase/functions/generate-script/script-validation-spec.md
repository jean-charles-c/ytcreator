# Script Validation Spec

This document defines validation checks for scripts produced by `generate-script`. Each rule has a severity, fail criteria, and a detection method.

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
