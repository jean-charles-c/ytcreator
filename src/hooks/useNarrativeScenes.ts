import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NarrativeSceneRow {
  id: string;
  user_id: string;
  project_id: string;
  chapter_id: string;
  outline_id: string | null;
  scene_order: number;
  title: string | null;
  summary: string | null;
  content: string;
  voice_over_text: string | null;
  narrative_role: string | null;
  dominant_emotion: string | null;
  characters: string[];
  locations: string[];
  objects: string[];
  transition_to_next: string | null;
  scene_context: { context?: string } | null;
  status: string;
  validated: boolean;
  ai_model: string | null;
  generation_index: number;
  created_at: string;
  updated_at: string;
}

/**
 * Étape 13 — Charge les scènes narratives associées au sommaire courant d'un projet,
 * groupées par chapitre.
 */
export function useNarrativeScenes(projectId: string | null, outlineId: string | null) {
  const [scenesByChapter, setScenesByChapter] = useState<Record<string, NarrativeSceneRow[]>>({});
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId || !outlineId) {
      setScenesByChapter({});
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("narrative_scenes")
        .select("*")
        .eq("project_id", projectId)
        .eq("outline_id", outlineId)
        .order("scene_order", { ascending: true });
      if (error) throw error;
      const grouped: Record<string, NarrativeSceneRow[]> = {};
      for (const row of (data ?? []) as any[]) {
        const r: NarrativeSceneRow = {
          ...row,
          characters: Array.isArray(row.characters) ? row.characters : [],
          locations: Array.isArray(row.locations) ? row.locations : [],
          objects: Array.isArray(row.objects) ? row.objects : [],
          scene_context: (row.scene_context ?? null) as any,
        };
        (grouped[r.chapter_id] ||= []).push(r);
      }
      setScenesByChapter(grouped);
    } catch (e) {
      console.error("[useNarrativeScenes] load", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, outlineId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateScene = useCallback(
    async (sceneId: string, patch: Partial<NarrativeSceneRow>) => {
      const { error } = await supabase
        .from("narrative_scenes")
        .update(patch as any)
        .eq("id", sceneId);
      if (error) throw error;
      await reload();
    },
    [reload],
  );

  const deleteScene = useCallback(
    async (sceneId: string) => {
      const { error } = await supabase
        .from("narrative_scenes")
        .delete()
        .eq("id", sceneId);
      if (error) throw error;
      await reload();
    },
    [reload],
  );

  return { scenesByChapter, loading, reload, updateScene, deleteScene };
}