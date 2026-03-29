/**
 * QA Validation Engine — structural, timing, allocation, redundancy and length checks.
 *
 * Levels:
 *  - "critical" → blocks export
 *  - "warning"  → displayed but does not block
 */

import type { VisualPromptManifest } from "./visualPromptTypes";
import type { ManifestTiming } from "./manifestTiming";
import { validateAllocation } from "./shotAllocationValidator";
import { analyzeRedundancy } from "./visualRedundancyDetector";

// ── Types ──────────────────────────────────────────────────────────

export type QaLevel = "critical" | "warning";
export type QaCategory = "structure" | "timing" | "allocation" | "redundancy" | "length";

export interface QaIssue {
  level: QaLevel;
  category: QaCategory;
  sceneOrder?: number;
  shotOrder?: number;
  /** DB shot id — used for force-override to update source_sentence */
  shotId?: string;
  /** DB scene id — used for force-override context */
  sceneId?: string;
  message: string;
  /** Expected text (from source script) for comparison */
  expectedText?: string;
  /** Actual text found in the shot */
  actualText?: string;
}

export interface QaReport {
  issues: QaIssue[];
  criticalCount: number;
  warningCount: number;
  /** True if no critical issues */
  exportAllowed: boolean;
  checkedAt: string;
  /** Per-scene allocation summaries */
  allocationSummaries: AllocationSummary[];
}

export interface AllocationSummary {
  sceneOrder: number;
  sceneTitle: string;
  coveragePercent: number;
  gapCount: number;
  valid: boolean;
}

// ── Constants ─────────────────────────────────────────────────────

const MIN_CHARS_SOFT = 40;
const MAX_CHARS_SOFT = 120;
const MAX_CHARS_HARD = 180;
const SHOT_SPLIT_THRESHOLD = 100;

// ── Structure checks ──────────────────────────────────────────────

function checkStructure(manifest: VisualPromptManifest): QaIssue[] {
  const issues: QaIssue[] = [];

  for (const scene of manifest.scenes) {
    const activeShots = scene.shots.filter((s) => s.status === "active");

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

    for (const frag of scene.fragments) {
      if (!activeShotIds.has(frag.shotId)) {
        issues.push({
          level: "critical",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          message: `Un fragment orphelin référence un shot supprimé ou fusionné. Régénérez les shots de la scène ${scene.sceneOrder} pour corriger le mapping.`,
          actualText: frag.text.trim().slice(0, 150),
        });
      }
    }

    const fragmentShotIds = new Set(scene.fragments.map((f) => f.shotId));
    for (const shot of activeShots) {
      if (shot.fragmentIds.length === 0 || !shot.fragmentIds.some((fid) => scene.fragments.some((f) => f.fragmentId === fid))) {
        issues.push({
          level: "critical",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          shotOrder: shot.globalOrder,
          message: `Shot ${shot.globalOrder} (scène ${scene.sceneOrder}) n'a aucun fragment de texte associé.`,
          expectedText: `(fragment attendu du texte source de la scène)`,
          actualText: `(aucun fragment rattaché au shot)`,
        });
      }
    }

    for (let i = 1; i < activeShots.length; i++) {
      if (activeShots[i].localOrder <= activeShots[i - 1].localOrder) {
        issues.push({
          level: "warning",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          message: `Ordre des shots incohérent dans la scène ${scene.sceneOrder}`,
        });
      }
    }

    // Text order check
    const sceneTextLower = scene.sceneText.toLowerCase().replace(/\s+/g, " ").trim();
    const shotTextPositions: { globalOrder: number; localOrder: number; position: number; text: string }[] = [];
    for (const shot of activeShots) {
      const frag = scene.fragments.find(f => f.shotId === shot.shotId);
      if (!frag) continue;
      const fragLower = frag.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (!fragLower) continue;
      const pos = sceneTextLower.indexOf(fragLower);
      shotTextPositions.push({ globalOrder: shot.globalOrder, localOrder: shot.localOrder, position: pos, text: frag.text.trim() });
    }
    const byLocalOrder = [...shotTextPositions].sort((a, b) => a.localOrder - b.localOrder);
    for (let i = 1; i < byLocalOrder.length; i++) {
      if (byLocalOrder[i].position >= 0 && byLocalOrder[i - 1].position >= 0 &&
          byLocalOrder[i].position < byLocalOrder[i - 1].position) {
        issues.push({
          level: "critical",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          message: `Scène ${scene.sceneOrder} : shots ${byLocalOrder[i - 1].globalOrder} et ${byLocalOrder[i].globalOrder} inversés par rapport au texte source.`,
          expectedText: `Shot ${byLocalOrder[i - 1].globalOrder} devrait précéder Shot ${byLocalOrder[i].globalOrder} dans le texte source`,
          actualText: `Shot ${byLocalOrder[i - 1].globalOrder}: « ${byLocalOrder[i - 1].text.slice(0, 80)} »\nShot ${byLocalOrder[i].globalOrder}: « ${byLocalOrder[i].text.slice(0, 80)} »`,
        });
        break;
      }
    }

    // Duplicate detection within shot
    for (const frag of scene.fragments) {
      const fragText = frag.text.trim();
      if (!fragText) continue;
      const sentences = fragText.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length >= 2) {
        const sentenceSet = new Set<string>();
        for (const s of sentences) {
          const ns = s.trim().toLowerCase();
          if (ns.length < 5) continue;
          if (sentenceSet.has(ns)) {
            const shot = scene.shots.find(s => s.shotId === frag.shotId);
            issues.push({
              level: "critical",
              category: "structure",
              sceneOrder: scene.sceneOrder,
              shotOrder: shot?.globalOrder,
              message: `Phrase répétée dans le shot ${shot?.globalOrder ?? "?"} : « ${ns.slice(0, 60)}… »`,
              actualText: fragText.slice(0, 200),
            });
            break;
          }
          sentenceSet.add(ns);
        }
      }
    }

    // Duplicate across shots
    const fragTexts = scene.fragments.map(f => f.text.replace(/\s+/g, " ").trim().toLowerCase());
    const seen = new Set<string>();
    for (const ft of fragTexts) {
      if (!ft) continue;
      if (seen.has(ft)) {
        issues.push({
          level: "critical",
          category: "structure",
          sceneOrder: scene.sceneOrder,
          message: `Phrase dupliquée entre shots dans scène ${scene.sceneOrder} : « ${ft.slice(0, 60)}… »`,
        });
        break;
      }
      seen.add(ft);
    }
  }

  return issues;
}

