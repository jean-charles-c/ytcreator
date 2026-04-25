import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VoiceoverScriptRow {
  id: string;
  user_id: string;
  project_id: string;
  outline_id: string | null;
  pitch_id: string | null;
  form_id: string | null;
  ai_model: string | null;
  title: string | null;
  content: string;
  status: string;
  word_count: number;
  estimated_duration_seconds: number | null;
  generation_index: number;
  sent_to_scriptcreator_at: string | null;
  sent_to_segmentation_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Étape 14 — Charge le dernier script voix off d'un projet (par outline).
 */
export function useVoiceoverScript(projectId: string | null, outlineId: string | null) {
  const [script, setScript] = useState<VoiceoverScriptRow | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId || !outlineId) {
      setScript(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("voiceover_scripts")
        .select("*")
        .eq("project_id", projectId)
        .eq("outline_id", outlineId)
        .order("generation_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setScript((data as any) ?? null);
    } catch (e) {
      console.error("[useVoiceoverScript] load", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, outlineId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { script, loading, reload };
}