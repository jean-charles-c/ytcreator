/**
 * useVisualStyle — Central hook for managing visual style hierarchy.
 * Mirrors useSensitiveMode: Global → Scene → Shot inheritance.
 *
 * Persistence: per-project. The global style is loaded from the database
 * (project_scriptcreator_state.visual_style_global) when a projectId is
 * provided. A per-project localStorage fallback (`visualStyle_globalId:<id>`)
 * keeps the UI responsive while the DB roundtrip happens, and serves as a
 * cache for projects without a saved value yet.
 *
 * IMPORTANT: we never read or write a *global* localStorage key — that was
 * the source of the bug where one project's style leaked into another.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type VisualStyleStore,
  type VisualStyleValue,
  resolveShotStyle,
  resolveSceneStyle,
  DEFAULT_VISUAL_STYLE_ID,
} from "./types";

const STORAGE_PREFIX = "visualStyle_globalId:";
const projectKey = (projectId: string | null | undefined) =>
  projectId ? `${STORAGE_PREFIX}${projectId}` : null;

export function useVisualStyle(projectId?: string | null) {
  // Initial value: per-project localStorage cache, or default. Never the
  // legacy global key (which would leak between projects).
  const [globalStyleId, setGlobalStyleIdRaw] = useState<string | null>(() => {
    try {
      const k = projectKey(projectId);
      if (k) return localStorage.getItem(k) || DEFAULT_VISUAL_STYLE_ID;
      return DEFAULT_VISUAL_STYLE_ID;
    } catch {
      return DEFAULT_VISUAL_STYLE_ID;
    }
  });
  const [sceneStyles, setSceneStyles] = useState<Map<string, string | null>>(new Map());
  const [shotStyles, setShotStyles] = useState<Map<string, string | null>>(new Map());

  // Track the projectId we last loaded from DB to avoid races.
  const loadedForProjectRef = useRef<string | null>(null);

  // When projectId changes: reset scene/shot overrides, restore per-project
  // cache immediately, then fetch the authoritative value from the DB.
  useEffect(() => {
    // Reset local hierarchy when switching projects.
    setSceneStyles(new Map());
    setShotStyles(new Map());

    if (!projectId) {
      setGlobalStyleIdRaw(DEFAULT_VISUAL_STYLE_ID);
      loadedForProjectRef.current = null;
      return;
    }

    // Optimistic restore from per-project cache.
    try {
      const cached = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
      setGlobalStyleIdRaw(cached || DEFAULT_VISUAL_STYLE_ID);
    } catch {
      setGlobalStyleIdRaw(DEFAULT_VISUAL_STYLE_ID);
    }

    // Fetch authoritative value from DB.
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("project_scriptcreator_state")
          .select("visual_style_global")
          .eq("project_id", projectId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn("[useVisualStyle] DB load failed:", error.message);
          return;
        }
        const dbValue = (data?.visual_style_global as string | null) ?? null;
        if (dbValue) {
          setGlobalStyleIdRaw(dbValue);
          try { localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, dbValue); } catch {}
        }
        loadedForProjectRef.current = projectId;
      } catch (e) {
        console.warn("[useVisualStyle] DB load exception:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  const setGlobalStyleId = useCallback((id: string | null) => {
    const value = id ?? DEFAULT_VISUAL_STYLE_ID;
    setGlobalStyleIdRaw(value);
    if (!projectId) return;
    // Per-project cache (instant).
    try { localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, value); } catch {}
    // Persist to DB (fire-and-forget; row is upserted by other workflows).
    (async () => {
      try {
        const { error } = await supabase
          .from("project_scriptcreator_state")
          .update({ visual_style_global: value })
          .eq("project_id", projectId);
        if (error) console.warn("[useVisualStyle] DB save failed:", error.message);
      } catch (e) {
        console.warn("[useVisualStyle] DB save exception:", e);
      }
    })();
  }, [projectId]);

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
