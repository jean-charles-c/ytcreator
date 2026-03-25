/**
 * useSensitiveMode — Central hook for managing the sensitive mode hierarchy.
 *
 * Encapsulates state and resolution logic for Global → Scene → Shot inheritance.
 */

import { useState, useCallback, useMemo } from "react";
import {
  type SensitiveLevel,
  type SensitiveModeStore,
  type SensitiveModeValue,
  resolveShotEffective,
  resolveSceneEffective,
} from "./types";

export function useSensitiveMode() {
  const [globalLevel, setGlobalLevel] = useState<SensitiveLevel | null>(null);
  const [sceneLevels, setSceneLevels] = useState<Map<string, SensitiveLevel | null>>(new Map());
  const [shotLevels, setShotLevels] = useState<Map<string, SensitiveLevel | null>>(new Map());

  /** Store snapshot for resolution functions */
  const store: SensitiveModeStore = useMemo(
    () => ({ globalLevel, sceneLevels, shotLevels }),
    [globalLevel, sceneLevels, shotLevels],
  );

  // ── Setters ──────────────────────────────────────────────────

  const setSceneLevel = useCallback((sceneId: string, level: SensitiveLevel | null) => {
    setSceneLevels((prev) => {
      const next = new Map(prev);
      if (level == null) next.delete(sceneId);
      else next.set(sceneId, level);
      return next;
    });
  }, []);

  const setShotLevel = useCallback((shotId: string, level: SensitiveLevel | null) => {
    setShotLevels((prev) => {
      const next = new Map(prev);
      if (level == null) next.delete(shotId);
      else next.set(shotId, level);
      return next;
    });
  }, []);

  /** Reset a scene to inherit from global */
  const resetSceneToInherited = useCallback((sceneId: string) => {
    setSceneLevel(sceneId, null);
  }, [setSceneLevel]);

  /** Reset a shot to inherit from its scene (or global) */
  const resetShotToInherited = useCallback((shotId: string) => {
    setShotLevel(shotId, null);
  }, [setShotLevel]);

  /** Reset all overrides */
  const resetAll = useCallback(() => {
    setGlobalLevel(null);
    setSceneLevels(new Map());
    setShotLevels(new Map());
  }, []);

  // ── Value builders for ScopeOverrideControl ──────────────────

  const getGlobalValue = useCallback((): SensitiveModeValue => ({
    localLevel: globalLevel,
    inheritedLevel: null,
  }), [globalLevel]);

  const getSceneValue = useCallback((sceneId: string): SensitiveModeValue => ({
    localLevel: sceneLevels.get(sceneId) ?? null,
    inheritedLevel: globalLevel,
  }), [sceneLevels, globalLevel]);

  const getShotValue = useCallback((sceneId: string, shotId: string): SensitiveModeValue => {
    const sceneLocal = sceneLevels.get(sceneId) ?? null;
    return {
      localLevel: shotLevels.get(shotId) ?? null,
      inheritedLevel: sceneLocal ?? globalLevel,
    };
  }, [shotLevels, sceneLevels, globalLevel]);

  // ── Resolution ───────────────────────────────────────────────

  const resolveShot = useCallback(
    (sceneId: string, shotId: string) => resolveShotEffective(store, sceneId, shotId),
    [store],
  );

  const resolveScene = useCallback(
    (sceneId: string) => resolveSceneEffective(store, sceneId),
    [store],
  );

  return {
    // State
    store,
    globalLevel,

    // Setters
    setGlobalLevel,
    setSceneLevel,
    setShotLevel,
    resetSceneToInherited,
    resetShotToInherited,
    resetAll,

    // Value builders
    getGlobalValue,
    getSceneValue,
    getShotValue,

    // Resolution
    resolveShot,
    resolveScene,
  };
}
