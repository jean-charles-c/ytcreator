/**
 * videoPromptsMapper — Maps VisualPrompts / scenes / shots → VideoPrompt[]
 *
 * Explicit bridge: reads from existing data, produces dedicated VideoPrompt objects.
 */

import type { NormalisedScene, NormalisedShot } from "../visualPromptTypes";
import type { VideoPrompt, SettingsProfile } from "./types";

/**
 * Map a VisualPrompts manifest into VideoPrompt drafts.
 * One VideoPrompt per active shot.
 */
export function mapFromVisualPrompts(
  projectId: string,
  scenes: NormalisedScene[],
  profile: SettingsProfile | null,
): VideoPrompt[] {
  const now = new Date().toISOString();
  const prompts: VideoPrompt[] = [];
  let order = 0;

  for (const scene of scenes) {
    for (const shot of scene.shots) {
      if (shot.status !== "active") continue;
      order++;

      // Find the fragment text for this shot
      const fragment = scene.fragments.find((f) => f.shotId === shot.shotId);
      const narrativeText = fragment?.text ?? "";

      prompts.push(
        buildVideoPrompt({
          projectId,
          source: "visual-prompts",
          sourceShotId: shot.shotId,
          sourceSceneId: scene.sceneId,
          order,
          prompt: composeVideoPromptText(shot, scene),
          narrativeFragment: narrativeText,
          sceneTitle: scene.title,
          profile,
          now,
        }),
      );
    }
  }

  return prompts;
}

/**
 * Map a single scene into VideoPrompt drafts (one per shot).
 */
export function mapFromScene(
  projectId: string,
  scene: NormalisedScene,
  startOrder: number,
  profile: SettingsProfile | null,
): VideoPrompt[] {
  const now = new Date().toISOString();
  return scene.shots
    .filter((s) => s.status === "active")
    .map((shot, i) => {
      const fragment = scene.fragments.find((f) => f.shotId === shot.shotId);
      return buildVideoPrompt({
        projectId,
        source: "scene",
        sourceShotId: shot.shotId,
        sourceSceneId: scene.sceneId,
        order: startOrder + i,
        prompt: composeVideoPromptText(shot, scene),
        narrativeFragment: fragment?.text ?? "",
        sceneTitle: scene.title,
        profile,
        now,
      });
    });
}

/**
 * Map a single shot into one VideoPrompt.
 */
export function mapFromShot(
  projectId: string,
  shot: NormalisedShot,
  scene: NormalisedScene,
  order: number,
  profile: SettingsProfile | null,
): VideoPrompt {
  const now = new Date().toISOString();
  const fragment = scene.fragments.find((f) => f.shotId === shot.shotId);
  return buildVideoPrompt({
    projectId,
    source: "shot",
    sourceShotId: shot.shotId,
    sourceSceneId: scene.sceneId,
    order,
    prompt: composeVideoPromptText(shot, scene),
    narrativeFragment: fragment?.text ?? "",
    sceneTitle: scene.title,
    profile,
    now,
  });
}

// ── Helpers ──────────────────────────────────────────────────────

function composeVideoPromptText(shot: NormalisedShot, scene: NormalisedScene): string {
  const parts: string[] = [];

  // Shot description is the core visual prompt
  if (shot.description) parts.push(shot.description);

  // Add shot type as framing hint
  if (shot.shotType) parts.push(`Shot type: ${shot.shotType}.`);

  // Add scene-level context if available
  if (scene.title) parts.push(`Scene: "${scene.title}".`);

  return parts.join(" ");
}

interface BuildParams {
  projectId: string;
  source: VideoPrompt["source"];
  sourceShotId: string | null;
  sourceSceneId: string | null;
  order: number;
  prompt: string;
  narrativeFragment: string;
  sceneTitle: string;
  profile: SettingsProfile | null;
  now: string;
}

function buildVideoPrompt(p: BuildParams): VideoPrompt {
  const defaults = p.profile?.defaults;
  return {
    id: crypto.randomUUID(),
    projectId: p.projectId,
    source: p.source,
    sourceShotId: p.sourceShotId,
    sourceSceneId: p.sourceSceneId,
    order: p.order,
    prompt: p.prompt,
    negativePrompt: defaults?.negativePrompt ?? "",
    narrativeFragment: p.narrativeFragment,
    sceneTitle: p.sceneTitle,
    durationSec: defaults?.durationSec ?? 5,
    aspectRatio: defaults?.aspectRatio ?? "16:9",
    style: defaults?.style ?? "cinematic",
    cameraMovement: defaults?.cameraMovement ?? "static",
    sceneMotion: defaults?.sceneMotion ?? "moderate",
    mood: defaults?.mood ?? "",
    renderConstraints: defaults?.renderConstraints ?? "",
    profileId: p.profile?.id ?? null,
    status: "draft",
    isManuallyEdited: false,
    variantIds: [],
    createdAt: p.now,
    updatedAt: p.now,
  };
}
