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

  const boundaries: ShotTimingBoundary[] = [];

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

    const nextShotId = index < orderedShotIds.length - 1 ? orderedShotIds[index + 1] : null;
    const rawEnd = manualEndMap.get(shotId)
      ?? (nextShotId ? timepointMap.get(nextShotId) : boundedAudioDuration);

    if (rawEnd === undefined) {
      return null;
    }

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