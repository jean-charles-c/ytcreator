import { useState, useMemo, useCallback } from "react";
import {
  Film,
  Import,
  PlusCircle,
  Globe,
  User,
  Layers,
  Camera,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { buildManifest } from "./visualPromptTypes";
import VideoPromptSourcePanel from "./videoPrompts/VideoPromptSourcePanel";
import VideoPromptCard from "./videoPrompts/VideoPromptCard";
import VideoPromptEditor from "./videoPrompts/VideoPromptEditor";
import BatchActionBar from "./videoPrompts/BatchActionBar";
import type { SourceScene } from "./videoPrompts/VideoPromptSourcePanel";
import type { VideoPrompt, VideoPromptSource } from "./videoPrompts/types";
import { useVideoPrompts } from "./videoPrompts/useVideoPrompts";
import { useRenderJobs } from "./videoPrompts/useRenderJobs";
import { mapFromVisualPrompts, mapFromScene, mapFromShot } from "./videoPrompts/mapper";

type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

interface VideoPromptsTabProps {
  projectId: string;
  scenes: Scene[];
  shots: Shot[];
}

export default function VideoPromptsTab({
  projectId,
  scenes,
  shots,
}: VideoPromptsTabProps) {
  const {
    state,
    loading,
    insertManyPrompts,
    replaceAllPrompts,
    updatePrompt,
    deletePrompt,
    deleteManyPrompts,
    insertProfile,
    // profiles
  } = useVideoPrompts(projectId);

  const {
    submit: submitRender,
    submitting: renderSubmitting,
    getJobForPrompt,
    activeJobCount,
  } = useRenderJobs(projectId);

  const [activeSource, setActiveSource] = useState<VideoPromptSource>("visual-prompts");
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const manifest = useMemo(
    () => buildManifest(projectId, scenes, shots),
    [projectId, scenes, shots],
  );

  const hasVisualPrompts = manifest.totalShots > 0;
  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
  const selectedPrompt = state.prompts.find((p) => p.id === selectedPromptId) ?? null;

  const sourceScenes: SourceScene[] = useMemo(
    () =>
      manifest.scenes.map((s) => ({
        sceneId: s.sceneId,
        title: s.title,
        sceneOrder: s.sceneOrder,
        shots: s.shots
          .filter((sh) => sh.status === "active")
          .map((sh) => {
            const frag = s.fragments.find((f) => f.shotId === sh.shotId);
            return {
              shotId: sh.shotId,
              sceneId: s.sceneId,
              localOrder: sh.localOrder,
              globalOrder: sh.globalOrder,
              description: sh.description,
              narrativeFragment: frag?.text ?? "",
            };
          }),
      })),
    [manifest],
  );

  // ── Handlers ───────────────────────────────────────────────────

  const handleImportAll = useCallback(async () => {
    const profile = activeProfile;
    const newPrompts = mapFromVisualPrompts(projectId, manifest.scenes, profile);
    await replaceAllPrompts(newPrompts);
    toast.success(`${newPrompts.length} prompts vidéo importés`);
    setCheckedIds(new Set());
  }, [manifest, projectId, activeProfile, replaceAllPrompts]);

  const handleImportScene = useCallback(
    async (sceneId: string) => {
      const normScene = manifest.scenes.find((s) => s.sceneId === sceneId);
      if (!normScene) return;
      const startOrder = state.prompts.length + 1;
      const newPrompts = mapFromScene(projectId, normScene, startOrder, activeProfile);
      await insertManyPrompts(newPrompts);
      toast.success(`${newPrompts.length} prompt(s) importé(s)`);
    },
    [manifest, projectId, state.prompts.length, activeProfile, insertManyPrompts],
  );

  const handleImportShot = useCallback(
    async (shotId: string, sceneId: string) => {
      const normScene = manifest.scenes.find((s) => s.sceneId === sceneId);
      const normShot = normScene?.shots.find((sh) => sh.shotId === shotId);
      if (!normScene || !normShot) return;
      const order = state.prompts.length + 1;
      const prompt = mapFromShot(projectId, normShot, normScene, order, activeProfile);
      await insertManyPrompts([prompt]);
      toast.success("Prompt vidéo importé");
    },
    [manifest, projectId, state.prompts.length, activeProfile, insertManyPrompts],
  );

  const handleCreateManual = useCallback(async () => {
    const prompt: VideoPrompt = {
      id: crypto.randomUUID(),
      projectId,
      source: "manual",
      sourceShotId: null,
      sourceSceneId: null,
      order: state.prompts.length + 1,
      prompt: "",
      negativePrompt: activeProfile?.defaults.negativePrompt ?? "",
      narrativeFragment: "",
      sceneTitle: "",
      durationSec: activeProfile?.defaults.durationSec ?? 5,
      aspectRatio: activeProfile?.defaults.aspectRatio ?? "16:9",
      style: activeProfile?.defaults.style ?? "cinematic",
      cameraMovement: activeProfile?.defaults.cameraMovement ?? "static",
      sceneMotion: activeProfile?.defaults.sceneMotion ?? "moderate",
      mood: activeProfile?.defaults.mood ?? "",
      renderConstraints: activeProfile?.defaults.renderConstraints ?? "",
      profileId: activeProfile?.id ?? null,
      status: "draft",
      isManuallyEdited: false,
      variantIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await insertManyPrompts([prompt]);
    setSelectedPromptId(prompt.id);
    toast.success("Prompt vidéo manuel créé");
  }, [projectId, state.prompts.length, activeProfile, insertManyPrompts]);

  const handleUpdatePrompt = useCallback(
    async (patch: Partial<VideoPrompt>) => {
      if (!selectedPromptId) return;
      await updatePrompt(selectedPromptId, { ...patch, isManuallyEdited: true } as any);
    },
    [selectedPromptId, updatePrompt],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      const source = state.prompts.find((p) => p.id === id);
      if (!source) return;
      const dup: VideoPrompt = {
        ...source,
        id: crypto.randomUUID(),
        order: state.prompts.length + 1,
        status: "draft",
        isManuallyEdited: false,
        variantIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await insertManyPrompts([dup]);
      toast.success("Prompt dupliqué");
    },
    [state.prompts, insertManyPrompts],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deletePrompt(id);
      if (selectedPromptId === id) setSelectedPromptId(null);
      setCheckedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      toast.success("Prompt supprimé");
    },
    [selectedPromptId, deletePrompt],
  );

  // ── Checkbox / Batch ───────────────────────────────────────────

  const handleCheckChange = useCallback((id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setCheckedIds(new Set(state.prompts.map((p) => p.id)));
  }, [state.prompts]);

  const handleClearSelection = useCallback(() => {
    setCheckedIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(checkedIds);
    await deleteManyPrompts(ids);
    if (selectedPromptId && checkedIds.has(selectedPromptId)) {
      setSelectedPromptId(null);
    }
    toast.success(`${ids.length} prompt(s) supprimé(s)`);
    setCheckedIds(new Set());
  }, [checkedIds, selectedPromptId, deleteManyPrompts]);

  const handleApplyProfile = useCallback(
    async (profileId: string) => {
      const profile = state.profiles.find((p) => p.id === profileId);
      if (!profile) return;
      for (const id of checkedIds) {
        await updatePrompt(id, {
          durationSec: profile.defaults.durationSec,
          aspectRatio: profile.defaults.aspectRatio,
          style: profile.defaults.style,
          cameraMovement: profile.defaults.cameraMovement,
          sceneMotion: profile.defaults.sceneMotion,
          mood: profile.defaults.mood,
          renderConstraints: profile.defaults.renderConstraints,
          negativePrompt: profile.defaults.negativePrompt,
          profileId: profile.id,
        });
      }
      toast.success(`Profil appliqué à ${checkedIds.size} prompt(s)`);
    },
    [checkedIds, state.profiles, updatePrompt],
  );

  const handleExportSelected = useCallback(() => {
    const selected = state.prompts.filter((p) => checkedIds.has(p.id));
    const json = JSON.stringify(selected, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `video-prompts-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${selected.length} prompt(s) exporté(s)`);
  }, [state.prompts, checkedIds]);

  // ── Render actions ─────────────────────────────────────────────

  const handleRenderSingle = useCallback(
    async (promptId: string) => {
      const prompt = state.prompts.find((p) => p.id === promptId);
      if (!prompt) return;
      if (prompt.status !== "ready" && prompt.status !== "draft") {
        toast.error("Ce prompt doit être en statut draft ou ready");
        return;
      }
      await submitRender([prompt]);
    },
    [state.prompts, submitRender],
  );

  const handleRenderSelected = useCallback(async () => {
    const selected = state.prompts.filter((p) => checkedIds.has(p.id));
    if (selected.length === 0) return;
    await submitRender(selected);
  }, [state.prompts, checkedIds, submitRender]);

  const isEmpty = state.prompts.length === 0;
  const sceneCount = manifest.scenes.length;
  const shotCount = manifest.totalShots;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Chargement des prompts vidéo…</span>
      </div>
    );
  }

  return (
    <div className="py-4 sm:py-6 px-4 animate-fade-in" style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* ── Context header ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground">
            VideoPrompts
          </h2>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded">
            <Layers className="h-3 w-3" />
            {sceneCount} scène{sceneCount > 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded">
            <Camera className="h-3 w-3" />
            {shotCount} shot{shotCount > 1 ? "s" : ""}
          </span>
          {state.prompts.length > 0 && (
            <span className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded">
              <Film className="h-3 w-3" />
              {state.prompts.length} prompt{state.prompts.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {activeProfile?.name ?? "Aucun profil"}
          </span>
          <span className="flex items-center gap-1">
            <Globe className="h-3 w-3" />
            {scenes[0]?.source_text_fr ? "EN + FR" : "EN"}
          </span>
        </div>
      </div>

      {/* ── 3-column layout ───────────────────────────────────────── */}
      <div className="flex gap-3" style={{ minHeight: "calc(100vh - 200px)" }}>
        {/* Col 1: Source panel */}
        <div className="w-56 shrink-0 rounded-lg border border-border overflow-hidden hidden lg:flex flex-col">
          <VideoPromptSourcePanel
            scenes={sourceScenes}
            activeSource={activeSource}
            onSourceChange={setActiveSource}
            selectedSceneId={selectedSceneId}
            selectedShotId={selectedShotId}
            onSelectScene={(id) => { setSelectedSceneId(id); setSelectedShotId(null); }}
            onSelectShot={(shotId, sceneId) => { setSelectedShotId(shotId); setSelectedSceneId(sceneId); }}
            onImportAll={handleImportAll}
            onImportScene={handleImportScene}
            onImportShot={handleImportShot}
            hasVisualPrompts={hasVisualPrompts}
          />
        </div>

        {/* Col 2: Prompt list */}
        <div className="flex-1 min-w-0 flex flex-col">
          {isEmpty ? (
            <Card className="border-dashed border-2 border-border bg-secondary/20 flex-1">
              <CardContent className="flex flex-col items-center justify-center h-full py-16 gap-6 text-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <Film className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2 max-w-md">
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    Aucun prompt vidéo
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Sélectionnez une source à gauche pour importer du contexte,
                    ou créez manuellement vos premiers prompts vidéo.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  {hasVisualPrompts && (
                    <Button variant="default" onClick={handleImportAll} className="min-h-[44px]">
                      <Import className="h-4 w-4" />
                      Importer depuis VisualPrompts
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleCreateManual} className="min-h-[44px]">
                    <PlusCircle className="h-4 w-4" />
                    Créer manuellement
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2 shrink-0">
                <p className="text-xs text-muted-foreground">
                  {state.prompts.length} prompt{state.prompts.length > 1 ? "s" : ""} vidéo
                </p>
                <Button variant="outline" size="sm" onClick={handleCreateManual} className="h-7 text-xs">
                  <PlusCircle className="h-3 w-3" />
                  Ajouter
                </Button>
              </div>
              <div className="space-y-1.5 flex-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
                {state.prompts.map((vp) => (
                  <VideoPromptCard
                    key={vp.id}
                    prompt={vp}
                    isSelected={vp.id === selectedPromptId}
                    isChecked={checkedIds.has(vp.id)}
                    onClick={() => setSelectedPromptId(vp.id)}
                    onCheckChange={(checked) => handleCheckChange(vp.id, checked)}
                    onDuplicate={() => handleDuplicate(vp.id)}
                    onDelete={() => handleDelete(vp.id)}
                  />
                ))}
              </div>

              {/* Batch action bar */}
              <BatchActionBar
                selectedCount={checkedIds.size}
                totalCount={state.prompts.length}
                profiles={state.profiles}
                onApplyProfile={handleApplyProfile}
                onDeleteSelected={handleDeleteSelected}
                onExportSelected={handleExportSelected}
                onSelectAll={handleSelectAll}
                onClearSelection={handleClearSelection}
              />
            </>
          )}
        </div>

        {/* Col 3: Editor panel */}
        <div className="w-80 shrink-0 rounded-lg border border-border overflow-hidden hidden md:flex flex-col bg-card">
          {selectedPrompt ? (
            <VideoPromptEditor
              prompt={selectedPrompt}
              onUpdate={handleUpdatePrompt}
              onDuplicate={() => handleDuplicate(selectedPrompt.id)}
              onDelete={() => handleDelete(selectedPrompt.id)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                Sélectionnez un prompt dans la liste pour l'éditer.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile actions */}
      <div className="lg:hidden mt-4 flex gap-2">
        {hasVisualPrompts && isEmpty && (
          <Button variant="default" size="sm" onClick={handleImportAll} className="flex-1 min-h-[44px]">
            <Import className="h-4 w-4" />
            Importer tout
          </Button>
        )}
        {isEmpty && (
          <Button variant="outline" size="sm" onClick={handleCreateManual} className="flex-1 min-h-[44px]">
            <PlusCircle className="h-4 w-4" />
            Manuel
          </Button>
        )}
      </div>
    </div>
  );
}
