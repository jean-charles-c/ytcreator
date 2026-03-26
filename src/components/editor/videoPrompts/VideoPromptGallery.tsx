/**
 * VideoPromptGallery — Main gallery view for the refactored VideoPrompts tab.
 * Shows all visual assets (from shots + external uploads) as a grid of cards.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Film,
  Layers,
  Camera,
  Filter,
  Loader2,
  ImageIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import type { ShotTimepoint } from "../timelineAssembly";
import type {
  VisualAsset,
  ScriptSentence,
  VideoGeneration,
  VideoGenerationStatus,
} from "./videoGeneration.types";
import VideoAssetCard from "./VideoAssetCard";
import ExternalUploadPanel from "./ExternalUploadPanel";

type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

interface VideoPromptGalleryProps {
  projectId: string;
  scenes: Scene[];
  shots: Shot[];
  onAssetClick: (asset: VisualAsset) => void;
}

/** Build VisualAsset list from shots that have images */
function buildGalleryAssets(
  scenes: Scene[],
  shots: Shot[],
  voDurations: Map<string, number>,
): VisualAsset[] {
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));

  return shots
    .filter((sh) => !!sh.image_url)
    .sort((a, b) => {
      const sceneA = sceneMap.get(a.scene_id);
      const sceneB = sceneMap.get(b.scene_id);
      const orderA = (sceneA?.scene_order ?? 0) * 1000 + a.shot_order;
      const orderB = (sceneB?.scene_order ?? 0) * 1000 + b.shot_order;
      return orderA - orderB;
    })
    .map((sh, i) => {
      const scene = sceneMap.get(sh.scene_id);
      const scriptSentence: ScriptSentence | null = scene
        ? {
            shotId: sh.id,
            sceneId: sh.scene_id,
            sceneTitle: scene.title,
            shotOrder: sh.shot_order,
            sourceSentence: sh.source_sentence ?? "",
            sourceSentenceFr: sh.source_sentence_fr ?? null,
            voDurationSec: voDurations.get(sh.id) ?? null,
          }
        : null;

      return {
        id: sh.id,
        projectId: sh.project_id,
        source: "gallery" as const,
        imageUrl: sh.image_url!,
        shotId: sh.id,
        sceneId: sh.scene_id,
        scriptSentence,
        label: `Shot ${sh.shot_order}`,
        displayOrder: i,
        videoCount: 0,
        createdAt: sh.created_at,
      };
    });
}

/** Compute per-shot duration from timepoints */
function computeVoDurations(
  timepoints: ShotTimepoint[] | null,
  totalDuration: number,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!timepoints || timepoints.length === 0) return map;

  const sorted = [...timepoints].sort((a, b) => a.timeSeconds - b.timeSeconds);
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].timeSeconds;
    const end = i < sorted.length - 1 ? sorted[i + 1].timeSeconds : totalDuration;
    map.set(sorted[i].shotId, Math.max(0, end - start));
  }
  return map;
}

