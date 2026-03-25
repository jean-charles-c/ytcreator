/**
 * SensitiveMode — Types for the visual representation sensitivity system.
 *
 * 4 constraint levels applied hierarchically:
 *   Global (all scenes) → Scene → Shot
 * The most local override wins.
 */

export type SensitiveLevel = 1 | 2 | 3 | 4;

export const SENSITIVE_LEVEL_META: Record<SensitiveLevel, { label: string; description: string; icon: string }> = {
  1: { label: "Atténué", description: "Représentation adoucie, angles indirects", icon: "🔅" },
  2: { label: "Suggéré", description: "Hors-cadre partiel, suggestion visuelle", icon: "🌫️" },
  3: { label: "Implicite / Symbolique", description: "Symboles, métaphores visuelles", icon: "🎭" },
  4: { label: "Hors-champ total", description: "Aucune représentation directe", icon: "⬛" },
};

export type InheritanceState = "none" | "inherited" | "overridden";

export interface SensitiveModeValue {
  /** Locally set level, or null if inheriting */
  localLevel: SensitiveLevel | null;
  /** Level inherited from the parent scope */
  inheritedLevel: SensitiveLevel | null;
}

/**
 * Compute the effective level and inheritance state from a SensitiveModeValue.
 */
export function computeEffective(value: SensitiveModeValue): {
  effectiveLevel: SensitiveLevel | null;
  state: InheritanceState;
} {
  if (value.localLevel != null) {
    return { effectiveLevel: value.localLevel, state: "overridden" };
  }
  if (value.inheritedLevel != null) {
    return { effectiveLevel: value.inheritedLevel, state: "inherited" };
  }
  return { effectiveLevel: null, state: "none" };
}

// ── Hierarchy resolution ──────────────────────────────────────────

export interface SensitiveModeStore {
  globalLevel: SensitiveLevel | null;
  sceneLevels: Map<string, SensitiveLevel | null>;
  shotLevels: Map<string, SensitiveLevel | null>;
}

/**
 * Resolve the effective sensitive level for a specific shot
 * by walking the hierarchy: shot → scene → global.
 */
export function resolveShotEffective(
  store: SensitiveModeStore,
  sceneId: string,
  shotId: string,
): { effectiveLevel: SensitiveLevel | null; source: "shot" | "scene" | "global" | "none" } {
  const shotLocal = store.shotLevels.get(shotId) ?? null;
  if (shotLocal != null) return { effectiveLevel: shotLocal, source: "shot" };

  const sceneLocal = store.sceneLevels.get(sceneId) ?? null;
  if (sceneLocal != null) return { effectiveLevel: sceneLocal, source: "scene" };

  if (store.globalLevel != null) return { effectiveLevel: store.globalLevel, source: "global" };

  return { effectiveLevel: null, source: "none" };
}

/**
 * Resolve the effective sensitive level for a specific scene
 * by walking the hierarchy: scene → global.
 */
export function resolveSceneEffective(
  store: SensitiveModeStore,
  sceneId: string,
): { effectiveLevel: SensitiveLevel | null; source: "scene" | "global" | "none" } {
  const sceneLocal = store.sceneLevels.get(sceneId) ?? null;
  if (sceneLocal != null) return { effectiveLevel: sceneLocal, source: "scene" };

  if (store.globalLevel != null) return { effectiveLevel: store.globalLevel, source: "global" };

  return { effectiveLevel: null, source: "none" };
}
