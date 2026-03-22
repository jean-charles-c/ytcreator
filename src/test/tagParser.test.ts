import { describe, it, expect } from "vitest";
import { parseTaggedScript, reassembleFromParsed, reassembleWithTags } from "../components/editor/tagParser";

const SAMPLE_TAGGED = `<plan>
Some planning text here.
</plan>
[[HOOK]]
A striking opening line.
Second hook paragraph.

[[CONTEXT]]
Context paragraph one.

[[PROMISE]]
Promise teaser.

[[ACT1]]
Act 1 content here.

[[ACT2]]
Act 2 escalation content.
More act 2.

[[ACT2B]]
Counter-point content.

[[ACT3]]
Act 3 impact.

[[CLIMAX]]
Climax revelation.

[[INSIGHT]]
Insight takeaway.

[[CONCLUSION]]
Final thought.

[[TRANSITIONS]]
HOOK→CONTEXT: Seamless.

[[STYLE CHECK]]
Style is consistent.

[[RISK CHECK]]
No factual issues found.`;

describe("parseTaggedScript", () => {
  it("extracts all 13 sections from a tagged script", () => {
    const result = parseTaggedScript(SAMPLE_TAGGED);
    expect(result.tagged).toBe(true);
    expect(result.sections).toHaveLength(13);
    expect(result.emptySections).toHaveLength(0);
    expect(result.preamble).toBe("");
  });

  it("strips <plan> blocks", () => {
    const result = parseTaggedScript(SAMPLE_TAGGED);
    const allContent = result.sections.map((s) => s.content).join(" ");
    expect(allContent).not.toContain("planning text");
  });

  it("preserves content verbatim", () => {
    const result = parseTaggedScript(SAMPLE_TAGGED);
    expect(result.sections[0].content).toBe("A striking opening line.\nSecond hook paragraph.");
    expect(result.sections[0].key).toBe("hook");
  });

  it("maintains canonical order", () => {
    const keys = parseTaggedScript(SAMPLE_TAGGED).sections.map((s) => s.key);
    expect(keys).toEqual([
      "hook", "context", "promise", "act1", "act2", "act2b",
      "act3", "climax", "insight", "conclusion",
      "transitions", "style_check", "risk_check",
    ]);
  });

  it("handles empty input", () => {
    const result = parseTaggedScript("");
    expect(result.tagged).toBe(false);
    expect(result.emptySections).toHaveLength(13);
  });

  it("handles untagged script as preamble", () => {
    const result = parseTaggedScript("Just a plain script with no tags.");
    expect(result.tagged).toBe(false);
    expect(result.preamble).toBe("Just a plain script with no tags.");
  });

  it("handles missing sections gracefully", () => {
    const partial = "[[HOOK]]\nHook text.\n\n[[CONCLUSION]]\nEnd.";
    const result = parseTaggedScript(partial);
    expect(result.tagged).toBe(true);
    expect(result.sections.find((s) => s.key === "hook")!.content).toBe("Hook text.");
    expect(result.sections.find((s) => s.key === "conclusion")!.content).toBe("End.");
    expect(result.emptySections).toContain("act1");
  });

  it("parses space-separated tags like STYLE CHECK", () => {
    const text = "[[STYLE CHECK]]\nStyle notes here.";
    const result = parseTaggedScript(text);
    expect(result.tagged).toBe(true);
    expect(result.sections.find((s) => s.key === "style_check")!.content).toBe("Style notes here.");
  });
});

describe("reassembleFromParsed", () => {
  it("produces clean text without tags", () => {
    const result = parseTaggedScript(SAMPLE_TAGGED);
    const text = reassembleFromParsed(result.sections);
    expect(text).not.toContain("[[");
    expect(text).toContain("A striking opening line.");
    expect(text).toContain("Final thought.");
  });
});

describe("reassembleWithTags", () => {
  it("produces tagged output", () => {
    const result = parseTaggedScript(SAMPLE_TAGGED);
    const text = reassembleWithTags(result.sections);
    expect(text).toContain("[[HOOK]]");
    expect(text).toContain("[[CONCLUSION]]");
    expect(text).toContain("[[STYLE CHECK]]");
    expect(text).toContain("[[RISK CHECK]]");
  });
});

/* ── Robustness tests for NarrativeEngineExpert output ── */