export default function VideoPromptGallery({
  projectId,
  scenes,
  shots,
  onAssetClick,
}: VideoPromptGalleryProps) {
  const { user } = useAuth();
  const userId = user?.id;

  const [externalUploads, setExternalUploads] = useState<VisualAsset[]>([]);
  const [generations, setGenerations] = useState<VideoGeneration[]>([]);
  const [voDurations, setVoDurations] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sceneFilter, setSceneFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Load external uploads, generations, and VO timepoints
  useEffect(() => {
    if (!userId) return;

    async function load() {
      setLoading(true);
      const [uploadsRes, gensRes, voRes] = await Promise.all([
        supabase
          .from("external_uploads" as any)
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase
          .from("video_generations" as any)
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase
          .from("vo_audio_history")
          .select("shot_timepoints, duration_estimate")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      // Compute VO durations from latest audio
      if (voRes.data && voRes.data.length > 0) {
        const audio = voRes.data[0];
        const timepoints = (audio.shot_timepoints as unknown as ShotTimepoint[] | null) ?? null;
        const duration = audio.duration_estimate ?? 0;
        setVoDurations(computeVoDurations(timepoints, duration));
      }

      // Map external uploads
      const uploads: VisualAsset[] = ((uploadsRes.data as any[]) ?? []).map((row: any, i: number) => ({
        id: row.id,
        projectId: row.project_id,
        source: "external_upload" as const,
        imageUrl: row.image_url,
        shotId: null,
        sceneId: null,
        scriptSentence: null,
        label: row.label ?? "Image externe",
        displayOrder: i,
        videoCount: 0,
        createdAt: row.created_at,
      }));

      setExternalUploads(uploads);
      setGenerations(((gensRes.data as any[]) ?? []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        projectId: row.project_id,
        visualAssetId: row.source_shot_id ?? row.source_upload_id ?? "",
        sourceType: row.source_type,
        sourceImageUrl: row.source_image_url,
        provider: row.provider,
        promptUsed: row.prompt_used,
        negativePrompt: row.negative_prompt,
        durationSec: row.duration_sec,
        aspectRatio: row.aspect_ratio,
        status: row.status,
        resultVideoUrl: row.result_video_url,
        resultThumbnailUrl: row.result_thumbnail_url,
        errorMessage: row.error_message,
        providerJobId: row.provider_job_id,
        generationTimeMs: row.generation_time_ms,
        estimatedCostUsd: row.estimated_cost_usd,
        providerMetadata: row.provider_metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })));

      setLoading(false);
    }

    load();
  }, [userId, projectId]);

  // Build gallery assets from shots (now with VO durations)
  const galleryAssets = useMemo(() => buildGalleryAssets(scenes, shots, voDurations), [scenes, shots, voDurations]);

  // Compute video counts and best status per asset
  const generationsByAsset = useMemo(() => {
    const map = new Map<string, VideoGeneration[]>();
    for (const gen of generations) {
      const key = gen.visualAssetId;
      const list = map.get(key) ?? [];
      list.push(gen);
      map.set(key, list);
    }
    return map;
  }, [generations]);

  const getAssetStatus = useCallback(
    (assetId: string): VideoGenerationStatus => {
      const gens = generationsByAsset.get(assetId) ?? [];
      if (gens.length === 0) return "not_generated";
      if (gens.some((g) => g.status === "completed")) return "completed";
      if (gens.some((g) => g.status === "processing")) return "processing";
      if (gens.some((g) => g.status === "pending")) return "pending";
      if (gens.some((g) => g.status === "error")) return "error";
      return "not_generated";
    },
    [generationsByAsset],
  );

  const getVideoCount = useCallback(
    (assetId: string): number => {
      return (generationsByAsset.get(assetId) ?? []).filter((g) => g.status === "completed").length;
    },
    [generationsByAsset],
  );

  // Enrich assets with video counts
  const enrichedGallery = useMemo(() => {
    return galleryAssets.map((a) => ({
      ...a,
      videoCount: getVideoCount(a.id),
    }));
  }, [galleryAssets, getVideoCount]);

  const enrichedExternals = useMemo(() => {
    return externalUploads.map((a) => ({
      ...a,
      videoCount: getVideoCount(a.id),
    }));
  }, [externalUploads, getVideoCount]);

  // Filtered gallery
  const filteredGallery = useMemo(() => {
    let result = enrichedGallery;

    if (sceneFilter !== "all") {
      result = result.filter((a) => a.sceneId === sceneFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((a) => getAssetStatus(a.id) === statusFilter);
    }

    return result;
  }, [enrichedGallery, sceneFilter, statusFilter, getAssetStatus]);

  // Stats
  const totalAssets = galleryAssets.length + externalUploads.length;
  const completedCount = [...galleryAssets, ...externalUploads].filter(
    (a) => getAssetStatus(a.id) === "completed",
  ).length;

  const handleExternalUpload = useCallback(
    (upload: { id: string; imageUrl: string; label: string }) => {
      const newAsset: VisualAsset = {
        id: upload.id,
        projectId,
        source: "external_upload",
        imageUrl: upload.imageUrl,
        shotId: null,
        sceneId: null,
        scriptSentence: null,
        label: upload.label,
        displayOrder: externalUploads.length,
        videoCount: 0,
        createdAt: new Date().toISOString(),
      };
      setExternalUploads((prev) => [newAsset, ...prev]);
    },
    [projectId, externalUploads.length],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Chargement de la galerie…</span>
      </div>
    );
  }

  return (
    <div className="py-3 sm:py-4 md:py-6 px-2 sm:px-4 animate-fade-in" style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-x-4 sm:gap-y-2 mb-4 sm:mb-5 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          <h2 className="font-display text-base sm:text-lg md:text-xl font-semibold text-foreground">
            VideoPrompts
          </h2>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded">
            <ImageIcon className="h-3 w-3" />
            {totalAssets} visuel{totalAssets > 1 ? "s" : ""}
          </span>
          {completedCount > 0 && (
            <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">
              <Film className="h-3 w-3" />
              {completedCount} vidéo{completedCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2">
          <Select value={sceneFilter} onValueChange={setSceneFilter}>
            <SelectTrigger className="h-8 sm:h-7 text-[11px] flex-1 sm:flex-none sm:w-[140px] bg-secondary border-border">
              <Layers className="h-3 w-3 mr-1 shrink-0" />
              <SelectValue placeholder="Toutes scènes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes scènes</SelectItem>
              {scenes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  Sc. {s.scene_order} — {s.title.slice(0, 25)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 sm:h-7 text-[11px] flex-1 sm:flex-none sm:w-[130px] bg-secondary border-border">
              <Filter className="h-3 w-3 mr-1 shrink-0" />
              <SelectValue placeholder="Tous statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="not_generated">Pas généré</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="processing">En cours</SelectItem>
              <SelectItem value="completed">Terminé</SelectItem>
              <SelectItem value="error">Erreur</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Gallery grid */}
      {filteredGallery.length === 0 && enrichedExternals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <ImageIcon className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Aucun visuel disponible
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Générez d'abord des visuels dans le tab VisualPrompts, ou uploadez des images externes ci-dessous.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Script gallery */}
          {filteredGallery.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                Visuels du script ({filteredGallery.length})
              </h3>
               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                 {filteredGallery.map((asset) => (
                  <VideoAssetCard
                    key={asset.id}
                    asset={asset}
                    bestStatus={getAssetStatus(asset.id)}
                    videoCount={asset.videoCount}
                    onClick={() => onAssetClick(asset)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* External uploads */}
          {enrichedExternals.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-violet-400" />
                Images externes ({enrichedExternals.length})
              </h3>
               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                {enrichedExternals.map((asset) => (
                  <VideoAssetCard
                    key={asset.id}
                    asset={asset}
                    bestStatus={getAssetStatus(asset.id)}
                    videoCount={asset.videoCount}
                    onClick={() => onAssetClick(asset)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* External upload panel */}
      <div className="mt-6">
        {userId && (
          <ExternalUploadPanel
            projectId={projectId}
            userId={userId}
            onUploaded={handleExternalUpload}
          />
        )}
      </div>
    </div>
  );
}
