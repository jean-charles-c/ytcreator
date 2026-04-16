import { describe, expect, it } from "vitest";
import { haveShotTimepointsChanged } from "../components/editor/timepointSync";

describe("haveShotTimepointsChanged", () => {
  it("detects a change when only the manual end time changes", () => {
    expect(
      haveShotTimepointsChanged(
        [
          { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
          { shotId: "shot-2", shotIndex: 1, timeSeconds: 1, manualEndTimeSeconds: 1.8 },
        ],
        [
          { shotId: "shot-1", shotIndex: 0, timeSeconds: 0 },
          { shotId: "shot-2", shotIndex: 1, timeSeconds: 1, manualEndTimeSeconds: 1.4 },
        ]
      )
    ).toBe(true);
  });

  it("ignores equivalent manual end values inside the frame epsilon", () => {
    expect(
      haveShotTimepointsChanged(
        [{ shotId: "shot-2", shotIndex: 1, timeSeconds: 1, manualEndTimeSeconds: 1.5 }],
        [{ shotId: "shot-2", shotIndex: 1, timeSeconds: 1, manualEndTimeSeconds: 1.5 + 1 / 480 }]
      )
    ).toBe(false);
  });
});