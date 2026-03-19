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
