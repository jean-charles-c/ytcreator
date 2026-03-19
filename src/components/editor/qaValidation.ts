/**
 * QA Validation Engine — structural and timing checks before export.
 *
 * Levels:
 *  - "critical" → blocks export
 *  - "warning"  → displayed but does not block
 */

import type { VisualPromptManifest } from "./visualPromptTypes";
import type { ManifestTiming, ManifestTimingEntry } from "./manifestTiming";

// ── Types ──────────────────────────────────────────────────────────

export type QaLevel = "critical" | "warning";

export interface QaIssue {
  level: QaLevel;
  category: "structure" | "timing";
  sceneOrder?: number;
  shotOrder?: number;
  message: string;
}

export interface QaReport {
  issues: QaIssue[];
  criticalCount: number;
  warningCount: number;
  /** True if no critical issues */
  exportAllowed: boolean;
  checkedAt: string;
}

// ── Structure checks ──────────────────────────────────────────────

function checkStructure(manifest: VisualPromptManifest): QaIssue[] {
  const issues: QaIssue[] = [];

  for (const scene of manifest.scenes) {
    const activeShots = scene.shots.filter((s) => s.status === "active");

    // Scene without active shot
    if (activeShots.length === 0) {
      issues.push({
        level: "critical",
        category: "structure",
        sceneOrder: scene.sceneOrder,
        message: `Scène ${scene.sceneOrder} « ${scene.title} » n'a aucun shot actif`,
      });
      continue;
    }

    const activeShotIds = new Set(activeShots.map((s) => s.shotId));

    // Fragment referencing a non-active shot
    for (const frag of scene.fragments) {
      if (!activeShotIds.has(frag.shotId)) {
        issues.push({
          level: "critical",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          message: `Un fragment orphelin référence un shot supprimé ou fusionné. Régénérez les shots de la scène ${scene.sceneOrder} pour corriger le mapping.`,
        });
      }
    }

    // Active shot without fragment
    const fragmentShotIds = new Set(scene.fragments.map((f) => f.shotId));
    for (const shot of activeShots) {
      if (shot.fragmentIds.length === 0 || !shot.fragmentIds.some((fid) => scene.fragments.some((f) => f.fragmentId === fid))) {
        issues.push({
          level: "critical",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          shotOrder: shot.globalOrder,
          message: `Shot ${shot.globalOrder} (scène ${scene.sceneOrder}) n'a aucun fragment de texte associé. Régénérez les shots de cette scène pour recréer le mapping.`,
        });
      }
    }

    // Broken order (localOrder should be strictly increasing within scene)
    for (let i = 1; i < activeShots.length; i++) {
      if (activeShots[i].localOrder <= activeShots[i - 1].localOrder) {
        issues.push({
          level: "warning",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          message: `Ordre des shots incohérent dans la scène ${scene.sceneOrder} (local_order ${activeShots[i].localOrder} ≤ ${activeShots[i - 1].localOrder})`,
        });
      }
    }
  }

  return issues;
}

// ── Timing checks ─────────────────────────────────────────────────

function checkTiming(timing: ManifestTiming | null): QaIssue[] {
  if (!timing) return [];

  const issues: QaIssue[] = [];

  // Gaps and overlaps already detected in manifestTiming issues
  for (const ti of timing.issues) {
    issues.push({
      level: ti.level === "error" ? "critical" : "warning",
      category: "timing",
      sceneOrder: ti.sceneOrder,
      shotOrder: ti.order > 0 ? ti.order : undefined,
      message: ti.message,
    });
  }

  // Check for zero-duration segments
  for (const entry of timing.entries) {
    if (entry.duration <= 0) {
      issues.push({
        level: "critical",
        category: "timing",
        sceneOrder: entry.sceneOrder,
        shotOrder: entry.order,
        message: `Durée nulle — deux shots partagent le même timestamp audio.`,
      });
    }
  }

  // Check total coverage vs total duration
  if (timing.entries.length > 0 && timing.totalDuration > 0) {
    const lastEntry = timing.entries[timing.entries.length - 1];
    const lastEnd = lastEntry.start + lastEntry.duration;
    const coverage = Math.round((lastEnd / timing.totalDuration) * 100);
    if (coverage < 90) {
      issues.push({
        level: "warning",
        category: "timing",
        message: `La couverture temporelle est de ${coverage}% (${lastEnd.toFixed(1)}s / ${timing.totalDuration.toFixed(1)}s)`,
      });
    }
  }

  return issues;
}

// ── Main ──────────────────────────────────────────────────────────

export function runQaValidation(
  manifest: VisualPromptManifest,
  timing: ManifestTiming | null
): QaReport {
  const structureIssues = checkStructure(manifest);
  const timingIssues = checkTiming(timing);
  const issues = [...structureIssues, ...timingIssues];

  const criticalCount = issues.filter((i) => i.level === "critical").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;

  return {
    issues,
    criticalCount,
    warningCount,
    exportAllowed: criticalCount === 0,
    checkedAt: new Date().toISOString(),
  };
}
