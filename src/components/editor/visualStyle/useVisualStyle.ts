/**
 * useVisualStyle — Central hook for managing visual style hierarchy.
 * Mirrors useSensitiveMode: Global → Scene → Shot inheritance.
 */

import { useState, useCallback, useMemo } from "react";
import {
  type VisualStyleStore,
  type VisualStyleValue,
  resolveShotStyle,
  resolveSceneStyle,
} from "./types";

export function useVisualStyle() {
  const [globalStyleId, setGlobalStyleId] = useState<string | null>(null);
  const [sceneStyles, setSceneStyles] = useState<Map<string, string | null>>(new Map());
  const [shotStyles, setShotStyles] = useState<Map<string, string | null>>(new Map());

  const store: VisualStyleStore = useMemo(
    () => ({ globalStyleId, sceneStyles, shotStyles }),
    [globalStyleId, sceneStyles, shotStyles],
  );

  const setSceneStyle = useCallback((sceneId: string, styleId: string | null) => {
    setSceneStyles((prev) => {
      const next = new Map(prev);
      if (styleId == null) next.delete(sceneId);
      else next.set(sceneId, styleId);
      return next;
    });
  }, []);

  const setShotStyle = useCallback((shotId: string, styleId: string | null) => {
    setShotStyles((prev) => {
      const next = new Map(prev);
      if (styleId == null) next.delete(shotId);
      else next.set(shotId, styleId);
      return next;
    });
  }, []);

  const getGlobalValue = useCallback((): VisualStyleValue => ({
    localStyleId: globalStyleId,
    inheritedStyleId: null,
  }), [globalStyleId]);

  const getSceneValue = useCallback((sceneId: string): VisualStyleValue => ({
    localStyleId: sceneStyles.get(sceneId) ?? null,
    inheritedStyleId: globalStyleId,
  }), [sceneStyles, globalStyleId]);

  const getShotValue = useCallback((sceneId: string, shotId: string): VisualStyleValue => {
    const sceneLocal = sceneStyles.get(sceneId) ?? null;
    return {
      localStyleId: shotStyles.get(shotId) ?? null,
      inheritedStyleId: sceneLocal ?? globalStyleId,
    };
  }, [shotStyles, sceneStyles, globalStyleId]);

  const resolveShot = useCallback(
    (sceneId: string, shotId: string) => resolveShotStyle(store, sceneId, shotId),
    [store],
  );

  const resolveScene = useCallback(
    (sceneId: string) => resolveSceneStyle(store, sceneId),
    [store],
  );

  return {
    store,
    globalStyleId,
    setGlobalStyleId,
    setSceneStyle,
    setShotStyle,
    getGlobalValue,
    getSceneValue,
    getShotValue,
    resolveShot,
    resolveScene,
  };
}
