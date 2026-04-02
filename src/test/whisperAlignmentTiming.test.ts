import { describe, expect, it } from "vitest";
import { recalculateWhisperShotEndTimes } from "../components/editor/whisperAlignmentTiming";

describe("whisperAlignmentTiming", () => {
  it("uses the next matched shot start as the end of the previous shot", () => {
    const recalculated = recalculateWhisperShotEndTimes(
      [
        { shotId: "shot-1", startTime: 0, endTime: 6 },
        { shotId: "shot-2", startTime: 3.06, endTime: 5.4 },
        { shotId: "shot-3", startTime: 8.25, endTime: 12 },
      ],
      14
    );

    expect(recalculated.map((shot) => shot.endTime)).toEqual([3.06, 8.25, 14]);
  });

  it("recalculates a previous shot when a missing shot becomes manually matched", () => {
    const recalculated = recalculateWhisperShotEndTimes(
      [
        { shotId: "shot-1", startTime: 0, endTime: 10, status: "ok" },
        { shotId: "shot-2", startTime: 3.06, endTime: 4.8, status: "manual" },
        { shotId: "shot-3", startTime: 9.4, endTime: 12, status: "ok" },
      ],
      15
    );

    expect(recalculated[0].endTime).toBe(3.06);
    expect(recalculated[1].endTime).toBe(9.4);
    expect(recalculated[2].endTime).toBe(15);
  });

  it("keeps unmatched shots without derived end times", () => {
    const recalculated = recalculateWhisperShotEndTimes(
      [
        { shotId: "shot-1", startTime: 0, endTime: 4 },
        { shotId: "shot-2", startTime: null, endTime: 8 },
        { shotId: "shot-3", startTime: 10, endTime: 12 },
      ],
      16
    );

    expect(recalculated[0].endTime).toBe(10);
    expect(recalculated[1].endTime).toBeNull();
    expect(recalculated[2].endTime).toBe(16);
  });
}