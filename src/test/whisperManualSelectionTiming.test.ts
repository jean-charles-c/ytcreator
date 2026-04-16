import { describe, expect, it } from "vitest";
import {
  getManualSelectionEndTime,
  recalculateWhisperShotEndTimesWithManualRanges,
} from "../components/editor/whisperManualSelectionTiming";

describe("whisperManualSelectionTiming", () => {
  const words = [
    { start: 105.326, end: 105.45 },
    { start: 105.45, end: 105.62 },
    { start: 105.62, end: 105.8 },
    { start: 105.8, end: 105.94 },
    { start: 105.94, end: 106.208 },
    { start: 106.24, end: 106.36 },
  ];

  it("derives the manual end time from the full selected whisper range", () => {
    const manualEndTime = getManualSelectionEndTime(
      {
        isManualAnchor: true,
        whisperStartIdx: 0,
        manualSelectionEndIdx: 4,
        startTime: 105.326,
      },
      words
    );

    expect(manualEndTime).toBe(106.208);
  });

  it("extends the displayed shot end time when a manual selection is longer than the auto timing", () => {
    const recalculated = recalculateWhisperShotEndTimesWithManualRanges(
      [
        {
          shotId: "shot-29",
          startTime: 105.326,
          endTime: 105.946,
          whisperStartIdx: 0,
          manualSelectionEndIdx: 4,
          isManualAnchor: true,
        },
        {
          shotId: "shot-30",
          startTime: 105.946,
          endTime: 107,
          whisperStartIdx: 5,
          manualSelectionEndIdx: null,
          isManualAnchor: false,
        },
      ],
      words,
      110
    );

    expect(recalculated[0].endTime).toBe(106.208);
    expect(recalculated[1].endTime).toBe(110);
  });
});