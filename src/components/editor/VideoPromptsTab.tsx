/**
 * VideoPromptsTab — Refactored main entry point.
 * Renders the VideoPromptGallery + VideoSourceModal.
 */

import { useState, useEffect, useCallback } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { VisualAsset, VideoGeneration } from "./videoPrompts/videoGeneration.types";
import VideoPromptGallery from "./videoPrompts/VideoPromptGallery";
import VideoSourceModal from "./videoPrompts/VideoSourceModal";

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
  const [selectedAsset, setSelectedAsset] = useState<VisualAsset | null>(null);
  const [modalGenerations, setModalGenerations] = useState<VideoGeneration[]>([]);
  const [genRefreshKey, setGenRefreshKey] = useState(0);

  // Load generations for selected asset
  useEffect(() => {
    if (!selectedAsset) {
      setModalGenerations([]);
      return;
    }

    async function loadGenerations() {
      const sourceCol = selectedAsset!.source === "gallery" ? "source_shot_id" : "source_upload_id";
      const { data } = await supabase
        .from("video_generations" as any)
        .select("*")
        .eq(sourceCol, selectedAsset!.id)
        .order("created_at", { ascending: false });

      setModalGenerations(
        ((data as any[]) ?? []).map((row: any) => ({
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
        })),
      );
    }

    loadGenerations();
  }, [selectedAsset, genRefreshKey]);

  const handleAssetClick = useCallback((asset: VisualAsset) => {
    setSelectedAsset(asset);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedAsset(null);
  }, []);

  return (
    <>
      <VideoPromptGallery
        projectId={projectId}
        scenes={scenes}
        shots={shots}
        onAssetClick={handleAssetClick}
      />
      <VideoSourceModal
        asset={selectedAsset}
        generations={modalGenerations}
        open={!!selectedAsset}
        onClose={handleCloseModal}
      />
    </>
  );
}
