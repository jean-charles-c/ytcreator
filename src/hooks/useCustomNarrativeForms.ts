import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CustomNarrativeForm {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  analysis_id: string | null;
  narrative_signature: any;
  created_at: string;
  updated_at: string;
}

/**
 * Étape 9 — Gestion des formes narratives personnalisées (CRUD).
 * Adossé à la table `narrative_forms` (RLS user_id = auth.uid()).
 */
export function useCustomNarrativeForms() {
  const [forms, setForms] = useState<CustomNarrativeForm[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("narrative_forms")
      .select("id, name, description, system_prompt, analysis_id, narrative_signature, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[useCustomNarrativeForms] load", error);
      setForms([]);
    } else {
      setForms((data ?? []) as CustomNarrativeForm[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const createForm = useCallback(
    async (input: {
      name: string;
      description?: string;
      system_prompt: string;
      analysis_id?: string | null;
      narrative_signature?: any;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Non authentifié");
      const { data, error } = await supabase
        .from("narrative_forms")
        .insert({
          user_id: uid,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          system_prompt: input.system_prompt,
          analysis_id: input.analysis_id ?? null,
          narrative_signature: input.narrative_signature ?? {},
          status: "narrative_form_saved",
        })
        .select()
        .single();
      if (error) throw error;
      await reload();
      return data as CustomNarrativeForm;
    },
    [reload],
  );

  const updateForm = useCallback(
    async (id: string, patch: { name?: string; description?: string | null }) => {
      const update: any = {};
      if (typeof patch.name === "string") update.name = patch.name.trim();
      if (typeof patch.description !== "undefined") {
        update.description = patch.description ? patch.description.trim() : null;
      }
      if (Object.keys(update).length === 0) return;
      const { error } = await supabase.from("narrative_forms").update(update).eq("id", id);
      if (error) throw error;
      await reload();
    },
    [reload],
  );

  const deleteForm = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("narrative_forms").delete().eq("id", id);
      if (error) throw error;
      await reload();
    },
    [reload],
  );

  return { forms, loading, reload, createForm, updateForm, deleteForm };
}
