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
 *  - Timepoints matched by shotId (no fuzzy)
 *  - _missing_ timepoints are filtered out
 *  - Gaps/overlaps are detected as issues
 */

import type { VisualPromptManifest, NormalisedShot } from "./visualPromptTypes";
import type { ShotTimepoint } from "./timelineAssembly";

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

// ── Builder ────────────────────────────────────────────────────────

const DEFAULT_SEGMENT_DURATION = 4;

/**
 * Build a ManifestTiming from a VisualPromptManifest + audio data.
 *
 * Strategy (in priority order):
 *  1. If timepoints exist and match shotIds → use exact timestamps
 *  2. If audio duration known → proportional by char count
 *  3. Fallback → 4s per shot
 */
export function buildManifestTiming(
  manifest: VisualPromptManifest,
  timepoints: ShotTimepoint[] | null | undefined,
  audioDuration: number
): ManifestTiming {
  const issues: ManifestTimingIssue[] = [];

  // Collect all active shots in manifest order
  const activeShots: { shot: NormalisedShot; fragmentText: string; sceneOrder: number }[] = [];
  for (const scene of manifest.scenes) {
    for (const shot of scene.shots) {
      if (shot.status !== "active") continue;
      const fragTexts = shot.fragmentIds
        .map((fid) => scene.fragments.find((f) => f.fragmentId === fid)?.text ?? "")
        .filter(Boolean);
      activeShots.push({
        shot,
        fragmentText: fragTexts.join(" "),
        sceneOrder: scene.sceneOrder,
      });
    }
  }

  // Filter real timepoints (no _missing_)
  const realTimepoints = (timepoints ?? []).filter((tp) => !tp.shotId.startsWith("_missing_"));
  const timepointMap = new Map<string, number>();
  for (const tp of realTimepoints) {
    timepointMap.set(tp.shotId, tp.timeSeconds);
  }

  // Check how many shots have a matching timepoint
  const matchCount = activeShots.filter((s) => timepointMap.has(s.shot.shotId)).length;
  const useTimepoints = matchCount > 0 && matchCount >= activeShots.length * 0.5;
  const useProportional = !useTimepoints && audioDuration > 0;

  // For proportional: total chars
  const totalChars = useProportional
    ? activeShots.reduce((sum, s) => sum + Math.max(s.fragmentText.length, 10), 0)
    : 0;

  let currentTime = 0;

  // Pre-compute rounded starts for all shots to ensure perfect continuity
  const roundedStarts: number[] = activeShots.map((item) => {
    if (useTimepoints) {
      const tp = timepointMap.get(item.shot.shotId);
      if (tp !== undefined && Number.isFinite(tp) && tp >= 0) {
        return Math.round(tp * 100) / 100;
      }
    }
    return -1; // placeholder, will be resolved below
  });

  // Fill in missing starts sequentially
  for (let i = 0; i < roundedStarts.length; i++) {
    if (roundedStarts[i] < 0) {
      roundedStarts[i] = i === 0 ? 0 : roundedStarts[i - 1];
    }
  }

  const entries: ManifestTimingEntry[] = activeShots.map((item, idx) => {
    const order = idx + 1;
    let start: number;
    let duration: number;
    let source: ManifestTimingEntry["source"];

    if (useTimepoints) {
      const tp = timepointMap.get(item.shot.shotId);
      if (tp !== undefined && Number.isFinite(tp) && tp >= 0) {
        start = roundedStarts[idx];
        source = "timepoint";
      } else {
        start = roundedStarts[idx];
        source = "proportional";
        issues.push({
          level: "warning",
          order,
          shotId: item.shot.shotId,
          message: `No timepoint found for shot — using accumulated time`,
        });
      }

      // Duration = next shot's rounded start - this rounded start (ensures no micro-gaps)
      if (idx < activeShots.length - 1) {
        duration = roundedStarts[idx + 1] - start;
        if (duration <= 0) {
          // Fallback for edge case
          const charWeight = Math.max(item.fragmentText.length, 10);
          duration = audioDuration > 0
            ? Math.round((charWeight / Math.max(totalChars, 1)) * audioDuration * 100) / 100
            : DEFAULT_SEGMENT_DURATION;
        }
      } else {
        duration = audioDuration > 0
          ? Math.round((audioDuration - start) * 100) / 100
          : DEFAULT_SEGMENT_DURATION;
      }

      duration = Math.max(0.1, duration);
    } else if (useProportional) {
      start = Math.round(currentTime * 100) / 100;
      const charWeight = Math.max(item.fragmentText.length, 10);
      duration = Math.round((charWeight / totalChars) * audioDuration * 100) / 100;
      source = "proportional";
    } else {
      start = Math.round(currentTime * 100) / 100;
      duration = DEFAULT_SEGMENT_DURATION;
      source = "fixed";
    }

    currentTime = start + duration;

    return {
      shotId: item.shot.shotId,
      sceneId: item.shot.sceneId,
      sceneOrder: item.sceneOrder,
      fragmentText: item.fragmentText,
      order,
      audioSegmentKey: item.shot.shotId,
      start,
      duration,
      source,
    };
  });

  // Validate continuity
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    const expectedStart = Math.round((prev.start + prev.duration) * 100) / 100;
    const gap = Math.round((curr.start - expectedStart) * 100) / 100;

    if (gap > 0.5) {
      issues.push({
        level: "warning",
        order: curr.order,
        shotId: curr.shotId,
        message: `Gap of ${gap}s detected before this shot`,
      });
    } else if (gap < -0.1) {
      issues.push({
        level: "error",
        order: curr.order,
        shotId: curr.shotId,
        message: `Overlap of ${Math.abs(gap)}s detected with previous shot`,
      });
    }
  }

  const totalDuration = audioDuration > 0
    ? audioDuration
    : entries.length > 0
      ? entries[entries.length - 1].start + entries[entries.length - 1].duration
      : 0;

  return {
    entries,
    totalDuration,
    issues,
    builtAt: new Date().toISOString(),
  };
}
