import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { StoryPitch } from "@/hooks/useStoryPitchBatches";
import { buildCustomFormPrompt, buildNarrativeSignature } from "@/components/editor/narrativeWorkflow/buildCustomFormPrompt";
import type { AnalysisPayload } from "@/components/editor/narrativeWorkflow/NarrativeAnalysisPanel";

export interface GeneratedProjectRow {
  id: string;
  user_id: string;
  project_id: string;
  pitch_id: string | null;
  analysis_id: string | null;
  form_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface GeneratedProjectFull extends GeneratedProjectRow {
  project_title: string | null;
  pitch_title: string | null;
  form_name: string | null;
}

interface CreateFromPitchInput {
  pitch: StoryPitch;
  analysisId: string | null;
  /** Forme narrative existante éventuellement déjà sauvegardée. */
  existingFormId?: string | null;
  /**
   * Si aucune forme existante n'est fournie, on en crée une figée
   * à partir de l'analyse pour garder une copie immuable.
   */
  analysis?: AnalysisPayload | null;
}

/**
 * Étape 11 — Création de projets séparés depuis les pitchs.
 *
 * Chaque sélection crée un projet `projects` distinct + un lien
 * `generated_projects` qui fige la forme narrative et l'analyse source.
 * Aucun écrasement : sélectionner un autre pitch = nouveau projet.
 */
export function useGeneratedProjectsByAnalysis(analysisId?: string | null) {
  const [items, setItems] = useState<GeneratedProjectFull[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!analysisId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("generated_projects")
        .select("*")
        .eq("analysis_id", analysisId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as GeneratedProjectRow[];
      if (rows.length === 0) {
        setItems([]);
        return;
      }
      const projectIds = Array.from(new Set(rows.map((r) => r.project_id)));
      const pitchIds = Array.from(new Set(rows.map((r) => r.pitch_id).filter(Boolean) as string[]));
      const formIds = Array.from(new Set(rows.map((r) => r.form_id).filter(Boolean) as string[]));

      const [{ data: projects }, { data: pitches }, { data: forms }] = await Promise.all([
        supabase.from("projects").select("id, title").in("id", projectIds),
        pitchIds.length
          ? supabase.from("story_pitches").select("id, title").in("id", pitchIds)
          : Promise.resolve({ data: [] as any[] }),
        formIds.length
          ? supabase.from("narrative_forms").select("id, name").in("id", formIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const projMap = new Map((projects ?? []).map((p: any) => [p.id, p.title as string]));
      const pitchMap = new Map((pitches ?? []).map((p: any) => [p.id, p.title as string]));
      const formMap = new Map((forms ?? []).map((f: any) => [f.id, f.name as string]));

      setItems(
        rows.map((r) => ({
          ...r,
          project_title: projMap.get(r.project_id) ?? null,
          pitch_title: r.pitch_id ? pitchMap.get(r.pitch_id) ?? null : null,
          form_name: r.form_id ? formMap.get(r.form_id) ?? null : null,
        })),
      );
    } catch (e) {
      console.error("[useGeneratedProjectsByAnalysis] load", e);
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, reload };
}

/** Crée un nouveau projet à partir d'un pitch + l'enregistre dans generated_projects. */
export async function createProjectFromPitch(
  input: CreateFromPitchInput,
): Promise<{ project_id: string; generated_id: string; form_id: string | null }> {
  const { pitch, analysisId, existingFormId, analysis } = input;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Non authentifié");

  // 1) Si pas de forme existante, on en fige une à partir de l'analyse
  let formId: string | null = existingFormId ?? null;
  if (!formId && analysis) {
    const system_prompt = buildCustomFormPrompt(analysis, "");
    const narrative_signature = buildNarrativeSignature(analysis, "");
    const formName = `Forme figée — ${pitch.title.slice(0, 60)}`;
    const { data: formRow, error: formErr } = await supabase
      .from("narrative_forms")
      .insert({
        user_id: uid,
        name: formName,
        description: `Snapshot automatique pour le projet « ${pitch.title} »`,
        system_prompt,
        analysis_id: analysisId,
        narrative_signature,
        status: "narrative_form_saved",
      })
      .select("id")
      .single();
    if (formErr) throw formErr;
    formId = formRow!.id;
  }

  // 2) Création du projet
  const subjectParts = [pitch.theme, pitch.concept].filter(Boolean).join(" — ");
  const narrationParts = [pitch.angle, pitch.narrative_promise].filter(Boolean).join("\n\n");
  const { data: projectRow, error: projErr } = await supabase
    .from("projects")
    .insert({
      user_id: uid,
      title: pitch.title,
      subject: subjectParts || null,
      script_language: "fr",
      narration: narrationParts || null,
      status: "draft",
    })
    .select("id")
    .single();
  if (projErr) throw projErr;

  // 3) Lien generated_projects
  const { data: linkRow, error: linkErr } = await supabase
    .from("generated_projects")
    .insert({
      user_id: uid,
      project_id: projectRow!.id,
      pitch_id: pitch.id,
      analysis_id: analysisId,
      form_id: formId,
      status: "project_created",
    })
    .select("id")
    .single();
  if (linkErr) throw linkErr;

  return { project_id: projectRow!.id, generated_id: linkRow!.id, form_id: formId };
}
