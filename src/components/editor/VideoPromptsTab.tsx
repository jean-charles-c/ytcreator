import { useState, useMemo, useCallback } from "react";
import {
  Film,
  Import,
  PlusCircle,
  Globe,
  User,
  Layers,
  Camera,
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
import type { VideoPrompt, VideoPromptSource, VideoPromptsState } from "./videoPrompts/types";
import { createInitialState, updatePrompt, deletePrompt } from "./videoPrompts/store";
import * as service from "./videoPrompts/service";
import { getActiveProfile } from "./videoPrompts/store";

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
  const [state, setState] = useState<VideoPromptsState>(createInitialState);
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
  const activeProfile = getActiveProfile(state);
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

  const handleImportAll = useCallback(() => {
    setState((prev) => {
      const next = service.importFromManifest(prev, manifest);
      toast.success(`${next.prompts.length} prompts vidéo importés`);
      return next;
    });
    setCheckedIds(new Set());
  }, [manifest]);

  const handleImportScene = useCallback(
    (sceneId: string) => {
      const normScene = manifest.scenes.find((s) => s.sceneId === sceneId);
      if (!normScene) return;
      setState((prev) => {
        const next = service.importScene(prev, projectId, normScene);
        const added = next.prompts.length - prev.prompts.length;
        toast.success(`${added} prompt(s) importé(s)`);
        return next;
      });
    },
    [manifest, projectId],
  );

  const handleImportShot = useCallback(
    (shotId: string, sceneId: string) => {
      const normScene = manifest.scenes.find((s) => s.sceneId === sceneId);
      const normShot = normScene?.shots.find((sh) => sh.shotId === shotId);
      if (!normScene || !normShot) return;
      setState((prev) => {
        const next = service.importShot(prev, projectId, normShot, normScene);
        toast.success("Prompt vidéo importé");
        return next;
      });
    },
    [manifest, projectId],
  );

  const handleCreateManual = useCallback(() => {
    setState((prev) => {
      const next = service.createManual(prev, projectId);
      const newPrompt = next.prompts[next.prompts.length - 1];
      setSelectedPromptId(newPrompt.id);
      toast.success("Prompt vidéo manuel créé");
      return next;
    });
  }, [projectId]);

  const handleUpdatePrompt = useCallback((patch: Partial<VideoPrompt>) => {
    if (!selectedPromptId) return;
    setState((prev) => updatePrompt(prev, selectedPromptId, patch));
  }, [selectedPromptId]);

  const handleDuplicate = useCallback((id: string) => {
    setState((prev) => {
      const source = prev.prompts.find((p) => p.id === id);
      if (!source) return prev;
      const dup: VideoPrompt = {
        ...source,
        id: crypto.randomUUID(),
        order: prev.prompts.length + 1,
        status: "draft",
        variantIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return { ...prev, prompts: [...prev.prompts, dup] };
    });
    toast.success("Prompt dupliqué");
  }, []);

  const handleDelete = useCallback((id: string) => {
    setState((prev) => deletePrompt(prev, id));
    if (selectedPromptId === id) setSelectedPromptId(null);
    setCheckedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    toast.success("Prompt supprimé");
  }, [selectedPromptId]);

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

  const handleDeleteSelected = useCallback(() => {
    setState((prev) => {
      let next = prev;
      for (const id of checkedIds) {
        next = deletePrompt(next, id);
      }
      return next;
    });
    if (selectedPromptId && checkedIds.has(selectedPromptId)) {
      setSelectedPromptId(null);
    }
    toast.success(`${checkedIds.size} prompt(s) supprimé(s)`);
    setCheckedIds(new Set());
  }, [checkedIds, selectedPromptId]);

  const handleApplyProfile = useCallback((profileId: string) => {
    setState((prev) => {
      let next = prev;
      const profile = prev.profiles.find((p) => p.id === profileId);
      if (!profile) return prev;
      for (const id of checkedIds) {
        next = updatePrompt(next, id, {
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
      return next;
    });
    toast.success(`Profil appliqué à ${checkedIds.size} prompt(s)`);
  }, [checkedIds]);

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

  const isEmpty = state.prompts.length === 0;
  const sceneCount = manifest.scenes.length;
  const shotCount = manifest.totalShots;

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
