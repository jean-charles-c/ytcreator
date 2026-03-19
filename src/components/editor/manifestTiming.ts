/**
 * Manifest Timing — single source of truth for shot ↔ audio synchronisation.
 *
 * Built from:
 *  1. The VisualPromptManifest (deterministic scene → fragment → shot mapping)
 *  2. The shot_timepoints stored alongside the selected VO audio file
 *  3. The total audio duration
 *
 * Rules:
 *  - Only active shots appear
 *  - Order follows manifest (scene_order → shot local_order)
 *  - Timepoints matched by shotId only
 *  - No proportional fallback
 *  - Any mismatch blocks the timing manifest
 */

import type { VisualPromptManifest, NormalisedShot } from "./visualPromptTypes";
import type { ShotTimepoint } from "./timelineAssembly";
import { validateExactShotTimepoints } from "./exactShotSync";

// ── Types ──────────────────────────────────────────────────────────

export interface ManifestTimingEntry {
  /** Shot DB id */
  shotId: string;
  /** Scene DB id */
  sceneId: string;
  /** Scene order number */
  sceneOrder: number;
  /** Fragment text(s) illustrated by this shot */
  fragmentText: string;
  /** Global sequential order (1-based) */
  order: number;
  /** Key to correlate with audio segment (= shotId) */
  audioSegmentKey: string;
  /** Start time in seconds on the audio track */
  start: number;
  /** Duration in seconds */
  duration: number;
  /** How start was resolved */
  source: "timepoint" | "proportional" | "fixed";
}

export interface ManifestTimingIssue {
  level: "error" | "warning";
  order: number;
  shotId: string;
  message: string;
}

export interface ManifestTiming {
  entries: ManifestTimingEntry[];
  totalDuration: number;
  issues: ManifestTimingIssue[];
  builtAt: string;
}

function pushUniqueIssue(
  issues: ManifestTimingIssue[],
  nextIssue: ManifestTimingIssue
) {
  const exists = issues.some(
    (issue) =>
      issue.order === nextIssue.order &&
      issue.shotId === nextIssue.shotId &&
      issue.message === nextIssue.message
  );
  if (!exists) {
    issues.push(nextIssue);
  }
}

/**
 * Build a ManifestTiming from a VisualPromptManifest + audio data.
 *
 * Strategy:
 *  1. Validate that every active shot has one exact timepoint
 *  2. Build start/duration only from exact timestamps
 *  3. Block the manifest if any mismatch exists
 */
export function buildManifestTiming(
  manifest: VisualPromptManifest,
  timepoints: ShotTimepoint[] | null | undefined,
  audioDuration: number
): ManifestTiming {
  const issues: ManifestTimingIssue[] = [];

  const activeShots: { shot: NormalisedShot; fragmentText: string; sceneOrder: number }[] = [];
  for (const scene of manifest.scenes) {
    for (const shot of scene.shots) {
      if (shot.status !== "active") continue;
      const fragTexts = shot.fragmentIds
        .map((fid) => scene.fragments.find((fragment) => fragment.fragmentId === fid)?.text ?? "")
        .filter(Boolean);
      activeShots.push({
        shot,
        fragmentText: fragTexts.join(" "),
        sceneOrder: scene.sceneOrder,
      });
    }
  }

  const expectedShotIds = activeShots.map((item) => item.shot.shotId);
  const orderMap = new Map(expectedShotIds.map((shotId, index) => [shotId, index + 1]));

  if (activeShots.length === 0) {
    return {
      entries: [],
      totalDuration: 0,
      issues,
      builtAt: new Date().toISOString(),
    };
  }

  if (!(audioDuration > 0)) {
    issues.push({
      level: "error",
      order: 0,
      shotId: "__audio__",
      message: "Aucun audio VO n'a été généré. Allez dans l'onglet Voice Over pour créer la narration audio.",
    });
    return {
      entries: [],
      totalDuration: 0,
      issues,
      builtAt: new Date().toISOString(),
    };
  }

  const validation = validateExactShotTimepoints(expectedShotIds, timepoints ?? null);
  for (const shotId of validation.missingIds) {
    const shotOrder = orderMap.get(shotId) ?? 0;
    pushUniqueIssue(issues, {
      level: "error",
      order: shotOrder,
      shotId,
      message: `Le shot ${shotOrder > 0 ? shotOrder : '?'} n'a pas de marqueur audio. Régénérez la voix off (Voice Over) pour resynchroniser.`,
    });
  }

  for (const shotId of validation.unexpectedIds) {
    pushUniqueIssue(issues, {
      level: "error",
      order: 0,
      shotId,
      message: `Un marqueur audio référence un shot supprimé (${shotId.slice(0, 8)}…). Régénérez la voix off pour nettoyer les données obsolètes.`,
    });
  }

  for (const shotId of validation.placeholderIds) {
    pushUniqueIssue(issues, {
      level: "error",
      order: 0,
      shotId,
      message: `Un marqueur fantôme a été détecté. Régénérez les shots de la scène concernée puis la voix off.`,
    });
  }

  for (const shotId of validation.duplicateIds) {
    const shotOrder = orderMap.get(shotId) ?? 0;
    pushUniqueIssue(issues, {
      level: "error",
      order: shotOrder,
      shotId,
      message: `Le shot ${shotOrder > 0 ? shotOrder : '?'} possède plusieurs marqueurs audio concurrents. Régénérez la voix off.`,
    });
  }

  if (!validation.ok && issues.length === 0) {
    for (const message of validation.errors) {
      pushUniqueIssue(issues, {
        level: "error",
        order: 0,
        shotId: "__manifest__",
        message,
      });
    }
  }

  if (!validation.ok) {
    return {
      entries: [],
      totalDuration: Math.round(audioDuration * 100) / 100,
      issues,
      builtAt: new Date().toISOString(),
    };
  }

  const realTimepoints = (timepoints ?? []).filter((tp) => !tp.shotId.startsWith("_missing_"));
  const timepointMap = new Map<string, number>(
    realTimepoints.map((tp) => [tp.shotId, tp.timeSeconds])
  );
  const roundedAudioDuration = Math.round(audioDuration * 100) / 100;

  const roundedStarts = activeShots.map((item) => {
    const start = timepointMap.get(item.shot.shotId);
    return Math.round((start ?? 0) * 100) / 100;
  });

  const entries: ManifestTimingEntry[] = activeShots.map((item, idx) => {
    const order = idx + 1;
    const start = roundedStarts[idx];
    const nextStart = idx < activeShots.length - 1 ? roundedStarts[idx + 1] : roundedAudioDuration;
    const duration = Math.round((nextStart - start) * 100) / 100;

    if (!(duration > 0)) {
      pushUniqueIssue(issues, {
        level: "error",
        order,
        shotId: item.shot.shotId,
        message: "Durée invalide détectée pour ce shot dans le manifest timing.",
      });
    }

    return {
      shotId: item.shot.shotId,
      sceneId: item.shot.sceneId,
      sceneOrder: item.sceneOrder,
      fragmentText: item.fragmentText,
      order,
      audioSegmentKey: item.shot.shotId,
      start,
      duration,
      source: "timepoint",
    };
  });

  return {
    entries,
    totalDuration: roundedAudioDuration,
    issues,
    builtAt: new Date().toISOString(),
  };
}
