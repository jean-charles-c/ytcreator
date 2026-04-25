import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StoryPitch {
  id: string;
  pitch_batch_id: string;
  pitch_order: number;
  title: string;
  theme: string | null;
  concept: string | null;
  angle: string | null;
  point_of_view: string | null;
  central_tension: string | null;
  narrative_promise: string | null;
  progression: string | null;
  twists: string[] | null;
  dominant_emotion: string | null;
  tone: string | null;
  target_audience: string | null;
  estimated_format: string | null;
  form_compliance_justification: string | null;
  status: string;
  created_at: string;
}

export interface PitchBatch {
  id: string;
  batch_index: number;
  analysis_id: string | null;
  form_id: string | null;
  instructions: string | null;
  ai_model: string | null;
  status: string;
  created_at: string;
  pitches: StoryPitch[];
}

interface UseStoryPitchBatchesOptions {
  analysisId?: string | null;
  formId?: string | null;
}

/**
 * Étape 10 — Charge tous les lots de pitchs liés à une analyse OU à une forme.
 * L'historique est conservé : un nouveau lot vient s'ajouter, jamais remplacer.
 */
export function useStoryPitchBatches({ analysisId, formId }: UseStoryPitchBatchesOptions) {
  const [batches, setBatches] = useState<PitchBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!analysisId && !formId) {
      setBatches([]);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from("pitch_batches")
        .select("*")
        .order("batch_index", { ascending: true });
      if (formId) query = query.eq("form_id", formId);
      else if (analysisId) query = query.eq("analysis_id", analysisId);

      const { data: batchRows, error } = await query;
      if (error) throw error;
      const ids = (batchRows ?? []).map((b: any) => b.id);
      if (ids.length === 0) {
        setBatches([]);
        return;
      }
      const { data: pitchRows, error: pErr } = await supabase
        .from("story_pitches")
        .select("*")
        .in("pitch_batch_id", ids)
        .order("pitch_order", { ascending: true });
      if (pErr) throw pErr;

      const pitchesByBatch = new Map<string, StoryPitch[]>();
      (pitchRows ?? []).forEach((p: any) => {
        const list = pitchesByBatch.get(p.pitch_batch_id) ?? [];
        list.push(p as StoryPitch);
        pitchesByBatch.set(p.pitch_batch_id, list);
      });

      setBatches(
        (batchRows ?? []).map((b: any) => ({
          ...b,
          pitches: pitchesByBatch.get(b.id) ?? [],
        })),
      );
    } catch (e) {
      console.error("[useStoryPitchBatches] load", e);
    } finally {
      setLoading(false);
    }
  }, [analysisId, formId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { batches, loading, reload };
}
