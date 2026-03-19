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
    const sceneShots = (shotsByScene.get(scene.id) ?? []).sort(
      (a, b) => a.shot_order - b.shot_order
    );

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

    // Fragments should reconstruct full scene text (warning only)
    const reconstructed = scene.fragments.map((f) => f.text).join(" ");
    if (reconstructed.trim() !== scene.sceneText.trim()) {
      // Check with flexible whitespace
      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      if (normalize(reconstructed) !== normalize(scene.sceneText)) {
        issues.push({
          level: "warning",
          sceneId: scene.sceneId,
          message: "Fragments do not reconstruct full scene text",
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
} | null {
  const sorted = [...sceneShots].sort((a, b) => a.shot_order - b.shot_order);
  const idx = sorted.findIndex((s) => s.id === shotId);
  if (idx === -1 || idx >= sorted.length - 1) return null;

  const shot = sorted[idx];
  const next = sorted[idx + 1];

  const mergedSentence = [shot.source_sentence, next.source_sentence].filter(Boolean).join(" ");
  const mergedSentenceFr = [shot.source_sentence_fr, next.source_sentence_fr].filter(Boolean).join(" ") || null;

  return {
    survivorUpdate: {
      id: shot.id,
      source_sentence: mergedSentence,
      source_sentence_fr: mergedSentenceFr,
    },
    absorbedId: next.id,
    action: {
      type: "merge",
      timestamp: new Date().toISOString(),
      sceneId: scene.id,
      shotIds: [shot.id, next.id],
      description: `Shot merged: absorbed shot ${next.shot_order} into shot ${shot.shot_order} in scene "${scene.title}"`,
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
} | null {
  const remaining = sceneShots
    .filter((s) => s.id !== deletedShotId)
    .sort((a, b) => a.shot_order - b.shot_order);

  if (remaining.length === 0) return null;

  const sceneText = scene.source_text;
  const sceneTextFr = scene.source_text_fr || null;

  const updates: { id: string; source_sentence: string; source_sentence_fr: string | null }[] = [];

  if (remaining.length === 1) {
    // Single remaining shot gets full scene text
    updates.push({
      id: remaining[0].id,
      source_sentence: sceneText,
      source_sentence_fr: sceneTextFr,
    });
  } else {
    // Split scene text across remaining shots by sentence boundaries
    const sentences = sceneText.match(/[^.!?]+[.!?]+/g) || [sceneText];
    const sentencesFr = sceneTextFr
      ? sceneTextFr.match(/[^.!?]+[.!?]+/g) || [sceneTextFr]
      : null;
    const perShot = Math.max(1, Math.ceil(sentences.length / remaining.length));

    for (let i = 0; i < remaining.length; i++) {
      const start = i * perShot;
      const chunk =
        i === remaining.length - 1
          ? sentences.slice(start).join("").trim()
          : sentences.slice(start, start + perShot).join("").trim();
      const chunkFr =
        sentencesFr
          ? i === remaining.length - 1
            ? sentencesFr.slice(start).join("").trim()
            : sentencesFr.slice(start, start + perShot).join("").trim()
          : null;
      updates.push({
        id: remaining[i].id,
        source_sentence: chunk || sceneText,
        source_sentence_fr: chunkFr,
      });
    }
  }

  return {
    updates,
    action: {
      type: "delete",
      timestamp: new Date().toISOString(),
      sceneId: scene.id,
      shotIds: [deletedShotId],
      description: `Shot deleted and text reassigned across ${remaining.length} remaining shot(s) in scene "${scene.title}"`,
    },
  };
}
