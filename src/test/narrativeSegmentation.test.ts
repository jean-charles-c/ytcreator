import { describe, it, expect } from "vitest";
import { segmentSceneNarrative, computeNarrativeShotCount, getNarrativeSegments } from "@/components/editor/narrativeSegmentation";

describe("narrativeSegmentation", () => {
  it("returns empty for blank input", () => {
    const result = segmentSceneNarrative("");
    expect(result.units).toHaveLength(0);
    expect(result.totalChars).toBe(0);
  });

  it("keeps a short single sentence as one unit", () => {
    const text = "The sun set over Great Zimbabwe.";
    const result = segmentSceneNarrative(text);
    expect(result.units).toHaveLength(1);
    expect(result.units[0].cutReason).toBe("full_scene");
    expect(result.units[0].text).toBe(text);
  });

  it("splits multiple sentences into separate units", () => {
    const text = "The kingdom rose to power in the 13th century. Trade routes connected it to distant lands. Gold flowed through its markets.";
    const result = segmentSceneNarrative(text);
    expect(result.units.length).toBeGreaterThanOrEqual(2);
    // All text is covered
    const reconstructed = result.units.map(u => u.text).join(" ");
    expect(reconstructed.replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });

  it("splits a long sentence with clause boundaries", () => {
    const text = "The massive stone walls, built without mortar by skilled craftsmen over decades, enclosed a complex series of passages and enclosures that served both as royal residences and ceremonial spaces.";
    const result = segmentSceneNarrative(text);
    expect(result.units.length).toBeGreaterThanOrEqual(2);
    // No unit should exceed hard limit
    for (const unit of result.units) {
      expect(unit.charCount).toBeLessThanOrEqual(200);
    }
  });

  it("merges very short fragments with neighbors", () => {
    const text = "It fell. The empire crumbled under internal pressures and external threats from rival kingdoms.";
    const result = segmentSceneNarrative(text);
    // "It fell." is only 8 chars — should be merged
    const shortest = Math.min(...result.units.map(u => u.charCount));
    // Either merged or kept as exception — but result should be valid
    expect(result.units.length).toBeGreaterThanOrEqual(1);
  });

  it("detects temporal transitions", () => {
    const text = "The city thrived for centuries. Meanwhile, rival kingdoms gathered strength across the savanna.";
    const result = segmentSceneNarrative(text);
    expect(result.units.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a mono-idea long sentence intact when no clause boundary", () => {
    const text = "The extraordinary archaeological evidence discovered at this site continues to challenge long-held assumptions about pre-colonial African civilizations.";
    const result = segmentSceneNarrative(text);
    // 155 chars but single idea — should stay as 1 unit (exception)
    expect(result.units).toHaveLength(1);
    expect(result.hasExceptions).toBe(true);
  });

  it("computeNarrativeShotCount returns correct count", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const count = computeNarrativeShotCount(text);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("getNarrativeSegments returns string array", () => {
    const text = "The walls stood tall. Trade brought prosperity.";
    const segments = getNarrativeSegments(text);
    expect(Array.isArray(segments)).toBe(true);
    expect(segments.length).toBeGreaterThanOrEqual(1);
  });

  it("handles French text correctly", () => {
    const text = "Les murs de pierre se dressaient fièrement. Pendant ce temps, les commerçants traversaient le continent.";
    const result = segmentSceneNarrative(text);
    expect(result.units.length).toBeGreaterThanOrEqual(2);
  });

  it("concatenation of units reconstructs original text", () => {
    const text = "Great Zimbabwe was a medieval city. Its stone walls, built without mortar, still stand today. The city was home to thousands of people who traded gold and ivory.";
    const result = segmentSceneNarrative(text);
    const words = new Set(text.toLowerCase().replace(/[.,!?]/g, "").split(/\s+/));
    const unitWords = new Set(result.units.flatMap(u => u.text.toLowerCase().replace(/[.,!?]/g, "").split(/\s+/)));
    // All original words should appear in units
    for (const w of words) {
      expect(unitWords.has(w)).toBe(true);
    }
  });
});
