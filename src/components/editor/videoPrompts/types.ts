/**
 * VideoPrompts — Business model types
 *
 * Dedicated video prompt objects, fully separate from VisualPrompts.
 * A VideoPrompt describes a single video segment directive for the render pipeline.
 */

// ── Core VideoPrompt ──────────────────────────────────────────────

export type VideoPromptSource = "visual-prompts" | "scene" | "shot" | "manual";
export type VideoPromptStatus = "draft" | "ready" | "queued" | "rendering" | "done" | "error";
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "21:9";
export type CameraMovement = "static" | "pan-left" | "pan-right" | "tilt-up" | "tilt-down" | "zoom-in" | "zoom-out" | "dolly-in" | "dolly-out" | "orbit" | "tracking" | "crane" | "handheld";
export type SceneMotion = "none" | "slow" | "moderate" | "fast" | "dynamic";

export interface VideoPrompt {
  /** Unique local id (uuid) */
  id: string;
  /** Project reference */
  projectId: string;
  /** Where this prompt originated */
  source: VideoPromptSource;
  /** Reference to the source shot id (if from VisualPrompts/shot) */
  sourceShotId: string | null;
  /** Reference to the source scene id */
  sourceSceneId: string | null;
  /** Display order in the list */
  order: number;

  // ── Content ───────────────────────────────────────────────────
  /** Main video generation prompt */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt: string;
  /** Source narration text this prompt illustrates */
  narrativeFragment: string;
  /** Scene title for context */
  sceneTitle: string;

  // ── Video parameters ──────────────────────────────────────────
  /** Target duration in seconds */
  durationSec: number;
  /** Aspect ratio */
  aspectRatio: AspectRatio;
  /** Visual style keyword */
  style: string;
  /** Camera movement type */
  cameraMovement: CameraMovement;
  /** Scene motion intensity */
  sceneMotion: SceneMotion;
  /** Mood / ambiance keyword */
  mood: string;
  /** Render constraints (model hints, quality) */
  renderConstraints: string;

  // ── Metadata ──────────────────────────────────────────────────
  /** Active settings profile id */
  profileId: string | null;
  /** Lifecycle status */
  status: VideoPromptStatus;
  /** Whether the user has manually edited this prompt */
  isManuallyEdited: boolean;
  /** Variant ids derived from this prompt */
  variantIds: string[];
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

// ── Variant ───────────────────────────────────────────────────────

export interface Variant {
  /** Unique id */
  id: string;
  /** Parent VideoPrompt id */
  parentId: string;
  /** Label describing the variation */
  label: string;
  /** Overridden prompt text */
  prompt: string;
  /** Overridden negative prompt */
  negativePrompt: string;
  /** Overridden parameters (partial) */
  overrides: Partial<Pick<VideoPrompt,
    "durationSec" | "aspectRatio" | "style" | "cameraMovement" | "sceneMotion" | "mood" | "renderConstraints"
  >>;
  createdAt: string;
}

// ── Settings Profile ──────────────────────────────────────────────

export interface SettingsProfile {
  /** Unique id */
  id: string;
  /** Human-readable name */
  name: string;
  /** Default values applied when this profile is selected */
  defaults: {
    durationSec: number;
    aspectRatio: AspectRatio;
    style: string;
    cameraMovement: CameraMovement;
    sceneMotion: SceneMotion;
    mood: string;
    renderConstraints: string;
    negativePrompt: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ── Store state ───────────────────────────────────────────────────

export interface VideoPromptsState {
  prompts: VideoPrompt[];
  variants: Map<string, Variant[]>;
  profiles: SettingsProfile[];
  activeProfileId: string | null;
}
