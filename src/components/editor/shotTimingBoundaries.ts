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

  for (const timepoint of validTimepoints) {
    const start = toFiniteTime(timepoint.timeSeconds);
    if (start !== undefined) {
      timepointMap.set(timepoint.shotId, start);
    }
  }

  // Règle d'affichage timeline / XML :
  //  - Le début de chaque shot = son timeSeconds (peut être ajusté manuellement).
  //  - La fin de chaque shot = début du shot suivant (ou durée audio totale pour le dernier).
  //  - manualEndTimeSeconds n'affecte PAS la durée d'affichage : il marque seulement
  //    la fin réelle de la parole. Pendant le silence éventuel entre la fin de parole
  //    et le shot suivant, l'image du shot courant reste affichée.
  const resolvedStarts: number[] = [];
  for (const shotId of orderedShotIds) {
    const rawStart = timepointMap.get(shotId);
    if (rawStart === undefined) {
      return null;
    }
    resolvedStarts.push(Math.min(rawStart, boundedAudioDuration));
  }

  const boundaries: ShotTimingBoundary[] = [];
  for (let index = 0; index < orderedShotIds.length; index += 1) {
    const shotId = orderedShotIds[index];
    const start = resolvedStarts[index];
    const nextStart = index < orderedShotIds.length - 1 ? resolvedStarts[index + 1] : undefined;
    const end = Math.min(nextStart ?? boundedAudioDuration, boundedAudioDuration);

    boundaries.push({
      shotId,
      start,
      end,
      duration: end - start,
    });
  }

  return boundaries;
}
