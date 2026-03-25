/**
 * Normalised data model for VisualPrompt tab.
 *
 * Terminology
 * -----------
 * Scene    – narrative unit from the script (1 row in `scenes` table)
 * Fragment – exact portion of the scene's source_text illustrated by one shot
 * Shot     – visual asset linked to one or more fragments
 */

// ── Fragment ───────────────────────────────────────────────────────

export interface Fragment {
  /** Stable unique id (deterministic: `${sceneId}__frag_${order}`) */
  fragmentId: string;
  /** Parent scene id (from DB) */
  sceneId: string;
  /** Exact text slice illustrated by the linked shot */
  text: string;
  /** Reading order inside the scene (0-based) */
  order: number;
  /** Shot id that illustrates this fragment */
  shotId: string;
}

// ── Shot (normalised view) ─────────────────────────────────────────

export type ShotKind = "single" | "split" | "merged";
export type ShotStatus = "active" | "deleted";

export interface NormalisedShot {
  /** DB shot id */
  shotId: string;
  /** Parent scene id */
  sceneId: string;
  /** Fragment ids covered by this shot (1 for single/split, N for merged) */
  fragmentIds: string[];
  /** How this shot was created */
  kind: ShotKind;
  /** Lifecycle status */
  status: ShotStatus;
  /** Global sequential order (1-based, across all scenes) */
  globalOrder: number;
  /** Shot order inside its scene (from DB shot_order) */
  localOrder: number;
  /** Image URL if generated */
  imageUrl: string | null;
  /** Visual description / prompt */
  description: string;
  /** Camera / shot type */
  shotType: string;
}

// ── Scene (normalised view) ────────────────────────────────────────

export interface NormalisedScene {
  /** DB scene id */
  sceneId: string;
  /** Full source text of the scene */
  sceneText: string;
  /** French translation if available */
  sceneTextFr: string | null;
  /** Scene title */
  title: string;
  /** Display order (from DB scene_order) */
  sceneOrder: number;
  /** Ordered fragments covering the full sceneText */
  fragments: Fragment[];
  /** Active shots for this scene */
  shots: NormalisedShot[];
}

// ── Action History ─────────────────────────────────────────────────

export type ManifestActionType = "merge" | "delete" | "reassign";

export interface ManifestAction {
  type: ManifestActionType;
  timestamp: string;
  sceneId: string;
  /** IDs of shots involved */
  shotIds: string[];
  /** Human-readable description */
  description: string;
}

// ── Full manifest ──────────────────────────────────────────────────

export interface VisualPromptManifest {
  projectId: string;
  /** All scenes in reading order */
  scenes: NormalisedScene[];
  /** Total active shot count */
  totalShots: number;
  /** Timestamp of last build */
  builtAt: string;
  /** Action history log */
  history: ManifestAction[];
}

// ── Builder helper ─────────────────────────────────────────────────

import type { Tables } from "@/integrations/supabase/types";
import { getNarrativeSegments } from "./narrativeSegmentation";
import { validateAllocation } from "./shotAllocationValidator";

type DBScene = Tables<"scenes">;
type DBShot = Tables<"shots">;

/**
 * Build a deterministic VisualPromptManifest from raw DB rows.
 *
 * Rules:
 * - Scenes sorted by scene_order
 * - Shots sorted by shot_order inside each scene
 * - If a scene has 1 shot → kind = "single", fragment = full sceneText
 * - If a scene has N shots → kind = "split", fragments derived from
 *   each shot's source_sentence (exact substring of sceneText)
 * - Fragment order follows shot_order (reading order invariant)
 */
