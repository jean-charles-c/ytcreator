export interface WhisperAlignmentTimingLike {
  startTime: number | null;
  endTime: number | null;
}

export function recalculateWhisperShotEndTimes<T extends WhisperAlignmentTimingLike>(
  shots: readonly T[],
  audioDuration: number
): T[] {
  const fallbackEnd = audioDuration > 0 ? audioDuration : null;

  return shots.map((shot, index) => {
    if (shot.startTime === null) {
      return {
        ...shot,
        endTime: null,
      } as T;
    }

    let nextStart: number | null = fallbackEnd;

    for (let nextIndex = index + 1; nextIndex < shots.length; nextIndex += 1) {
      const candidateStart = shots[nextIndex].startTime;
      if (candidateStart !== null) {
        nextStart = candidateStart;
        break;
      }
    }

    return {
      ...shot,
      endTime: nextStart,
    } as T;
  });
}