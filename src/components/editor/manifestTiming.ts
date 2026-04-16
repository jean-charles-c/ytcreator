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
import { resolveShotTimingBoundaries } from "./shotTimingBoundaries";

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
  sceneOrder?: number;
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

function inferNearbySceneOrder(
  targetShotId: string,
  timepoints: ShotTimepoint[] | null | undefined,
  shotToScene: Map<string, number>
): number | undefined {
  const tpList = timepoints ?? [];
  const idx = tpList.findIndex((tp) => tp.shotId === targetShotId);

  if (idx < 0) return undefined;

  for (let delta = 1; delta <= 3; delta++) {
    const prev = idx - delta >= 0 ? tpList[idx - delta] : null;
    const next = idx + delta < tpList.length ? tpList[idx + delta] : null;

    if (prev && shotToScene.has(prev.shotId)) {
      return shotToScene.get(prev.shotId);
    }

    if (next && shotToScene.has(next.shotId)) {
      return shotToScene.get(next.shotId);
    }
  }

  return undefined;
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
  const shotToScene = new Map(activeShots.map((item) => [item.shot.shotId, item.sceneOrder]));

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
    const sceneOrder = shotToScene.get(shotId);

    pushUniqueIssue(issues, {
      level: "error",
      order: shotOrder,
      shotId,
      sceneOrder,
      message: `Le shot ${shotOrder > 0 ? shotOrder : "?"} n'a pas de marqueur audio.`,
    });
  }

  for (const shotId of validation.unexpectedIds) {
    const sceneOrder = inferNearbySceneOrder(shotId, timepoints, shotToScene);

    pushUniqueIssue(issues, {
      level: "error",
      order: 0,
      shotId,
      sceneOrder,
      message: `L'audio contient un marqueur vers un shot supprimé (${shotId.slice(0, 8)}…).`,
    });
  }

  for (const shotId of validation.placeholderIds) {
    const sceneOrder = inferNearbySceneOrder(shotId, timepoints, shotToScene);

    pushUniqueIssue(issues, {
      level: "error",
      order: 0,
      shotId,
      sceneOrder,
      message: `Marqueur fantôme détecté dans l'audio.`,
    });
  }

  for (const shotId of validation.duplicateIds) {
    const shotOrder = orderMap.get(shotId) ?? 0;
    const sceneOrder = shotToScene.get(shotId);

    pushUniqueIssue(issues, {
      level: "error",
      order: shotOrder,
      shotId,
      sceneOrder,
      message: `Le shot ${shotOrder > 0 ? shotOrder : "?"} possède plusieurs marqueurs audio concurrents.`,
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
      totalDuration: audioDuration,
      issues,
      builtAt: new Date().toISOString(),
    };
  }

  const exactAudioDuration = audioDuration;
  const resolvedBoundaries = resolveShotTimingBoundaries(expectedShotIds, timepoints ?? null, exactAudioDuration);

  if (!resolvedBoundaries) {
    pushUniqueIssue(issues, {
      level: "error",
      order: 0,
      shotId: "__manifest__",
      message: "Impossible de résoudre les bornes exactes du manifest timing.",
    });

    return {
      entries: [],
      totalDuration: exactAudioDuration,
      issues,
      builtAt: new Date().toISOString(),
    };
  }

  const entries: ManifestTimingEntry[] = activeShots.map((item, idx) => {
    const order = idx + 1;
    const resolvedBoundary = resolvedBoundaries[idx];
    const start = resolvedBoundary.start;
    const duration = resolvedBoundary.duration;

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
    totalDuration: exactAudioDuration,
    issues,
    builtAt: new Date().toISOString(),
  };
}
