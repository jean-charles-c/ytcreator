/**
 * VideoPromptSourcePanel — Left panel for choosing input source
 * and navigating the scene/shot hierarchy.
 */

import { useState, useMemo } from "react";
import {
  Search,
  Layers,
  Clapperboard,
  Camera,
  PenLine,
  ChevronRight,
  ChevronDown,
  Import,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { VideoPromptSource } from "./types";

export interface SourceScene {
  sceneId: string;
  title: string;
  sceneOrder: number;
  shots: SourceShot[];
}

export interface SourceShot {
  shotId: string;
  sceneId: string;
  localOrder: number;
  globalOrder: number;
  description: string;
  narrativeFragment: string;
}

interface VideoPromptSourcePanelProps {
  scenes: SourceScene[];
  activeSource: VideoPromptSource;
  onSourceChange: (source: VideoPromptSource) => void;
  selectedSceneId: string | null;
  selectedShotId: string | null;
  onSelectScene: (sceneId: string) => void;
  onSelectShot: (shotId: string, sceneId: string) => void;
  onImportAll: () => void;
  onImportScene: (sceneId: string) => void;
  onImportShot: (shotId: string, sceneId: string) => void;
  hasVisualPrompts: boolean;
}

const SOURCE_TABS: { key: VideoPromptSource; label: string; icon: React.ElementType }[] = [
  { key: "visual-prompts", label: "VisualPrompts", icon: Clapperboard },
  { key: "scene", label: "Scènes", icon: Layers },
  { key: "shot", label: "Shots", icon: Camera },
  { key: "manual", label: "Manuel", icon: PenLine },
];

export default function VideoPromptSourcePanel({
  scenes,
  activeSource,
  onSourceChange,
  selectedSceneId,
  selectedShotId,
  onSelectScene,
  onSelectShot,
  onImportAll,
  onImportScene,
  onImportShot,
  hasVisualPrompts,
}: VideoPromptSourcePanelProps) {
  const [search, setSearch] = useState("");
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());

  const toggleScene = (sceneId: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return scenes;
    const q = search.toLowerCase();
    return scenes
      .map((s) => ({
        ...s,
        shots: s.shots.filter(
          (sh) =>
            sh.description.toLowerCase().includes(q) ||
            sh.narrativeFragment.toLowerCase().includes(q),
        ),
      }))
      .filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.shots.length > 0,
      );
  }, [scenes, search]);

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Source tabs */}
      <div className="p-2 border-b border-border">
        <div className="grid grid-cols-2 gap-1">
          {SOURCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSource === tab.key;
            const disabled = tab.key === "visual-prompts" && !hasVisualPrompts;
            return (
              <button
                key={tab.key}
                onClick={() => !disabled && onSourceChange(tab.key)}
                disabled={disabled}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : disabled
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual mode message */}
      {activeSource === "manual" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Mode manuel actif. Créez vos prompts vidéo librement sans source amont.
          </p>
        </div>
      )}

      {/* Hierarchy for non-manual modes */}
      {activeSource !== "manual" && (
        <>
          {/* Search + import all */}
          <div className="p-2 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="h-8 pl-7 text-xs"
              />
            </div>
            {activeSource === "visual-prompts" && hasVisualPrompts && (
              <Button
                variant="outline"
                size="sm"
                onClick={onImportAll}
                className="w-full h-7 text-xs"
              >
                <Import className="h-3 w-3" />
                Tout importer
              </Button>
            )}
          </div>

          {/* Scene/shot tree */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3 text-center italic">
                {scenes.length === 0
                  ? "Aucune scène disponible. Lancez la segmentation d'abord."
                  : "Aucun résultat."}
              </p>
            ) : (
              <div className="py-1">
                {filtered.map((scene) => {
                  const isExpanded = expandedScenes.has(scene.sceneId);
                  const isSelected = selectedSceneId === scene.sceneId && !selectedShotId;

                  return (
                    <div key={scene.sceneId}>
                      {/* Scene row */}
                      <div
                        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs transition-colors group ${
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-secondary"
                        }`}
                      >
                        <button
                          onClick={() => toggleScene(scene.sceneId)}
                          className="shrink-0 p-0.5"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          onClick={() => onSelectScene(scene.sceneId)}
                          className="flex-1 text-left truncate"
                        >
                          <span className="font-medium">S{scene.sceneOrder}</span>
                          <span className="ml-1.5 text-muted-foreground">{scene.title}</span>
                        </button>
                        {(activeSource === "visual-prompts" || activeSource === "scene") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onImportScene(scene.sceneId);
                            }}
                            className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 text-muted-foreground hover:text-primary transition-opacity"
                            title="Importer cette scène"
                          >
                            <Import className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Shots */}
                      {isExpanded && (
                        <div className="ml-4 border-l border-border">
                          {scene.shots.map((shot) => {
                            const isShotSelected = selectedShotId === shot.shotId;
                            return (
                              <div
                                key={shot.shotId}
                                className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[11px] transition-colors group ${
                                  isShotSelected
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                }`}
                              >
                                <button
                                  onClick={() => onSelectShot(shot.shotId, shot.sceneId)}
                                  className="flex-1 text-left truncate"
                                >
                                  <span className="font-mono">
                                    {String(shot.globalOrder).padStart(4, "0")}
                                  </span>
                                  <span className="ml-1.5">
                                    {shot.narrativeFragment.slice(0, 60)}
                                    {shot.narrativeFragment.length > 60 ? "…" : ""}
                                  </span>
                                </button>
                                {activeSource !== "manual" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onImportShot(shot.shotId, shot.sceneId);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 text-muted-foreground hover:text-primary transition-opacity"
                                    title="Importer ce shot"
                                  >
                                    <Import className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
