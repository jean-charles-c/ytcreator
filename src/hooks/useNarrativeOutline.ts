import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NarrativeChapter {
  id: string;
  outline_id: string;
  chapter_order: number;
  title: string;
  summary: string | null;
  intention: string | null;
  structural_role: string | null;
  main_event: string | null;
  dramatic_tension: string | null;
  revelation: string | null;
  emotional_progression: string | null;
  transition_to_next: string | null;
  estimated_duration_seconds: number | null;
}

export interface NarrativeOutline {
  id: string;
  project_id: string;
  title: string | null;
  intention: string | null;
  target_duration_seconds: number | null;
  status: string;
  form_id: string | null;
  pitch_id: string | null;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface NarrativeOutlineFull {
  outline: NarrativeOutline;
  chapters: NarrativeChapter[];
  formName: string | null;
  pitchTitle: string | null;
}

/**
 * Étape 12 — Charge le sommaire narratif le plus récent d'un projet,
 * avec ses chapitres et le contexte (forme + pitch).
 */
export function useNarrativeOutline(projectId: string | null) {
  const [data, setData] = useState<NarrativeOutlineFull | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const { data: outlineRow, error: oErr } = await supabase
        .from("narrative_outlines")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (oErr) throw oErr;
      if (!outlineRow) {
        setData(null);
        return;
      }
      const outline = outlineRow as NarrativeOutline;
      const { data: chapters, error: cErr } = await supabase
        .from("narrative_chapters")
        .select("*")
        .eq("outline_id", outline.id)
        .order("chapter_order", { ascending: true });
      if (cErr) throw cErr;

      let formName: string | null = null;
      let pitchTitle: string | null = null;
      if (outline.form_id) {
        const { data: f } = await supabase
          .from("narrative_forms")
          .select("name")
          .eq("id", outline.form_id)
          .maybeSingle();
        formName = (f as any)?.name ?? null;
      }
      if (outline.pitch_id) {
        const { data: p } = await supabase
          .from("story_pitches")
          .select("title")
          .eq("id", outline.pitch_id)
          .maybeSingle();
        pitchTitle = (p as any)?.title ?? null;
      }

      setData({
        outline,
        chapters: (chapters ?? []) as NarrativeChapter[],
        formName,
        pitchTitle,
      });
    } catch (e) {
      console.error("[useNarrativeOutline] load", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, reload };
}