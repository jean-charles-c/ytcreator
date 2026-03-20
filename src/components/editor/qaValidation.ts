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

    // Check shot text order vs scene text position (compare DB shot_order against text position)
    const sceneTextLower = scene.sceneText.toLowerCase().replace(/\s+/g, " ").trim();
    const shotTextPositions: { shotId: string; globalOrder: number; localOrder: number; position: number }[] = [];
    for (const shot of activeShots) {
      // Find the fragment text for this shot
      const frag = scene.fragments.find(f => f.shotId === shot.shotId);
      if (!frag) continue;
      const fragLower = frag.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (fragLower.length === 0) continue;
      const pos = sceneTextLower.indexOf(fragLower);
      shotTextPositions.push({ shotId: shot.shotId, globalOrder: shot.globalOrder, localOrder: shot.localOrder, position: pos });
    }
    // Sort by DB localOrder and check if text positions are consistent
    const byLocalOrder = [...shotTextPositions].sort((a, b) => a.localOrder - b.localOrder);
    for (let i = 1; i < byLocalOrder.length; i++) {
      if (byLocalOrder[i].position >= 0 && byLocalOrder[i - 1].position >= 0 &&
          byLocalOrder[i].position < byLocalOrder[i - 1].position) {
        issues.push({
          level: "critical",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          message: `Scène ${scene.sceneOrder} : les shots ${byLocalOrder[i - 1].globalOrder} et ${byLocalOrder[i].globalOrder} sont inversés par rapport à l'ordre du texte source (shot_order DB incorrect). Régénérez les shots de cette scène.`,
        });
        break;
      }
    }

    // Detect duplicate/repeated text within a single shot's source_sentence
    for (const frag of scene.fragments) {
      const fragText = frag.text.trim();
      if (fragText.length === 0) continue;
      // Split into sentences and look for exact repetitions
      const sentences = fragText.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length >= 2) {
        const normalized = sentences.map(s => s.trim().toLowerCase());
        const sentenceSet = new Set<string>();
        for (const ns of normalized) {
          if (ns.length < 5) continue;
          if (sentenceSet.has(ns)) {
            const shot = scene.shots.find(s => s.shotId === frag.shotId);
            issues.push({
              level: "critical",
              category: "structure",
              sceneOrder: scene.sceneOrder,
              shotOrder: shot?.globalOrder,
              message: `Scène ${scene.sceneOrder} : une phrase est répétée dans le shot ${shot?.globalOrder ?? "?"} (« ${ns.slice(0, 60)}… »). Régénérez les shots de cette scène.`,
            });
            break;
          }
          sentenceSet.add(ns);
        }
      }
    }

    // Detect duplicate source_sentence across multiple shots in same scene
    const fragTexts = scene.fragments.map(f => f.text.replace(/\s+/g, " ").trim().toLowerCase());
    const seen = new Set<string>();
    for (const ft of fragTexts) {
      if (ft.length === 0) continue;
      if (seen.has(ft)) {
        issues.push({
          level: "critical",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          message: `Scène ${scene.sceneOrder} : une phrase est dupliquée entre plusieurs shots (« ${ft.slice(0, 60)}… »). Régénérez les shots de cette scène.`,
        });
        break;
      }
      seen.add(ft);
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
