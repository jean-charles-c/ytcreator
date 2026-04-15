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