describe("parseTaggedScript — robustness", () => {
  it("handles case-insensitive tags", () => {
    const text = "[[hook]]\nLower case hook.\n[[CONTEXT]]\nUpper context.";
    const result = parseTaggedScript(text);
    expect(result.tagged).toBe(true);
    expect(result.sections.find(s => s.key === "hook")!.content).toBe("Lower case hook.");
    expect(result.sections.find(s => s.key === "context")!.content).toBe("Upper context.");
  });

  it("handles extra whitespace in STYLE CHECK / RISK CHECK", () => {
    const text = "[[STYLE  CHECK]]\nNotes.\n[[RISK  CHECK]]\nRisks.";
    const result = parseTaggedScript(text);
    expect(result.sections.find(s => s.key === "style_check")!.content).toBe("Notes.");
    expect(result.sections.find(s => s.key === "risk_check")!.content).toBe("Risks.");
  });

  it("handles multiline content with paragraphs in each section", () => {
    const text = `[[HOOK]]
Line 1 of hook.

Line 2 of hook.

Line 3 of hook.

[[CONTEXT]]
Context line 1.

Context line 2.`;
    const result = parseTaggedScript(text);
    const hook = result.sections.find(s => s.key === "hook")!;
    expect(hook.content).toContain("Line 1 of hook.");
    expect(hook.content).toContain("Line 3 of hook.");
  });

  it("handles a full 13-block French script", () => {
    const frScript = `[[HOOK]]
En 1347, un navire fantôme accoste à Messine.

[[CONTEXT]]
La peste noire ravage l'Europe médiévale.

[[PROMISE]]
Ce que nous allons découvrir change tout.

[[ACT1]]
Les origines remontent à l'Asie centrale.

[[ACT2]]
Les preuves s'accumulent de manière surprenante.

[[ACT2B]]
Mais une contradiction majeure émerge.

[[ACT3]]
Les conséquences sont dévastatrices.

[[CLIMAX]]
La convergence finale révèle la vérité.

[[INSIGHT]]
Ce que cette histoire nous enseigne.

[[CONCLUSION]]
Le port de Messine existe toujours.

[[TRANSITIONS]]
HOOK→CONTEXT: ✅ SEAMLESS

[[STYLE CHECK]]
Ton documentaire cohérent. Rating: STRONG.

[[RISK CHECK]]
🟢 Dates vérifiées. Rating: SOLID.`;

    const result = parseTaggedScript(frScript);
    expect(result.tagged).toBe(true);
    expect(result.sections).toHaveLength(13);
    expect(result.emptySections).toHaveLength(0);
    expect(result.sections[0].content).toContain("navire fantôme");
    expect(result.sections[10].content).toContain("SEAMLESS");
    expect(result.sections[11].content).toContain("STRONG");
    expect(result.sections[12].content).toContain("SOLID");
  });

  it("handles a short script (all sections present but minimal)", () => {
    const tags = ["HOOK","CONTEXT","PROMISE","ACT1","ACT2","ACT2B","ACT3","CLIMAX","INSIGHT","CONCLUSION","TRANSITIONS","STYLE CHECK","RISK CHECK"];
    const shortScript = tags.map(t => `[[${t}]]\nMinimal ${t.toLowerCase()} content.`).join("\n\n");
    const result = parseTaggedScript(shortScript);
    expect(result.tagged).toBe(true);
    expect(result.emptySections).toHaveLength(0);
    expect(result.sections).toHaveLength(13);
  });

  it("handles a long script with extensive ACT2 content", () => {
    const longAct2 = Array.from({length: 20}, (_, i) => `Evidence paragraph ${i+1} with detailed analysis.`).join("\n\n");
    const text = `[[HOOK]]\nShort hook.\n[[CONTEXT]]\nBrief context.\n[[PROMISE]]\nPromise.\n[[ACT1]]\nSetup.\n[[ACT2]]\n${longAct2}\n[[ACT2B]]\nComplication.\n[[ACT3]]\nStakes.\n[[CLIMAX]]\nResolution.\n[[INSIGHT]]\nTakeaway.\n[[CONCLUSION]]\nFinal image.\n[[TRANSITIONS]]\nAudit.\n[[STYLE CHECK]]\nCheck.\n[[RISK CHECK]]\nRisks.`;
    const result = parseTaggedScript(text);
    expect(result.tagged).toBe(true);
    const act2 = result.sections.find(s => s.key === "act2")!;
    expect(act2.content).toContain("Evidence paragraph 1");
    expect(act2.content).toContain("Evidence paragraph 20");
  });

  it("core sections vs editorial sections are correctly identified", () => {
    const result = parseTaggedScript(SAMPLE_TAGGED);
    const coreKeys = result.sections.filter(s => !["transitions","style_check","risk_check"].includes(s.key));
    const editorialKeys = result.sections.filter(s => ["transitions","style_check","risk_check"].includes(s.key));
    expect(coreKeys).toHaveLength(10);
    expect(editorialKeys).toHaveLength(3);
  });

  it("reassembleFromParsed excludes editorial blocks from narration output", () => {
    const result = parseTaggedScript(SAMPLE_TAGGED);
    // Only core sections should appear in reassembled narration
    const coreOnly = result.sections.filter(s => !["transitions","style_check","risk_check"].includes(s.key));
    const text = reassembleFromParsed(coreOnly);
    expect(text).not.toContain("Seamless");
    expect(text).not.toContain("Style is consistent");
    expect(text).toContain("A striking opening line.");
  });

  it("handles duplicate tags by appending content", () => {
    const text = "[[HOOK]]\nFirst hook.\n[[HOOK]]\nSecond hook.\n[[CONTEXT]]\nCtx.";
    const result = parseTaggedScript(text);
    const hook = result.sections.find(s => s.key === "hook")!;
    expect(hook.content).toContain("First hook.");
    expect(hook.content).toContain("Second hook.");
  });
});
