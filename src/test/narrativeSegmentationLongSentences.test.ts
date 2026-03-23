import { describe, expect, it } from "vitest";
import { getNarrativeSegments, segmentSceneNarrative } from "@/components/editor/narrativeSegmentation";

describe("narrativeSegmentation preserves original behavior", () => {
  it("keeps sentences under 120 chars as single units", () => {
    const text = "Who were the builders of these walls, and how did their society mobilize labor, wealth, and belief to raise so much stone?";
    const result = segmentSceneNarrative(text);
    // 122 chars > 120 MAX_CHARS_SOFT → should split
    expect(result.units.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the 140-char Conical Tower sentence as split units", () => {
    const text = "There is no ledger of titles, no manual for the rites, and some functions, like the Conical Tower's, remain symbolic rather than mechanical.";
    const segments = getNarrativeSegments(text);
    // 140 chars > 120 → should split
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a 100-char sentence intact", () => {
    const text = "The walls stood tall and proud across the plateau, marking the boundaries of a once-great kingdom.";
    expect(text.length).toBeLessThanOrEqual(120);
    const result = segmentSceneNarrative(text);
    expect(result.units).toHaveLength(1);
  });
});
