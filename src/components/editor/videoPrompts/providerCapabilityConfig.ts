/**
 * ProviderCapabilityConfig — Static configuration driving the VideoPrompts UI.
 *
 * Each provider declares its supported durations, aspect ratios, and features.
 * The UI reads this config to populate dropdowns, disable unsupported options,
 * and display cost estimates. To add a new provider, append an entry here.
 */

import type { ProviderCapability, VideoProvider } from "./videoGeneration.types";

export const PROVIDER_CAPABILITIES: Record<VideoProvider, ProviderCapability> = {
  kling: {
    id: "kling",
    name: "Kling AI",
    description: "High-quality cinematic video generation with strong motion control",
    supportsImageToVideo: true,
    supportsTextToVideo: true,
    durations: [
      { value: 5, label: "5s" },
      { value: 10, label: "10s" },
    ],
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsNegativePrompt: true,
    maxPromptLength: 2500,
    estimatedCostPerGeneration: 0.15,
    enabled: true,
    icon: "kling",
  },
  runway_gen3: {
    id: "runway_gen3",
    name: "Runway Gen-3",
    description: "Fast and versatile video generation with good prompt adherence",
    supportsImageToVideo: true,
    supportsTextToVideo: true,
    durations: [
      { value: 4, label: "4s" },
      { value: 8, label: "8s" },
    ],
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsNegativePrompt: false,
    maxPromptLength: 1500,
    estimatedCostPerGeneration: 0.20,
    enabled: true,
    icon: "runway",
  },
  runway_gen4: {
    id: "runway_gen4",
    name: "Runway Gen-4",
    description: "Latest generation with superior quality, physics and motion realism",
    supportsImageToVideo: true,
    supportsTextToVideo: true,
    durations: [
      { value: 5, label: "5s" },
      { value: 10, label: "10s" },
    ],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    supportsNegativePrompt: true,
    maxPromptLength: 2000,
    estimatedCostPerGeneration: 0.30,
    enabled: true,
    icon: "runway",
  },
  luma: {
    id: "luma",
    name: "Luma Dream Machine",
    description: "Fast, cost-effective video generation with natural motion",
    supportsImageToVideo: true,
    supportsTextToVideo: true,
    durations: [
      { value: 4, label: "4s" },
      { value: 8, label: "8s" },
    ],
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsNegativePrompt: false,
    maxPromptLength: 2000,
    estimatedCostPerGeneration: 0.10,
    enabled: true,
    icon: "luma",
  },
};

/** Ordered list of enabled providers */
export function getEnabledProviders(): ProviderCapability[] {
  return Object.values(PROVIDER_CAPABILITIES).filter((p) => p.enabled);
}

/** Get a single provider config */
export function getProviderCapability(id: VideoProvider): ProviderCapability {
  return PROVIDER_CAPABILITIES[id];
}

/** Get allowed durations for a provider */
export function getProviderDurations(id: VideoProvider) {
  return PROVIDER_CAPABILITIES[id].durations;
}

/** Check if a provider supports a given aspect ratio */
export function providerSupportsAspectRatio(id: VideoProvider, ratio: string): boolean {
  return PROVIDER_CAPABILITIES[id].aspectRatios.includes(ratio);
}