// ── Allocation checks ─────────────────────────────────────────────

function checkAllocation(manifest: VisualPromptManifest): { issues: QaIssue[]; summaries: AllocationSummary[] } {
  const issues: QaIssue[] = [];
  const summaries: AllocationSummary[] = [];

  for (const scene of manifest.scenes) {
    const activeShots = scene.shots.filter((s) => s.status === "active");
    if (activeShots.length === 0) continue;

    const sortedFragments = scene.fragments
      .filter(f => activeShots.some(s => s.shotId === f.shotId))
      .sort((a, b) => a.order - b.order);
    const fragments = sortedFragments.map(f => f.text);

    const report = validateAllocation(scene.sceneText, fragments);

    summaries.push({
      sceneOrder: scene.sceneOrder,
      sceneTitle: scene.title,
      coveragePercent: report.coveragePercent,
      gapCount: report.gaps.length,
      valid: report.valid,
    });

    for (const issue of report.issues) {
      if (issue.type === "overlap" || issue.type === "duplicate" || issue.type === "orphan") {
        const shotFrag = fragments[issue.shotIndex] ?? "";
        const linkedFragment = sortedFragments[issue.shotIndex];
        const linkedShotId = linkedFragment?.shotId;
        
        // Find what text the scene expects at this shot's position
        let expectedAtPosition = "";
        if (issue.type === "orphan" && report.coveredRanges.length > 0) {
          const normalizedScene = scene.sceneText.trim().replace(/\s+/g, " ").toLowerCase();
          const sorted = [...report.coveredRanges].sort((a, b) => a.start - b.start);
          
          const prevRange = sorted.filter(r => r.shotIndex < issue.shotIndex).pop();
          const nextRange = sorted.find(r => r.shotIndex > issue.shotIndex);
          const gapStart = prevRange ? prevRange.end : 0;
          const gapEnd = nextRange ? nextRange.start : normalizedScene.length;
          
          if (gapEnd > gapStart) {
            expectedAtPosition = normalizedScene.slice(gapStart, Math.min(gapEnd, gapStart + 200)).trim();
          }
        }
        
        issues.push({
          level: "critical",
          category: "allocation",
          sceneOrder: scene.sceneOrder,
          shotOrder: issue.shotIndex + 1,
          shotId: linkedShotId,
          sceneId: scene.sceneId,
          message: `Le texte du shot ne correspond pas au texte source de la scène.`,
          expectedText: expectedAtPosition ? expectedAtPosition.slice(0, 200) : "(position non déterminée dans le texte source)",
          actualText: shotFrag.trim().slice(0, 200) || "(vide)",
        });
      } else if (issue.type === "gap") {
        issues.push({
          level: "warning",
          category: "allocation",
          sceneOrder: scene.sceneOrder,
          message: `Texte non couvert dans scène ${scene.sceneOrder} : « ${report.gaps[0]?.slice(0, 50) ?? ""}… »`,
        });
      }
    }

    if (report.coveragePercent < 80) {
      issues.push({
        level: "warning",
        category: "allocation",
        sceneOrder: scene.sceneOrder,
        message: `Couverture textuelle faible : ${report.coveragePercent}% dans scène ${scene.sceneOrder}`,
      });
    }
  }

  return { issues, summaries };
}

