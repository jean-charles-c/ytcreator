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

[[ACT3]]
Act 3 impact.

[[CLIMAX]]
Climax revelation.

[[INSIGHT]]
Insight takeaway.

[[CONCLUSION]]
Final thought.`;

describe("parseTaggedScript", () => {
  it("extracts all 9 sections from a tagged script", () => {
    const result = parseTaggedScript(SAMPLE_TAGGED);
    expect(result.tagged).toBe(true);
    expect(result.sections).toHaveLength(9);
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
    expect(keys).toEqual(["hook", "context", "promise", "act1", "act2", "act3", "climax", "insight", "conclusion"]);
  });

  it("handles empty input", () => {
    const result = parseTaggedScript("");
    expect(result.tagged).toBe(false);
    expect(result.emptySections).toHaveLength(9);
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
  });
});
