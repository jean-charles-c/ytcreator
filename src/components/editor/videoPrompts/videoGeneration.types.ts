/**
 * VideoGeneration — Data model types for the refactored VideoPrompts module.
 *
 * Entities:
 *  - ScriptSentence    : reference to a shot's narrative fragment (read from shots table)
 *  - VisualAsset       : an image (gallery or external) that can produce video generations
 *  - VideoGeneration   : one generation attempt for a given visual asset
 *  - ProviderCapability: UI-driving config for each supported provider
 */

// ── Enums ────────────────────────────────────────────────────────

/** Where the source image comes from */
export type VisualAssetSource = "gallery" | "external_upload";

/** Supported video generation providers */
export type VideoProvider = "kling" | "runway_gen3" | "runway_gen4" | "luma";

/** Lifecycle status of a video generation */
export type VideoGenerationStatus =
  | "not_generated"
  | "pending"
  | "processing"
  | "completed"
  | "error";

// ── ScriptSentence (read-only reference) ─────────────────────────

/** Represents a shot's narrative text — read from the shots table, not stored separately */
export interface ScriptSentence {
  shotId: string;
  sceneId: string;
  sceneTitle: string;
  shotOrder: number;
  /** English source sentence */
  sourceSentence: string;
  /** French source sentence */
  sourceSentenceFr: string | null;
  /** VO duration in seconds (if available from timeline) */
  voDurationSec: number | null;
}

// ── VisualAsset ──────────────────────────────────────────────────

/** A visual asset that can be turned into video(s) */
export interface VisualAsset {
  id: string;
  projectId: string;
  /** gallery = from shot storyboard, external_upload = manual upload */
  source: VisualAssetSource;
  /** URL of the source image */
  imageUrl: string;
  /** If gallery: linked shot id */
  shotId: string | null;
  /** If gallery: linked scene id */
  sceneId: string | null;
  /** Script sentence reference (populated at read-time for gallery assets) */
  scriptSentence: ScriptSentence | null;
  /** User label (mainly for external uploads) */
  label: string;
  /** Display order */
  displayOrder: number;
  /** Number of completed video generations */
  videoCount: number;
  createdAt: string;
}

// ── VideoGeneration ──────────────────────────────────────────────

/** One video generation attempt for a VisualAsset */
export interface VideoGeneration {
  id: string;
  userId: string;
  projectId: string;
  /** The visual asset this generation is for */
  visualAssetId: string;
  /** Source type (denormalized for quick filtering) */
  sourceType: VisualAssetSource;
  /** The image URL used as input */
  sourceImageUrl: string;
  /** Provider used */
  provider: VideoProvider;
  /** Prompt actually sent to the provider */
  promptUsed: string;
  /** Negative prompt sent */
  negativePrompt: string;
  /** Requested duration in seconds */
  durationSec: number;
  /** Aspect ratio requested */
  aspectRatio: string;
  /** Lifecycle status */
  status: VideoGenerationStatus;
  /** URL of the generated video (when completed) */
  resultVideoUrl: string | null;
  /** Thumbnail URL of the generated video */
  resultThumbnailUrl: string | null;
  /** Error message (when status = error) */
  errorMessage: string | null;
  /** Provider-side job id for polling */
  providerJobId: string | null;
  /** Generation time in milliseconds */
  generationTimeMs: number | null;
  /** Estimated cost in USD */
  estimatedCostUsd: number | null;
  /** Provider raw response metadata */
  providerMetadata: Record<string, unknown> | null;
  /** Whether this video is selected for export */
  selectedForExport: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Provider Capability (UI-driving config) ──────────────────────

export interface ProviderDurationOption {
  /** Duration in seconds */
  value: number;
  /** Display label e.g. "5s" */
  label: string;
}

export interface ProviderCapability {
  /** Provider identifier */
  id: VideoProvider;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Whether this provider supports image-to-video */
  supportsImageToVideo: boolean;
  /** Whether this provider supports text-to-video (no image input) */
  supportsTextToVideo: boolean;
  /** Allowed durations */
  durations: ProviderDurationOption[];
  /** Supported aspect ratios */
  aspectRatios: string[];
  /** Whether negative prompts are supported */
  supportsNegativePrompt: boolean;
  /** Max prompt length in characters */
  maxPromptLength: number;
  /** Approximate cost per generation in USD */
  estimatedCostPerGeneration: number;
  /** Whether the provider is currently enabled */
  enabled: boolean;
  /** Icon identifier or URL */
  icon: string;
}

// ── Store state ──────────────────────────────────────────────────

export interface VideoPromptsModuleState {
  /** Visual assets (gallery + external) */
  assets: VisualAsset[];
  /** Video generations indexed by visual asset id */
  generations: Map<string, VideoGeneration[]>;
  /** Active provider id */
  activeProviderId: VideoProvider;
}