export function buildManifest(
  projectId: string,
  dbScenes: DBScene[],
  dbShots: DBShot[]
): VisualPromptManifest {
  const sortedScenes = [...dbScenes].sort((a, b) => a.scene_order - b.scene_order);

  // Group shots by scene
  const shotsByScene = new Map<string, DBShot[]>();
  for (const shot of dbShots) {
    const list = shotsByScene.get(shot.scene_id) ?? [];
    list.push(shot);
    shotsByScene.set(shot.scene_id, list);
  }

  let globalOrder = 0;

  const scenes: NormalisedScene[] = sortedScenes.map((scene) => {
    const sceneShots = (shotsByScene.get(scene.id) ?? []).sort((a, b) => {
      // Primary: text position in scene source_text (normalize whitespace for multi-line texts)
      const sceneTextLower = scene.source_text.toLowerCase().replace(/\s+/g, " ");
      const textA = (a.source_sentence || "").toLowerCase().replace(/\s+/g, " ").trim();
      const textB = (b.source_sentence || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (textA && textB) {
        const posA = sceneTextLower.indexOf(textA);
        const posB = sceneTextLower.indexOf(textB);
        if (posA >= 0 && posB >= 0 && posA !== posB) return posA - posB;
      }
      // Fallback: shot_order
      return a.shot_order - b.shot_order;
    });

    const isSingle = sceneShots.length <= 1;

    const fragments: Fragment[] = [];
    const shots: NormalisedShot[] = [];

    sceneShots.forEach((dbShot, idx) => {
      globalOrder++;

      const fragmentText = isSingle
        ? scene.source_text
        : dbShot.source_sentence ?? dbShot.source_sentence_fr ?? scene.source_text;

      const fragmentId = `${scene.id}__frag_${idx}`;

      fragments.push({
        fragmentId,
        sceneId: scene.id,
        text: fragmentText,
        order: idx,
        shotId: dbShot.id,
      });

      shots.push({
        shotId: dbShot.id,
        sceneId: scene.id,
        fragmentIds: [fragmentId],
        kind: isSingle ? "single" : "split",
        status: "active",
        globalOrder,
        localOrder: dbShot.shot_order,
        imageUrl: dbShot.image_url,
        description: dbShot.description,
        shotType: dbShot.shot_type,
      });
    });

    return {
      sceneId: scene.id,
      sceneText: scene.source_text,
      sceneTextFr: scene.source_text_fr ?? null,
      title: scene.title,
      sceneOrder: scene.scene_order,
      fragments,
      shots,
    };
  });

  return {
    projectId,
    scenes,
    totalShots: globalOrder,
    builtAt: new Date().toISOString(),
    history: [],
  };
}

// ── Validation ─────────────────────────────────────────────────────

export interface ManifestIssue {
  level: "error" | "warning";
  sceneId?: string;
  shotId?: string;
  message: string;
}

/**
 * Validate manifest integrity. Returns empty array if valid.
 */
export function validateManifest(manifest: VisualPromptManifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];

  for (const scene of manifest.scenes) {
    // Every scene must have at least one fragment
    if (scene.fragments.length === 0) {
      issues.push({ level: "error", sceneId: scene.sceneId, message: "Scene has no fragments" });
    }

    // Every fragment must reference an active shot
    const activeShotIds = new Set(scene.shots.filter((s) => s.status === "active").map((s) => s.shotId));

    for (const frag of scene.fragments) {
      if (!activeShotIds.has(frag.shotId)) {
        issues.push({
          level: "error",
          sceneId: scene.sceneId,
          shotId: frag.shotId,
          message: `Fragment "${frag.fragmentId}" references missing/deleted shot`,
        });
      }
    }

    // Every active shot must have at least one fragment
    for (const shot of scene.shots) {
      if (shot.status !== "active") continue;
      if (shot.fragmentIds.length === 0) {
        issues.push({
          level: "error",
          sceneId: scene.sceneId,
          shotId: shot.shotId,
          message: "Active shot has no fragments",
        });
      }
      // Every fragmentId must exist
      const fragSet = new Set(scene.fragments.map((f) => f.fragmentId));
      for (const fid of shot.fragmentIds) {
        if (!fragSet.has(fid)) {
          issues.push({
            level: "error",
            sceneId: scene.sceneId,
            shotId: shot.shotId,
            message: `Shot references unknown fragment "${fid}"`,
          });
        }
      }
    }

    // Fragments should cover the scene text (warning only)
    // Use word-level overlap: ≥80% of scene words should appear across fragments
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const wordSet = (s: string) => new Set(normalize(s).split(/[\s.,;:!?()«»""''\-–—]+/).filter(Boolean));
    const sceneWords = wordSet(scene.sceneText);
    if (sceneWords.size > 0) {
      const fragWords = new Set<string>();
      for (const frag of scene.fragments) {
        for (const w of wordSet(frag.text)) fragWords.add(w);
      }
      let matched = 0;
      for (const w of sceneWords) if (fragWords.has(w)) matched++;
      const coverage = matched / sceneWords.size;
      if (coverage < 0.8) {
        issues.push({
          level: "warning",
          sceneId: scene.sceneId,
          message: `Fragments do not reconstruct full scene text (${Math.round(coverage * 100)}% coverage)`,
        });
      }
    }
  }

  return issues;
}

