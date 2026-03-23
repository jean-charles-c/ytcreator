/**
 * videoPromptsService — Orchestration layer for VideoPrompts module.
 *
 * Coordinates mapper + store operations. No remote calls yet.
 */

import type { NormalisedScene, NormalisedShot, VisualPromptManifest } from "../visualPromptTypes";
import type { VideoPrompt, Variant, SettingsProfile, VideoPromptsState } from "./types";
import { mapFromVisualPrompts, mapFromScene, mapFromShot } from "./mapper";
import * as store from "./store";

/**
 * Import all active shots from a VisualPrompts manifest.
 * Replaces any existing prompts.
 */
export function importFromManifest(
  state: VideoPromptsState,
  manifest: VisualPromptManifest,
): VideoPromptsState {
  const profile = store.getActiveProfile(state);
  const prompts = mapFromVisualPrompts(manifest.projectId, manifest.scenes, profile);
  return store.replaceAllPrompts(state, prompts);
}

/**
 * Import shots from a single scene, appending to existing prompts.
 */
export function importScene(
  state: VideoPromptsState,
  projectId: string,
  scene: NormalisedScene,
): VideoPromptsState {
  const profile = store.getActiveProfile(state);
  const startOrder = state.prompts.length + 1;
  const newPrompts = mapFromScene(projectId, scene, startOrder, profile);
  return store.addPrompts(state, newPrompts);
}

/**
 * Import a single shot, appending to existing prompts.
 */
export function importShot(
  state: VideoPromptsState,
  projectId: string,
  shot: NormalisedShot,
  scene: NormalisedScene,
): VideoPromptsState {
  const profile = store.getActiveProfile(state);
  const order = state.prompts.length + 1;
  const prompt = mapFromShot(projectId, shot, scene, order, profile);
  return store.addPrompts(state, [prompt]);
}

/**
 * Create a blank manual VideoPrompt.
 */
export function createManual(state: VideoPromptsState, projectId: string): VideoPromptsState {
  const profile = store.getActiveProfile(state);
  const prompt: VideoPrompt = {
    id: crypto.randomUUID(),
    projectId,
    source: "manual",
    sourceShotId: null,
    sourceSceneId: null,
    order: state.prompts.length + 1,
    prompt: "",
    negativePrompt: profile?.defaults.negativePrompt ?? "",
    narrativeFragment: "",
    sceneTitle: "",
    durationSec: profile?.defaults.durationSec ?? 5,
    aspectRatio: profile?.defaults.aspectRatio ?? "16:9",
    style: profile?.defaults.style ?? "cinematic",
    cameraMovement: profile?.defaults.cameraMovement ?? "static",
    sceneMotion: profile?.defaults.sceneMotion ?? "moderate",
    mood: profile?.defaults.mood ?? "",
    renderConstraints: profile?.defaults.renderConstraints ?? "",
    profileId: profile?.id ?? null,
    status: "draft",
    isManuallyEdited: false,
    variantIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.addPrompts(state, [prompt]);
}

/**
 * Create a variant (lightweight duplicate) of an existing prompt.
 */
export function createVariant(
  state: VideoPromptsState,
  parentId: string,
  label: string,
): VideoPromptsState {
  const parent = state.prompts.find((p) => p.id === parentId);
  if (!parent) return state;

  const variant: Variant = {
    id: crypto.randomUUID(),
    parentId,
    label,
    prompt: parent.prompt,
    negativePrompt: parent.negativePrompt,
    overrides: {},
    createdAt: new Date().toISOString(),
  };

  return store.addVariant(state, parentId, variant);
}

/**
 * Apply a settings profile to all draft prompts.
 */
export function applyProfileToAll(state: VideoPromptsState, profileId: string): VideoPromptsState {
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) return state;

  let next = store.setActiveProfile(state, profileId);
  for (const prompt of next.prompts) {
    if (prompt.status !== "draft") continue;
    next = store.updatePrompt(next, prompt.id, {
      durationSec: profile.defaults.durationSec,
      aspectRatio: profile.defaults.aspectRatio,
      style: profile.defaults.style,
      cameraMovement: profile.defaults.cameraMovement,
      sceneMotion: profile.defaults.sceneMotion,
      mood: profile.defaults.mood,
      renderConstraints: profile.defaults.renderConstraints,
      negativePrompt: profile.defaults.negativePrompt,
      profileId: profile.id,
    });
  }
  return next;
}
