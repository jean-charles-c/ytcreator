import { describe, expect, it } from "vitest";
import { getNarrativeSegments, segmentSceneNarrative } from "@/components/editor/narrativeSegmentation";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("narrativeSegmentation long sentence proportional split", () => {
  it("splits a 122-char punctuated sentence into 2 shots", () => {
    const text = "Who were the builders of these walls, and how did their society mobilize labor, wealth, and belief to raise so much stone?";
    const result = segmentSceneNarrative(text);

    expect(text.length).toBeGreaterThan(100);
    expect(result.units).toHaveLength(2);
    expect(result.units.every((unit) => unit.charCount <= 100)).toBe(true);
    expect(normalize(result.units.map((unit) => unit.text).join(" "))).toBe(normalize(text));
  });

  it("splits the symbolic Conical Tower sentence into ordered fragments", () => {
    const text = "There is no ledger of titles, no manual for the rites, and some functions, like the Conical Tower’s, remain symbolic rather than mechanical.";
    const segments = getNarrativeSegments(text);

    expect(text.length).toBeGreaterThan(100);
    expect(segments.length).toBe(2);
    expect(segments.every((segment) => segment.length <= 100)).toBe(true);
    expect(normalize(segments.join(" "))).toBe(normalize(text));
  });
});
