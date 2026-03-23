import { useState, useMemo, useCallback } from "react";
import { Film, Import, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { buildManifest } from "./visualPromptTypes";
import VideoPromptSourcePanel from "./videoPrompts/VideoPromptSourcePanel";
import type { SourceScene } from "./videoPrompts/VideoPromptSourcePanel";
import type { VideoPromptSource, VideoPromptsState } from "./videoPrompts/types";
import { createInitialState } from "./videoPrompts/store";
import * as service from "./videoPrompts/service";

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

  // Build manifest for mapping
  const manifest = useMemo(
    () => buildManifest(projectId, scenes, shots),
    [projectId, scenes, shots],
  );

  const hasVisualPrompts = manifest.totalShots > 0;

  // Build source panel data from manifest
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

  // ── Import handlers ────────────────────────────────────────────

  const handleImportAll = useCallback(() => {
    setState((prev) => {
      const next = service.importFromManifest(prev, manifest);
      toast.success(`${next.prompts.length} prompts vidéo importés`);
      return next;
    });
  }, [manifest]);

  const handleImportScene = useCallback(
    (sceneId: string) => {
      const normScene = manifest.scenes.find((s) => s.sceneId === sceneId);
      if (!normScene) return;
      setState((prev) => {
        const next = service.importScene(prev, projectId, normScene);
        const added = next.prompts.length - prev.prompts.length;
        toast.success(`${added} prompt(s) importé(s) depuis "${normScene.title}"`);
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
      toast.success("Prompt vidéo manuel créé");
      return next;
    });
  }, [projectId]);

  const isEmpty = state.prompts.length === 0;

  return (
    <div className="container max-w-6xl py-6 sm:py-10 px-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <Film className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground">
          VideoPrompts
        </h2>
        {state.prompts.length > 0 && (
          <span className="ml-2 text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
            {state.prompts.length} prompt{state.prompts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Transformez vos prompts visuels en directives vidéo structurées pour le pipeline de rendu.
      </p>

      <div className="flex gap-4" style={{ minHeight: 480 }}>
        {/* Left: Source panel */}
        <div className="w-64 shrink-0 rounded-lg border border-border overflow-hidden hidden sm:flex flex-col">
          <VideoPromptSourcePanel
            scenes={sourceScenes}
            activeSource={activeSource}
            onSourceChange={setActiveSource}
            selectedSceneId={selectedSceneId}
            selectedShotId={selectedShotId}
            onSelectScene={(id) => {
              setSelectedSceneId(id);
              setSelectedShotId(null);
            }}
            onSelectShot={(shotId, sceneId) => {
              setSelectedShotId(shotId);
              setSelectedSceneId(sceneId);
            }}
            onImportAll={handleImportAll}
            onImportScene={handleImportScene}
            onImportShot={handleImportShot}
            hasVisualPrompts={hasVisualPrompts}
          />
        </div>

        {/* Center: Prompt list or empty state */}
        <div className="flex-1 min-w-0">
          {isEmpty ? (
            <Card className="border-dashed border-2 border-border bg-secondary/20 h-full">
              <CardContent className="flex flex-col items-center justify-center h-full py-16 gap-6 text-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <Film className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2 max-w-md">
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    Aucun prompt vidéo
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Sélectionnez une source dans le panneau de gauche pour importer du contexte,
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
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground">
                  {state.prompts.length} prompt{state.prompts.length > 1 ? "s" : ""} vidéo
                </p>
                <Button variant="outline" size="sm" onClick={handleCreateManual} className="h-7 text-xs">
                  <PlusCircle className="h-3 w-3" />
                  Ajouter
                </Button>
              </div>
              {state.prompts.map((vp) => (
                <div
                  key={vp.id}
                  className="rounded border border-border bg-card p-3 hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {String(vp.order).padStart(4, "0")}
                    </span>
                    <span className="text-xs font-medium text-foreground truncate">
                      {vp.sceneTitle || "Manuel"}
                    </span>
                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                      vp.status === "draft"
                        ? "bg-secondary text-muted-foreground"
                        : vp.status === "ready"
                        ? "bg-primary/10 text-primary"
                        : "bg-accent text-accent-foreground"
                    }`}>
                      {vp.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {vp.prompt || "Prompt vide — cliquez pour éditer"}
                  </p>
                  {vp.narrativeFragment && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1 italic line-clamp-1">
                      📝 {vp.narrativeFragment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile source actions */}
      <div className="sm:hidden mt-4 flex gap-2">
        {hasVisualPrompts && (
          <Button variant="default" size="sm" onClick={handleImportAll} className="flex-1 min-h-[44px]">
            <Import className="h-4 w-4" />
            Importer tout
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleCreateManual} className="flex-1 min-h-[44px]">
          <PlusCircle className="h-4 w-4" />
          Manuel
        </Button>
      </div>
    </div>
  );
}
