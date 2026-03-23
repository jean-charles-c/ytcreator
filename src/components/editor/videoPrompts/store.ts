/**
 * videoPromptsStore — In-memory state management for VideoPrompts module.
 *
 * Isolated from VisualPrompts store. No remote persistence yet (Étape 7).
 */

import type { VideoPrompt, Variant, SettingsProfile, VideoPromptsState } from "./types";

const DEFAULT_PROFILE: SettingsProfile = {
  id: "default",
  name: "Standard Cinematic",
  defaults: {
    durationSec: 5,
    aspectRatio: "16:9",
    style: "cinematic",
    cameraMovement: "static",
    sceneMotion: "moderate",
    mood: "",
    renderConstraints: "",
    negativePrompt: "",
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function createInitialState(): VideoPromptsState {
  return {
    prompts: [],
    variants: new Map(),
    profiles: [DEFAULT_PROFILE],
    activeProfileId: DEFAULT_PROFILE.id,
  };
}

// ── Prompt CRUD ──────────────────────────────────────────────────

export function addPrompts(state: VideoPromptsState, prompts: VideoPrompt[]): VideoPromptsState {
  return { ...state, prompts: [...state.prompts, ...prompts] };
}

export function replaceAllPrompts(state: VideoPromptsState, prompts: VideoPrompt[]): VideoPromptsState {
  return { ...state, prompts, variants: new Map() };
}

export function updatePrompt(state: VideoPromptsState, id: string, patch: Partial<VideoPrompt>): VideoPromptsState {
  return {
    ...state,
    prompts: state.prompts.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
    ),
  };
}

export function deletePrompt(state: VideoPromptsState, id: string): VideoPromptsState {
  const newVariants = new Map(state.variants);
  newVariants.delete(id);
  return {
    ...state,
    prompts: state.prompts.filter((p) => p.id !== id),
    variants: newVariants,
  };
}

export function reorderPrompts(state: VideoPromptsState, orderedIds: string[]): VideoPromptsState {
  const map = new Map(state.prompts.map((p) => [p.id, p]));
  const reordered = orderedIds
    .map((id, i) => {
      const p = map.get(id);
      return p ? { ...p, order: i + 1 } : null;
    })
    .filter(Boolean) as VideoPrompt[];
  return { ...state, prompts: reordered };
}

// ── Variants ─────────────────────────────────────────────────────

export function addVariant(state: VideoPromptsState, parentId: string, variant: Variant): VideoPromptsState {
  const existing = state.variants.get(parentId) ?? [];
  const newVariants = new Map(state.variants);
  newVariants.set(parentId, [...existing, variant]);
  return {
    ...state,
    variants: newVariants,
    prompts: state.prompts.map((p) =>
      p.id === parentId ? { ...p, variantIds: [...p.variantIds, variant.id] } : p,
    ),
  };
}

export function deleteVariant(state: VideoPromptsState, parentId: string, variantId: string): VideoPromptsState {
  const existing = state.variants.get(parentId) ?? [];
  const newVariants = new Map(state.variants);
  newVariants.set(parentId, existing.filter((v) => v.id !== variantId));
  return {
    ...state,
    variants: newVariants,
    prompts: state.prompts.map((p) =>
      p.id === parentId ? { ...p, variantIds: p.variantIds.filter((vid) => vid !== variantId) } : p,
    ),
  };
}

// ── Profiles ─────────────────────────────────────────────────────

export function addProfile(state: VideoPromptsState, profile: SettingsProfile): VideoPromptsState {
  return { ...state, profiles: [...state.profiles, profile] };
}

export function updateProfile(state: VideoPromptsState, id: string, patch: Partial<SettingsProfile>): VideoPromptsState {
  return {
    ...state,
    profiles: state.profiles.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
    ),
  };
}

export function deleteProfile(state: VideoPromptsState, id: string): VideoPromptsState {
  if (id === "default") return state; // Cannot delete default
  return {
    ...state,
    profiles: state.profiles.filter((p) => p.id !== id),
    activeProfileId: state.activeProfileId === id ? "default" : state.activeProfileId,
  };
}

export function setActiveProfile(state: VideoPromptsState, id: string): VideoPromptsState {
  return { ...state, activeProfileId: id };
}

// ── Selectors ────────────────────────────────────────────────────

export function getActiveProfile(state: VideoPromptsState): SettingsProfile | null {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
}

export function getPromptsByScene(state: VideoPromptsState, sceneId: string): VideoPrompt[] {
  return state.prompts.filter((p) => p.sourceSceneId === sceneId);
}

export function getVariants(state: VideoPromptsState, promptId: string): Variant[] {
  return state.variants.get(promptId) ?? [];
}
