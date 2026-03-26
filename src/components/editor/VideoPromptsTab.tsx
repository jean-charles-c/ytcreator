/**
 * VideoPromptsTab — Refactored main entry point.
 * Renders the VideoPromptGallery with asset cards and external upload panel.
 * The VideoSourceModal (Prompt 5) will be wired here when built.
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import type { VisualAsset } from "./videoPrompts/videoGeneration.types";
import VideoPromptGallery from "./videoPrompts/VideoPromptGallery";

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

  const handleAssetClick = useCallback((asset: VisualAsset) => {
    setSelectedAsset(asset);
    // VideoSourceModal will be implemented in Prompt 5
    toast.info(`Visuel sélectionné : ${asset.label || "Shot"}`);
  }, []);

  return (
    <VideoPromptGallery
      projectId={projectId}
      scenes={scenes}
      shots={shots}
      onAssetClick={handleAssetClick}
    />
  );
}