// ── Mutation helpers ───────────────────────────────────────────────

/**
 * Compute the merged source_sentence and source_sentence_fr when merging
 * a shot with the next one in the same scene.
 * Returns the DB updates to apply + a ManifestAction for history.
 */
export function computeMerge(
  sceneShots: DBShot[],
  shotId: string,
  scene: DBScene
): {
  survivorUpdate: { id: string; source_sentence: string; source_sentence_fr: string | null };
  absorbedId: string;
  action: ManifestAction;
  allocationValid: boolean;
} | null {
  const sorted = [...sceneShots].sort((a, b) => a.shot_order - b.shot_order);
  const idx = sorted.findIndex((s) => s.id === shotId);
  if (idx === -1 || idx >= sorted.length - 1) return null;

  const shot = sorted[idx];
  const next = sorted[idx + 1];

  const mergedSentence = [shot.source_sentence, next.source_sentence].filter(Boolean).join(" ");
  const mergedSentenceFr = [shot.source_sentence_fr, next.source_sentence_fr].filter(Boolean).join(" ") || null;

  // Validate allocation after merge
  const remainingFragments = sorted
    .filter((s) => s.id !== next.id)
    .map((s) => s.id === shot.id ? mergedSentence : (s.source_sentence || ""));
  const allocationReport = validateAllocation(scene.source_text, remainingFragments);

  return {
    survivorUpdate: {
      id: shot.id,
      source_sentence: mergedSentence,
      source_sentence_fr: mergedSentenceFr,
    },
    absorbedId: next.id,
    allocationValid: allocationReport.valid,
    action: {
      type: "merge",
      timestamp: new Date().toISOString(),
      sceneId: scene.id,
      shotIds: [shot.id, next.id],
      description: `Shot merged: absorbed shot ${next.shot_order} into shot ${shot.shot_order} in scene "${scene.title}" (coverage: ${allocationReport.coveragePercent}%)`,
    },
  };
}

/**
 * Compute the split of a shot into two shots at a given text position.
 * Returns the DB updates to apply + a ManifestAction for history.
 */
export function computeSplit(
  sceneShots: DBShot[],
  shotId: string,
  splitIndex: number,
  scene: DBScene
): {
  originalUpdate: { id: string; source_sentence: string; source_sentence_fr: string | null };
  newShot: {
    source_sentence: string;
    source_sentence_fr: string | null;
    shot_order: number;
    shot_type: string;
    description: string;
  };
  /** shot_order updates for shots that need to shift */
  orderUpdates: { id: string; shot_order: number }[];
  action: ManifestAction;
} | null {
  const sorted = [...sceneShots].sort((a, b) => a.shot_order - b.shot_order);
  const shot = sorted.find((s) => s.id === shotId);
  if (!shot) return null;

  const text = shot.source_sentence || "";
  if (!text.trim() || splitIndex <= 0 || splitIndex >= text.length) return null;

  const textBefore = text.slice(0, splitIndex).trim();
  const textAfter = text.slice(splitIndex).trim();
  if (!textBefore || !textAfter) return null;

  // Split French text proportionally if available
  let frBefore: string | null = null;
  let frAfter: string | null = null;
  if (shot.source_sentence_fr) {
    const frText = shot.source_sentence_fr;
    const ratio = splitIndex / text.length;
    const frSplitIdx = Math.round(ratio * frText.length);
    // Find nearest sentence boundary in FR text
    const candidates = [frSplitIdx];
    for (let delta = 1; delta < 40; delta++) {
      if (frSplitIdx + delta < frText.length) candidates.push(frSplitIdx + delta);
      if (frSplitIdx - delta > 0) candidates.push(frSplitIdx - delta);
    }
    let bestIdx = frSplitIdx;
    for (const ci of candidates) {
      if (ci > 0 && ci < frText.length && /[.!?;,]/.test(frText[ci - 1])) {
        bestIdx = ci;
        break;
      }
    }
    frBefore = frText.slice(0, bestIdx).trim() || null;
    frAfter = frText.slice(bestIdx).trim() || null;
  }

  const shotIdx = sorted.indexOf(shot);
  const newShotOrder = shot.shot_order + 1;

  // Shift orders for shots after the split point
  const orderUpdates: { id: string; shot_order: number }[] = [];
  for (let i = shotIdx + 1; i < sorted.length; i++) {
    orderUpdates.push({ id: sorted[i].id, shot_order: sorted[i].shot_order + 1 });
  }

  return {
    originalUpdate: {
      id: shot.id,
      source_sentence: textBefore,
      source_sentence_fr: frBefore,
    },
    newShot: {
      source_sentence: textAfter,
      source_sentence_fr: frAfter,
      shot_order: newShotOrder,
      shot_type: shot.shot_type,
      description: shot.description,
    },
    orderUpdates,
    action: {
      type: "reassign" as ManifestActionType,
      timestamp: new Date().toISOString(),
      sceneId: scene.id,
      shotIds: [shot.id],
      description: `Shot scindé en deux dans scène "${scene.title}" à la position ${splitIndex}`,
    },
  };
}

