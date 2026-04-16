import { recalculateWhisperShotEndTimes, type WhisperAlignmentTimingLike } from "./whisperAlignmentTiming";

export interface WhisperManualSelectionWordLike {
  start: number;
  end: number;
}

export interface WhisperManualSelectionShotLike extends WhisperAlignmentTimingLike {
  startTime: number | null;
  whisperStartIdx: number | null;
  manualSelectionEndIdx: number | null;
  isManualAnchor?: boolean;
}

export function getManualSelectionEndTime<
  T extends Pick<WhisperManualSelectionShotLike, "isManualAnchor" | "manualSelectionEndIdx" | "whisperStartIdx" | "startTime">,
>(
  shot: T,
  words: readonly WhisperManualSelectionWordLike[]
): number | undefined {
  if (
    !shot.isManualAnchor ||
    shot.manualSelectionEndIdx === null ||
    shot.whisperStartIdx === null ||
    shot.startTime === null
  ) {
    return undefined;
  }

  const startWord = words[shot.whisperStartIdx];
  const endWord = words[shot.manualSelectionEndIdx];
  if (!startWord || !endWord) return undefined;

  const offset = shot.startTime - startWord.start;
  return Math.max(shot.startTime, endWord.end + offset);
}

export function recalculateWhisperShotEndTimesWithManualRanges<
  T extends WhisperManualSelectionShotLike,
>(
  shots: readonly T[],
  words: readonly WhisperManualSelectionWordLike[],
  audioDuration: number
): T[] {
  return recalculateWhisperShotEndTimes(shots, audioDuration).map((shot) => {
    const manualEndTime = getManualSelectionEndTime(shot, words);
    if (manualEndTime === undefined) return shot;

    const boundedManualEndTime = audioDuration > 0
      ? Math.min(audioDuration, manualEndTime)
      : manualEndTime;

    return {
      ...shot,
      endTime: boundedManualEndTime,
    } as T;
  });
}