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
  // Pass 1: derive endTimes from neighbours
  const firstPass = recalculateWhisperShotEndTimes(shots, audioDuration);

  // Pass 2: apply manual endTimes AND propagate them as the next shot's startTime
  const manualEnds = new Map<number, number>();
  const propagated: T[] = firstPass.map((shot, idx) => {
    const manualEndTime = getManualSelectionEndTime(shot, words);
    if (manualEndTime === undefined) return shot;
    const bounded = audioDuration > 0 ? Math.min(audioDuration, manualEndTime) : manualEndTime;
    manualEnds.set(idx, bounded);
    return { ...shot, endTime: bounded } as T;
  });

  // Force next shot's startTime to the manual endTime of the previous shot
  const withForcedStarts: T[] = propagated.map((shot, idx) => {
    const prevManualEnd = manualEnds.get(idx - 1);
    if (prevManualEnd === undefined) return shot;
    if (shot.startTime === null) return shot;
    if (Math.abs((shot.startTime ?? 0) - prevManualEnd) < 1e-6) return shot;
    return { ...shot, startTime: prevManualEnd } as T;
  });

  // Pass 3: re-derive endTimes so downstream shots stay coherent with the new startTimes
  const reDerived = recalculateWhisperShotEndTimes(withForcedStarts, audioDuration);

  // Re-apply manual endTimes (they remain authoritative)
  return reDerived.map((shot, idx) => {
    const manualEnd = manualEnds.get(idx);
    if (manualEnd === undefined) return shot;
    return { ...shot, endTime: manualEnd } as T;
  });
}