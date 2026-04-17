export interface ShotTimingBoundaryTimepointLike {
  shotId: string;
  timeSeconds: number;
  manualEndTimeSeconds?: number | null;
}

export interface ShotTimingBoundary {
  shotId: string;
  start: number;
  end: number;
  duration: number;
}

function toFiniteTime(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function resolveShotTimingBoundaries(
  orderedShotIds: readonly string[],
  timepoints: readonly ShotTimingBoundaryTimepointLike[] | null | undefined,
  audioDuration: number
): ShotTimingBoundary[] | null {
  if (orderedShotIds.length === 0) return [];

  const boundedAudioDuration = Number.isFinite(audioDuration) ? Math.max(0, audioDuration) : 0;
  const validTimepoints = (timepoints ?? []).filter((timepoint) => !timepoint.shotId.startsWith("_missing_"));

  if (validTimepoints.length === 0) return null;

  const timepointMap = new Map<string, number>();
  const manualEndMap = new Map<string, number>();

  for (const timepoint of validTimepoints) {
    const start = toFiniteTime(timepoint.timeSeconds);
    if (start !== undefined) {
      timepointMap.set(timepoint.shotId, start);
    }

    const manualEnd = toFiniteTime(timepoint.manualEndTimeSeconds);
    if (manualEnd !== undefined && manualEnd > 0) {
      manualEndMap.set(timepoint.shotId, manualEnd);
    }
  }

  // First pass: resolve each shot's start time.
  // Priority: explicit manualEndTimeSeconds of previous shot wins.
  // Otherwise the shot's own raw start (which may itself be manual via timeSeconds) is used.
  const resolvedStarts: number[] = [];
  for (let index = 0; index < orderedShotIds.length; index += 1) {
    const shotId = orderedShotIds[index];
    const rawStart = timepointMap.get(shotId);
    if (rawStart === undefined) {
      return null;
    }

    const previousShotId = index > 0 ? orderedShotIds[index - 1] : null;
    const previousManualEnd = previousShotId ? manualEndMap.get(previousShotId) : undefined;
    const start = previousManualEnd !== undefined
      ? Math.min(previousManualEnd, boundedAudioDuration)
      : rawStart;

    resolvedStarts.push(start);
  }

  // Second pass: derive each shot's end.
  // Priority order:
  //  1. The shot's own manualEndTimeSeconds (explicit user override)
  //  2. The next shot's resolved start (so a manual start on shot N+1 pulls back the end of shot N)
  //  3. The total audio duration (last shot)
  const boundaries: ShotTimingBoundary[] = [];
  for (let index = 0; index < orderedShotIds.length; index += 1) {
    const shotId = orderedShotIds[index];
    const start = resolvedStarts[index];
    const nextStart = index < orderedShotIds.length - 1 ? resolvedStarts[index + 1] : undefined;

    const rawEnd = manualEndMap.get(shotId)
      ?? nextStart
      ?? boundedAudioDuration;

    const end = Math.min(rawEnd, boundedAudioDuration);
    boundaries.push({
      shotId,
      start,
      end,
      duration: end - start,
    });
  }

  return boundaries;
}