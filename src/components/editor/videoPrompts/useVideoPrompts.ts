/**
 * useVideoPrompts — Persistent CRUD hook for VideoPrompts, Variants, and Profiles.
 * Reads/writes to Supabase tables: video_prompts, video_prompt_variants, video_settings_profiles.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type {
  VideoPrompt,
  Variant,
  SettingsProfile,
  VideoPromptsState,
  VideoPromptSource,
  AspectRatio,
  CameraMovement,
  SceneMotion,
} from "./types";

// ── DB row → domain model mappers ────────────────────────────────

function rowToPrompt(row: any): VideoPrompt {
  return {
    id: row.id,
    projectId: row.project_id,
    source: row.source as VideoPromptSource,
    sourceShotId: row.source_shot_id ?? null,
    sourceSceneId: row.source_scene_id ?? null,
    order: row.display_order,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    narrativeFragment: row.narrative_fragment,
    sceneTitle: row.scene_title,
    durationSec: row.duration_sec,
    aspectRatio: row.aspect_ratio as AspectRatio,
    style: row.style,
    cameraMovement: row.camera_movement as CameraMovement,
    sceneMotion: row.scene_motion as SceneMotion,
    mood: row.mood,
    renderConstraints: row.render_constraints,
    profileId: row.profile_id ?? null,
    status: row.status as any,
    isManuallyEdited: row.is_manually_edited ?? false,
    variantIds: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToVariant(row: any): Variant {
  return {
    id: row.id,
    parentId: row.parent_id,
    label: row.label,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    overrides: row.overrides ?? {},
    createdAt: row.created_at,
  };
}

function rowToProfile(row: any): SettingsProfile {
  return {
    id: row.id,
    name: row.name,
    defaults: {
      durationSec: row.duration_sec,
      aspectRatio: row.aspect_ratio as AspectRatio,
      style: row.style,
      cameraMovement: row.camera_movement as CameraMovement,
      sceneMotion: row.scene_motion as SceneMotion,
      mood: row.mood,
      renderConstraints: row.render_constraints,
      negativePrompt: row.negative_prompt,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Hook ─────────────────────────────────────────────────────────

export function useVideoPrompts(projectId: string) {
  const { user } = useAuth();
  const userId = user?.id;

  const [prompts, setPrompts] = useState<VideoPrompt[]>([]);
  const [variants, setVariants] = useState<Map<string, Variant[]>>(new Map());
  const [profiles, setProfiles] = useState<SettingsProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  // ── Load from DB ────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [promptsRes, variantsRes, profilesRes] = await Promise.all([
        supabase
          .from("video_prompts")
          .select("*")
          .eq("project_id", projectId)
          .order("display_order"),
        supabase
          .from("video_prompt_variants")
          .select("*")
          .eq("user_id", userId),
        supabase
          .from("video_settings_profiles")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at"),
      ]);

      const loadedPrompts = (promptsRes.data ?? []).map(rowToPrompt);

      // Map variants to their parent prompts
      const variantMap = new Map<string, Variant[]>();
      for (const row of variantsRes.data ?? []) {
        const v = rowToVariant(row);
        const list = variantMap.get(v.parentId) ?? [];
        list.push(v);
        variantMap.set(v.parentId, list);
      }

      // Attach variant IDs to prompts
      for (const p of loadedPrompts) {
        p.variantIds = (variantMap.get(p.id) ?? []).map((v) => v.id);
      }

      const loadedProfiles = (profilesRes.data ?? []).map(rowToProfile);
      const defaultProfile = loadedProfiles.find((p) => (p as any).is_default) ?? loadedProfiles[0];

      setPrompts(loadedPrompts);
      setVariants(variantMap);
      setProfiles(loadedProfiles);
      setActiveProfileId(defaultProfile?.id ?? null);
    } catch (err) {
      console.error("useVideoPrompts load error:", err);
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, [userId, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Prompt CRUD ─────────────────────────────────────────────────

  const insertPrompt = useCallback(
    async (prompt: VideoPrompt): Promise<VideoPrompt | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("video_prompts")
        .insert({
          id: prompt.id,
          user_id: userId,
          project_id: projectId,
          source: prompt.source,
          source_shot_id: prompt.sourceShotId,
          source_scene_id: prompt.sourceSceneId,
          display_order: prompt.order,
          prompt: prompt.prompt,
          negative_prompt: prompt.negativePrompt,
          narrative_fragment: prompt.narrativeFragment,
          scene_title: prompt.sceneTitle,
          duration_sec: prompt.durationSec,
          aspect_ratio: prompt.aspectRatio,
          style: prompt.style,
          camera_movement: prompt.cameraMovement,
          scene_motion: prompt.sceneMotion,
          mood: prompt.mood,
          render_constraints: prompt.renderConstraints,
          profile_id: prompt.profileId,
          status: prompt.status,
          is_manually_edited: (prompt as any).isManuallyEdited ?? false,
        })
        .select()
        .single();
      if (error) {
        console.error("Insert prompt error:", error);
        return null;
      }
      const created = rowToPrompt(data);
      setPrompts((prev) => [...prev, created]);
      return created;
    },
    [userId, projectId],
  );

  const insertManyPrompts = useCallback(
    async (newPrompts: VideoPrompt[]): Promise<void> => {
      if (!userId || newPrompts.length === 0) return;
      const rows = newPrompts.map((p) => ({
        id: p.id,
        user_id: userId,
        project_id: projectId,
        source: p.source,
        source_shot_id: p.sourceShotId,
        source_scene_id: p.sourceSceneId,
        display_order: p.order,
        prompt: p.prompt,
        negative_prompt: p.negativePrompt,
        narrative_fragment: p.narrativeFragment,
        scene_title: p.sceneTitle,
        duration_sec: p.durationSec,
        aspect_ratio: p.aspectRatio,
        style: p.style,
        camera_movement: p.cameraMovement,
        scene_motion: p.sceneMotion,
        mood: p.mood,
        render_constraints: p.renderConstraints,
        profile_id: p.profileId,
        status: p.status,
        is_manually_edited: (p as any).isManuallyEdited ?? false,
      }));
      const { data, error } = await supabase
        .from("video_prompts")
        .insert(rows)
        .select();
      if (error) {
        console.error("Insert many prompts error:", error);
        toast.error("Erreur lors de l'import");
        return;
      }
      const created = (data ?? []).map(rowToPrompt);
      setPrompts((prev) => [...prev, ...created]);
    },
    [userId, projectId],
  );

  const updatePrompt = useCallback(
    async (id: string, patch: Partial<VideoPrompt>): Promise<void> => {
      const dbPatch: any = {};
      if (patch.prompt !== undefined) dbPatch.prompt = patch.prompt;
      if (patch.negativePrompt !== undefined) dbPatch.negative_prompt = patch.negativePrompt;
      if (patch.durationSec !== undefined) dbPatch.duration_sec = patch.durationSec;
      if (patch.aspectRatio !== undefined) dbPatch.aspect_ratio = patch.aspectRatio;
      if (patch.style !== undefined) dbPatch.style = patch.style;
      if (patch.cameraMovement !== undefined) dbPatch.camera_movement = patch.cameraMovement;
      if (patch.sceneMotion !== undefined) dbPatch.scene_motion = patch.sceneMotion;
      if (patch.mood !== undefined) dbPatch.mood = patch.mood;
      if (patch.renderConstraints !== undefined) dbPatch.render_constraints = patch.renderConstraints;
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.profileId !== undefined) dbPatch.profile_id = patch.profileId;
      if (patch.order !== undefined) dbPatch.display_order = patch.order;
      if ((patch as any).isManuallyEdited !== undefined) dbPatch.is_manually_edited = (patch as any).isManuallyEdited;
      dbPatch.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from("video_prompts")
        .update(dbPatch)
        .eq("id", id);
      if (error) {
        console.error("Update prompt error:", error);
        return;
      }

      setPrompts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: dbPatch.updated_at } : p,
        ),
      );
    },
    [],
  );

  const deletePrompt = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from("video_prompts").delete().eq("id", id);
    if (error) console.error("Delete prompt error:", error);
    setPrompts((prev) => prev.filter((p) => p.id !== id));
    setVariants((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const deleteManyPrompts = useCallback(async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const { error } = await supabase.from("video_prompts").delete().in("id", ids);
    if (error) console.error("Delete many prompts error:", error);
    const idSet = new Set(ids);
    setPrompts((prev) => prev.filter((p) => !idSet.has(p.id)));
    setVariants((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const replaceAllPrompts = useCallback(
    async (newPrompts: VideoPrompt[]): Promise<void> => {
      if (!userId) return;
      // Delete existing prompts for this project
      await supabase.from("video_prompts").delete().eq("project_id", projectId);
      // Insert new ones
      await insertManyPrompts(newPrompts);
      setVariants(new Map());
    },
    [userId, projectId, insertManyPrompts],
  );

  // ── Variant CRUD ────────────────────────────────────────────────

  const insertVariant = useCallback(
    async (parentId: string, variant: Variant): Promise<void> => {
      if (!userId) return;
      const { data, error } = await supabase
        .from("video_prompt_variants")
        .insert({
          id: variant.id,
          user_id: userId,
          parent_id: parentId,
          label: variant.label,
          prompt: variant.prompt,
          negative_prompt: variant.negativePrompt,
          overrides: variant.overrides,
        })
        .select()
        .single();
      if (error) {
        console.error("Insert variant error:", error);
        return;
      }
      const created = rowToVariant(data);
      setVariants((prev) => {
        const next = new Map(prev);
        const list = next.get(parentId) ?? [];
        next.set(parentId, [...list, created]);
        return next;
      });
      setPrompts((prev) =>
        prev.map((p) =>
          p.id === parentId ? { ...p, variantIds: [...p.variantIds, created.id] } : p,
        ),
      );
    },
    [userId],
  );

  const deleteVariant = useCallback(async (parentId: string, variantId: string): Promise<void> => {
    await supabase.from("video_prompt_variants").delete().eq("id", variantId);
    setVariants((prev) => {
      const next = new Map(prev);
      const list = (next.get(parentId) ?? []).filter((v) => v.id !== variantId);
      next.set(parentId, list);
      return next;
    });
    setPrompts((prev) =>
      prev.map((p) =>
        p.id === parentId ? { ...p, variantIds: p.variantIds.filter((vid) => vid !== variantId) } : p,
      ),
    );
  }, []);

  // ── Profile CRUD ────────────────────────────────────────────────

  const insertProfile = useCallback(
    async (profile: SettingsProfile): Promise<SettingsProfile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("video_settings_profiles")
        .insert({
          id: profile.id,
          user_id: userId,
          project_id: projectId,
          name: profile.name,
          duration_sec: profile.defaults.durationSec,
          aspect_ratio: profile.defaults.aspectRatio,
          style: profile.defaults.style,
          camera_movement: profile.defaults.cameraMovement,
          scene_motion: profile.defaults.sceneMotion,
          mood: profile.defaults.mood,
          render_constraints: profile.defaults.renderConstraints,
          negative_prompt: profile.defaults.negativePrompt,
        })
        .select()
        .single();
      if (error) {
        console.error("Insert profile error:", error);
        return null;
      }
      const created = rowToProfile(data);
      setProfiles((prev) => [...prev, created]);
      return created;
    },
    [userId, projectId],
  );

  const updateProfile = useCallback(
    async (id: string, patch: Partial<SettingsProfile>): Promise<void> => {
      const dbPatch: any = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.defaults) {
        const d = patch.defaults;
        if (d.durationSec !== undefined) dbPatch.duration_sec = d.durationSec;
        if (d.aspectRatio !== undefined) dbPatch.aspect_ratio = d.aspectRatio;
        if (d.style !== undefined) dbPatch.style = d.style;
        if (d.cameraMovement !== undefined) dbPatch.camera_movement = d.cameraMovement;
        if (d.sceneMotion !== undefined) dbPatch.scene_motion = d.sceneMotion;
        if (d.mood !== undefined) dbPatch.mood = d.mood;
        if (d.renderConstraints !== undefined) dbPatch.render_constraints = d.renderConstraints;
        if (d.negativePrompt !== undefined) dbPatch.negative_prompt = d.negativePrompt;
      }
      const { error } = await supabase.from("video_settings_profiles").update(dbPatch).eq("id", id);
      if (error) console.error("Update profile error:", error);
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: dbPatch.updated_at } : p)),
      );
    },
    [],
  );

  const deleteProfile = useCallback(async (id: string): Promise<void> => {
    await supabase.from("video_settings_profiles").delete().eq("id", id);
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    setActiveProfileId((prev) => (prev === id ? null : prev));
  }, []);

  // ── State object for compatibility ─────────────────────────────

  const state: VideoPromptsState = {
    prompts,
    variants,
    profiles,
    activeProfileId,
  };

  return {
    state,
    loading,
    // Prompts
    insertPrompt,
    insertManyPrompts,
    updatePrompt,
    deletePrompt,
    deleteManyPrompts,
    replaceAllPrompts,
    // Variants
    insertVariant,
    deleteVariant,
    // Profiles
    insertProfile,
    updateProfile,
    deleteProfile,
    activeProfileId,
    setActiveProfileId,
    // Reload
    reload: load,
  };
}
