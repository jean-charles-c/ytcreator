import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCw, ImageIcon, X } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Shot = Tables<"shots">;
type Scene = Tables<"scenes">;

interface ImageModel {
  value: string;
  label: string;
  price: string;
}

interface VisualGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shots: Shot[];
  scenes: Scene[];
  imageModels: ImageModel[];
  imageModel: string;
  onImageModelChange: (model: string) => void;
  onRegenerateShot: (shotId: string) => Promise<void>;
  onGenerateImage: (shotId: string) => Promise<void>;
}

export default function VisualGallery({
  open,
  onOpenChange,
  shots,
  scenes,
  imageModels,
  imageModel,
  onImageModelChange,
  onRegenerateShot,
  onGenerateImage,
}: VisualGalleryProps) {
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [generatingImageId, setGeneratingImageId] = useState<string | null>(null);

  const sortedScenes = [...scenes].sort((a, b) => a.scene_order - b.scene_order);

  // Build ordered shots with global index
  const orderedShots: { shot: Shot; globalIndex: number; modelUsed: string }[] = [];
  let idx = 1;
  for (const scene of sortedScenes) {
    const sceneShots = shots
      .filter((s) => s.scene_id === scene.id)
      .sort((a, b) => a.shot_order - b.shot_order);
    for (const shot of sceneShots) {
      orderedShots.push({ shot, globalIndex: idx, modelUsed: "" });
      idx++;
    }
  }

  const shotsWithImages = orderedShots.filter((s) => (s.shot as any).image_url);

  const handleRegenShot = async (shotId: string) => {
    setRegeneratingId(shotId);
    try { await onRegenerateShot(shotId); } finally { setRegeneratingId(null); }
  };

  const handleRegenImage = async (shotId: string) => {
    setGeneratingImageId(shotId);
    try { await onGenerateImage(shotId); } finally { setGeneratingImageId(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Galerie des visuels ({shotsWithImages.length}/{orderedShots.length} générés)
          </DialogTitle>
        </DialogHeader>

        {/* AI model selector */}
        <div className="flex items-center gap-2 pb-3 border-b border-border shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Modèle IA pour regénération :</span>
          <select
            value={imageModel}
            onChange={(e) => onImageModelChange(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {imageModels.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label} — {m.price}
              </option>
            ))}
          </select>
        </div>

        {/* Gallery grid */}
        <div className="flex-1 overflow-y-auto">
          {shotsWithImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aucun visuel généré pour le moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-1">
              {shotsWithImages.map(({ shot, globalIndex }) => (
                <div key={shot.id} className="rounded border border-border bg-card overflow-hidden group">
                  {/* Image */}
                  <div className="relative aspect-video bg-secondary">
                    <img
                      src={(shot as any).image_url}
                      alt={`Shot ${globalIndex}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Info */}
                  <div className="p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-display font-semibold text-primary">
                        SHOT {globalIndex}
                      </span>
                      <span className="text-[9px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {shot.shot_type}
                      </span>
                    </div>

                    {/* French sentence */}
                    {(shot as any).source_sentence_fr && (
                      <p className="text-[10px] text-muted-foreground leading-snug italic line-clamp-3">
                        🇫🇷 "{(shot as any).source_sentence_fr}"
                      </p>
                    )}
                    {!(shot as any).source_sentence_fr && (shot as any).source_sentence && (
                      <p className="text-[10px] text-muted-foreground leading-snug italic line-clamp-3">
                        "{(shot as any).source_sentence}"
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-1 pt-1">
                      <button
                        onClick={() => handleRegenShot(shot.id)}
                        disabled={regeneratingId === shot.id}
                        className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        title="Regénérer le shot"
                      >
                        {regeneratingId === shot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Shot
                      </button>
                      <button
                        onClick={() => handleRegenImage(shot.id)}
                        disabled={generatingImageId === shot.id}
                        className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        title="Regénérer le visuel"
                      >
                        {generatingImageId === shot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                        Visuel
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
