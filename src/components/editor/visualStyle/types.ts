/**
 * VisualStyle — Types for the visual style system.
 *
 * Hierarchy: Global → Scene → Shot (most local override wins).
 */

export interface VisualStyleOption {
  id: string;
  label: string;
  promptSuffix: string;
}

export const VISUAL_STYLES: VisualStyleOption[] = [
  { id: "realistic", label: "Réaliste / Photographique", promptSuffix: "Ultra realistic documentary photography, photojournalistic style, natural lighting, high dynamic range, film grain, 8k detail" },
  { id: "cinematic", label: "Cinématographique", promptSuffix: "Cinematic film still, dramatic lighting, shallow depth of field, anamorphic lens flare, color graded, widescreen composition, movie-like atmosphere" },
  { id: "illustration", label: "Illustration", promptSuffix: "Digital illustration, detailed artwork, rich colors, clean lines, editorial illustration style, professional book illustration" },
  { id: "painting", label: "Peinture", promptSuffix: "Oil painting style, visible brush strokes, rich texture, classical composition, fine art painting, museum quality" },
  { id: "lineart", label: "Dessin / Line art", promptSuffix: "Detailed line art drawing, pen and ink style, fine linework, cross-hatching, black and white sketch, architectural precision" },
  { id: "comics", label: "BD / Comics / Manga", promptSuffix: "Comic book style, bold outlines, dynamic panels, vivid flat colors, graphic novel illustration, halftone dots" },
  { id: "animation", label: "Animation / Cartoon / Anime", promptSuffix: "Anime style, cel-shaded, vibrant colors, expressive characters, Studio Ghibli inspired, clean digital animation" },
  { id: "conceptart", label: "Concept art", promptSuffix: "Concept art, environment design, painterly digital art, atmospheric perspective, matte painting, professional pre-production art" },
  { id: "3dcgi", label: "3D / CGI", promptSuffix: "3D rendered, CGI, physically based rendering, global illumination, subsurface scattering, photorealistic 3D, Unreal Engine quality" },
  { id: "graphicdesign", label: "Design graphique", promptSuffix: "Graphic design, flat design, bold typography, geometric shapes, modern layout, clean vector aesthetic, infographic style" },
  { id: "abstract", label: "Abstrait / Expérimental", promptSuffix: "Abstract art, experimental composition, non-representational, bold colors, textured layers, artistic interpretation, mixed media" },
  { id: "scientific", label: "Technique / Scientifique", promptSuffix: "Scientific illustration, technical diagram, anatomically precise, labeled cross-section, medical illustration, educational clarity" },
];

export const DEFAULT_VISUAL_STYLE_ID = "realistic";

export function getVisualStyleById(id: string): VisualStyleOption | undefined {
  return VISUAL_STYLES.find((s) => s.id === id);
}

export type InheritanceState = "none" | "inherited" | "overridden";

export interface VisualStyleValue {
  localStyleId: string | null;
  inheritedStyleId: string | null;
}

export function computeEffective(value: VisualStyleValue): {
  effectiveStyleId: string | null;
  state: InheritanceState;
} {
  if (value.localStyleId != null) return { effectiveStyleId: value.localStyleId, state: "overridden" };
  if (value.inheritedStyleId != null) return { effectiveStyleId: value.inheritedStyleId, state: "inherited" };
  return { effectiveStyleId: null, state: "none" };
}

export interface VisualStyleStore {
  globalStyleId: string | null;
  sceneStyles: Map<string, string | null>;
  shotStyles: Map<string, string | null>;
}

export function resolveShotStyle(
  store: VisualStyleStore,
  sceneId: string,
  shotId: string,
): { effectiveStyleId: string | null; source: "shot" | "scene" | "global" | "none" } {
  const shotLocal = store.shotStyles.get(shotId) ?? null;
  if (shotLocal != null) return { effectiveStyleId: shotLocal, source: "shot" };
  const sceneLocal = store.sceneStyles.get(sceneId) ?? null;
  if (sceneLocal != null) return { effectiveStyleId: sceneLocal, source: "scene" };
  if (store.globalStyleId != null) return { effectiveStyleId: store.globalStyleId, source: "global" };
  return { effectiveStyleId: null, source: "none" };
}

export function resolveSceneStyle(
  store: VisualStyleStore,
  sceneId: string,
): { effectiveStyleId: string | null; source: "scene" | "global" | "none" } {
  const sceneLocal = store.sceneStyles.get(sceneId) ?? null;
  if (sceneLocal != null) return { effectiveStyleId: sceneLocal, source: "scene" };
  if (store.globalStyleId != null) return { effectiveStyleId: store.globalStyleId, source: "global" };
  return { effectiveStyleId: null, source: "none" };
}
