export interface ExactShotTimepointLike {
  shotId: string;
  shotIndex: number;
  timeSeconds: number;
}

export interface ExactShotSentenceLike {
  id: string;
  text: string;
}

export interface ExactSyncValidationResult {
  ok: boolean;
  errors: string[];
  placeholderIds: string[];
  missingIds: string[];
  unexpectedIds: string[];
  duplicateIds: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function getDuplicateIds(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates];
}

export function validateExactAlignedShotSentences(
  expectedShotIds: string[],
  alignedShotSentences: ExactShotSentenceLike[] | null | undefined
): ExactSyncValidationResult {
  const entries = alignedShotSentences ?? [];
  const actualIds = entries.map((entry) => entry.id);
  const placeholderIds = actualIds.filter((id) => id.startsWith("_missing_"));
  const duplicateIds = getDuplicateIds(actualIds);
  const actualIdSet = new Set(actualIds.filter((id) => !id.startsWith("_missing_")));
  const expectedIdSet = new Set(expectedShotIds);
  const missingIds = expectedShotIds.filter((id) => !actualIdSet.has(id));
  const unexpectedIds = actualIds.filter((id) => !id.startsWith("_missing_") && !expectedIdSet.has(id));

  const errors: string[] = [];

  if (entries.length === 0) {
    errors.push("Aucun shot synchronisable n’a été préparé pour la génération audio.");
  }

  if (placeholderIds.length > 0) {
    errors.push(`${placeholderIds.length} fragment(s) orphelin(s) ont été détecté(s) dans le script VO. Le script n’est plus aligné avec les shots courants : régénérez d’abord les shots de la scène signalée dans Contrôle qualité, recollez le script généré, puis relancez la voix off.`);
  }

  if (duplicateIds.length > 0) {
    errors.push(`Des shotIds sont dupliqués dans la synchro VO (${duplicateIds.length}).`);
  }

  if (missingIds.length > 0) {
    errors.push(`${missingIds.length} shot(s) de la base n’ont pas de correspondance exacte dans le script VO.`);
  }

  if (unexpectedIds.length > 0) {
    errors.push(`${unexpectedIds.length} shot(s) inconnus ont été trouvés dans la synchro VO.`);
  }

  const orderedActualIds = actualIds.filter((id) => !id.startsWith("_missing_"));
  if (
    orderedActualIds.length === expectedShotIds.length &&
    orderedActualIds.some((id, index) => id !== expectedShotIds[index])
  ) {
    errors.push("L’ordre des shotIds envoyés au moteur audio ne correspond plus à l’ordre courant des shots.");
  }

  if (entries.some((entry) => entry.text.trim().length === 0)) {
    errors.push("Au moins un shot de la synchro VO est vide.");
  }

  return {
    ok: errors.length === 0,
    errors,
    placeholderIds: unique(placeholderIds),
    missingIds: unique(missingIds),
    unexpectedIds: unique(unexpectedIds),
    duplicateIds: unique(duplicateIds),
  };
}

export function validateExactShotTimepoints(
  expectedShotIds: string[],
  timepoints: ExactShotTimepointLike[] | null | undefined
): ExactSyncValidationResult {
  const entries = timepoints ?? [];
  const actualIds = entries.map((entry) => entry.shotId);
  const placeholderIds = actualIds.filter((id) => id.startsWith("_missing_"));
  const realEntries = entries.filter((entry) => !entry.shotId.startsWith("_missing_"));
  const realIds = realEntries.map((entry) => entry.shotId);
  const duplicateIds = getDuplicateIds(realIds);
  const actualIdSet = new Set(realIds);
  const expectedIdSet = new Set(expectedShotIds);
  const missingIds = expectedShotIds.filter((id) => !actualIdSet.has(id));
  const unexpectedIds = realIds.filter((id) => !expectedIdSet.has(id));

  const errors: string[] = [];

  if (entries.length === 0) {
    errors.push("Aucun shot_timepoint n’est disponible pour cet audio.");
  }

  if (placeholderIds.length > 0) {
    errors.push(`${placeholderIds.length} marqueur(s) fantôme(s) ont été détecté(s) dans shot_timepoints.`);
  }

  if (duplicateIds.length > 0) {
    errors.push(`Des shotIds sont dupliqués dans shot_timepoints (${duplicateIds.length}).`);
  }

  if (missingIds.length > 0) {
    errors.push(`${missingIds.length} shot(s) courants n’ont pas de timepoint exact.`);
  }

  if (unexpectedIds.length > 0) {
    errors.push(`${unexpectedIds.length} timepoint(s) référencent des shots supprimés ou obsolètes.`);
  }

  const timepointMap = new Map(realEntries.map((entry) => [entry.shotId, entry.timeSeconds]));
  let previousTime = -Infinity;
  for (const shotId of expectedShotIds) {
    const time = timepointMap.get(shotId);
    if (time === undefined) continue;
    if (!Number.isFinite(time) || time < 0) {
      errors.push(`Le timepoint du shot ${shotId.slice(0, 8)} est invalide.`);
      continue;
    }
    if (time < previousTime) {
      errors.push("L’ordre temporel des timepoints ne correspond plus à l’ordre courant des shots.");
      break;
    }
    previousTime = time;
  }

  return {
    ok: errors.length === 0,
    errors,
    placeholderIds: unique(placeholderIds),
    missingIds: unique(missingIds),
    unexpectedIds: unique(unexpectedIds),
    duplicateIds: unique(duplicateIds),
  };
}
