import { describe, expect, it } from "vitest";
import { validateExactAlignedShotSentences, validateExactShotTimepoints } from "../components/editor/exactShotSync";

describe("exactShotSync", () => {
  it("rejects aligned shot sentences with orphan placeholders", () => {
    const validation = validateExactAlignedShotSentences(
      ["shot-1", "shot-2"],
      [
        { id: "shot-1", text: "A" },
        { id: "_missing_0", text: "B" },
        { id: "shot-2", text: "C" },
      ]
    );

    expect(validation.ok).toBe(false);
    expect(validation.placeholderIds).toEqual(["_missing_0"]);
  });

  it("rejects shot_timepoints with missing or placeholder ids", () => {
    const validation = validateExactShotTimepoints(
      ["shot-1", "shot-2", "shot-3"],
      [
        { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
        { shotId: "_missing_0", shotIndex: 1, timeSeconds: 2 },
        { shotId: "shot-3", shotIndex: 2, timeSeconds: 4 },
      ]
    );

    expect(validation.ok).toBe(false);
    expect(validation.placeholderIds).toEqual(["_missing_0"]);
    expect(validation.missingIds).toEqual(["shot-2"]);
  });
});