/**
 * Compute text redistribution when deleting a shot from a scene.
 * Returns the DB updates to apply + a ManifestAction for history.
 */
export function computeDeleteRedistribution(
  sceneShots: DBShot[],
  deletedShotId: string,
  scene: DBScene
): {
  updates: { id: string; source_sentence: string; source_sentence_fr: string | null }[];
  action: ManifestAction;
  allocationValid: boolean;
} | null {
  const remaining = sceneShots
    .filter((s) => s.id !== deletedShotId)
    .sort((a, b) => a.shot_order - b.shot_order);

  if (remaining.length === 0) return null;

  const sceneText = scene.source_text;
  const sceneTextFr = scene.source_text_fr || null;

  const updates: { id: string; source_sentence: string; source_sentence_fr: string | null }[] = [];

  if (remaining.length === 1) {
    updates.push({
      id: remaining[0].id,
      source_sentence: sceneText,
      source_sentence_fr: sceneTextFr,
    });
  } else {
    // Use narrative segmentation for redistribution (sense-based, not mechanical)
    const narrativeSegments = getNarrativeSegments(sceneText);
    const narrativeSegmentsFr = sceneTextFr ? getNarrativeSegments(sceneTextFr) : null;

    if (narrativeSegments.length === remaining.length) {
      // Perfect match: 1 narrative unit per remaining shot
      for (let i = 0; i < remaining.length; i++) {
        updates.push({
          id: remaining[i].id,
          source_sentence: narrativeSegments[i],
          source_sentence_fr: narrativeSegmentsFr?.[i] || null,
        });
      }
    } else {
      // Distribute narrative segments across remaining shots
      const perShot = Math.max(1, Math.ceil(narrativeSegments.length / remaining.length));
      for (let i = 0; i < remaining.length; i++) {
        const start = i * perShot;
        const chunk = i === remaining.length - 1
          ? narrativeSegments.slice(start).join(" ").trim()
          : narrativeSegments.slice(start, start + perShot).join(" ").trim();
        const chunkFr = narrativeSegmentsFr
          ? (i === remaining.length - 1
            ? narrativeSegmentsFr.slice(start).join(" ").trim()
            : narrativeSegmentsFr.slice(start, start + perShot).join(" ").trim())
          : null;
        updates.push({
          id: remaining[i].id,
          source_sentence: chunk || sceneText,
          source_sentence_fr: chunkFr,
        });
      }
    }
  }

  // Validate allocation after redistribution
  const allocationReport = validateAllocation(sceneText, updates.map((u) => u.source_sentence));

  return {
    updates,
    allocationValid: allocationReport.valid,
    action: {
      type: "delete",
      timestamp: new Date().toISOString(),
      sceneId: scene.id,
      shotIds: [deletedShotId],
      description: `Shot deleted and text reassigned across ${remaining.length} remaining shot(s) in scene "${scene.title}" (coverage: ${allocationReport.coveragePercent}%)`,
    },
  };
}