// ── Redundancy checks ─────────────────────────────────────────────

function checkRedundancy(manifest: VisualPromptManifest): QaIssue[] {
  const issues: QaIssue[] = [];

  for (const scene of manifest.scenes) {
    const activeShots = scene.shots.filter((s) => s.status === "active");
    if (activeShots.length <= 1) continue;

    const shotsForAnalysis = activeShots.map(s => ({
      shot_type: s.shotType,
      description: s.description,
      prompt_export: scene.fragments.find(f => f.shotId === s.shotId)?.text ?? null,
    }));

    const report = analyzeRedundancy(scene.sceneId, shotsForAnalysis);

    for (const ri of report.issues) {
      if (ri.severity === "high") {
        issues.push({
          level: "warning",
          category: "redundancy",
          sceneOrder: scene.sceneOrder,
          message: `Redundance visuelle élevée (shots ${ri.shotIndexA + 1}–${ri.shotIndexB + 1}) : ${ri.detail}`,
        });
      }
    }

    if (report.diversityScore < 50) {
      issues.push({
        level: "warning",
        category: "redundancy",
        sceneOrder: scene.sceneOrder,
        message: `Score de diversité faible (${report.diversityScore}%) dans scène ${scene.sceneOrder}`,
      });
    }
  }

  return issues;
}

// ── Length / exception checks ─────────────────────────────────────

function checkLength(manifest: VisualPromptManifest): QaIssue[] {
  const issues: QaIssue[] = [];

  for (const scene of manifest.scenes) {
    for (const frag of scene.fragments) {
      const len = frag.text.trim().length;
      if (len === 0) continue;

      const shot = scene.shots.find(s => s.shotId === frag.shotId);

      if (len > MAX_CHARS_HARD) {
        issues.push({
          level: "warning",
          category: "length",
          sceneOrder: scene.sceneOrder,
          shotOrder: shot?.globalOrder,
          message: `Fragment trop long (${len} car.) dans scène ${scene.sceneOrder} — envisagez de re-segmenter`,
        });
      } else if (len > SHOT_SPLIT_THRESHOLD) {
        // Fragment exceeds the 100-char shot threshold — should have been split into multiple shots
        const expectedShots = Math.ceil(len / SHOT_SPLIT_THRESHOLD);
        issues.push({
          level: "warning",
          category: "length",
          sceneOrder: scene.sceneOrder,
          shotOrder: shot?.globalOrder,
          message: `Fragment non découpé (${len} car. > ${SHOT_SPLIT_THRESHOLD}) dans scène ${scene.sceneOrder}, shot ${shot?.globalOrder ?? "?"} — devrait produire ${expectedShots} shots. Régénérez les shots de cette scène.`,
        });
      } else if (len < MIN_CHARS_SOFT && scene.fragments.length > 1) {
        issues.push({
          level: "warning",
          category: "length",
          sceneOrder: scene.sceneOrder,
          shotOrder: shot?.globalOrder,
          message: `Fragment court (${len} car.) dans scène ${scene.sceneOrder} — exception possible si unité de sens complète`,
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

  for (const ti of timing.issues) {
    issues.push({
      level: ti.level === "error" ? "critical" : "warning",
      category: "timing",
      sceneOrder: ti.sceneOrder,
      shotOrder: ti.order > 0 ? ti.order : undefined,
      message: ti.message,
    });
  }

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

  if (timing.entries.length > 0 && timing.totalDuration > 0) {
    const lastEntry = timing.entries[timing.entries.length - 1];
    const lastEnd = lastEntry.start + lastEntry.duration;
    const coverage = Math.round((lastEnd / timing.totalDuration) * 100);
    if (coverage < 90) {
      issues.push({
        level: "warning",
        category: "timing",
        message: `Couverture temporelle : ${coverage}% (${lastEnd.toFixed(1)}s / ${timing.totalDuration.toFixed(1)}s)`,
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
  const { issues: allocationIssues, summaries } = checkAllocation(manifest);
  const redundancyIssues = checkRedundancy(manifest);
  const lengthIssues = checkLength(manifest);
  const timingIssues = checkTiming(timing);

  const issues = [...structureIssues, ...allocationIssues, ...redundancyIssues, ...lengthIssues, ...timingIssues];

  const criticalCount = issues.filter((i) => i.level === "critical").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;

  return {
    issues,
    criticalCount,
    warningCount,
    exportAllowed: criticalCount === 0,
    checkedAt: new Date().toISOString(),
    allocationSummaries: summaries,
  };
}
