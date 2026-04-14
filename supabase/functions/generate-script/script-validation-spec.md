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
