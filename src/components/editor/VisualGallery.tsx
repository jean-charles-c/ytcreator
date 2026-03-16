import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCw, ImageIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
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
  totalCost: number;
}

const MODEL_LABELS: Record<string, string> = {
  "google/gemini-2.5-flash-image": "Nano Banana",
  "google/gemini-3.1-flash-image-preview": "Nano Banana 2",
  "google/gemini-3-pro-image-preview": "Nano Banana Pro",
};

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
  totalCost,
}: VisualGalleryProps) {
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [generatingImageId, setGeneratingImageId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const sortedScenes = [...scenes].sort((a, b) => a.scene_order - b.scene_order);

  const orderedShots: { shot: Shot; globalIndex: number }[] = [];
  let idx = 1;
  for (const scene of sortedScenes) {
    const sceneShots = shots
      .filter((s) => s.scene_id === scene.id)
      .sort((a, b) => a.shot_order - b.shot_order);
    for (const shot of sceneShots) {
      orderedShots.push({ shot, globalIndex: idx });
      idx++;
    }
  }

  const shotsWithImages = orderedShots.filter((s) => s.shot.image_url);

  const handleRegenShot = async (shotId: string) => {
    setRegeneratingId(shotId);
    try { await onRegenerateShot(shotId); } finally { setRegeneratingId(null); }
  };

  const handleRegenImage = async (shotId: string) => {
    setGeneratingImageId(shotId);
    try { await onGenerateImage(shotId); } finally { setGeneratingImageId(null); }
  };

  const lightboxShot = lightboxIndex !== null ? shotsWithImages[lightboxIndex] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Galerie des visuels ({shotsWithImages.length}/{orderedShots.length} générés)
          </DialogTitle>
        </DialogHeader>

        {/* AI model selector + total cost */}
        <div className="flex items-center gap-3 pb-3 border-b border-border shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Modèle IA :</span>
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
          <div className="ml-auto text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            Coût total : {totalCost.toFixed(2)} $
          </div>
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
              {shotsWithImages.map(({ shot, globalIndex }, arrIdx) => (
                <div key={shot.id} className="rounded border border-border bg-card overflow-hidden group">
                  {/* Image — clickable for lightbox */}
                  <div
                    className="relative aspect-video bg-secondary cursor-pointer"
                    onClick={() => setLightboxIndex(arrIdx)}
                  >
                    <img
                      src={shot.image_url!}
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

                    {/* Cost */}
                    {(shot.generation_cost as number) > 0 && (
                      <p className="text-[9px] text-accent-foreground bg-accent/30 px-1.5 py-0.5 rounded inline-block">
                        {(shot.generation_cost as number).toFixed(2)} $
                      </p>
                    )}

                    {/* French sentence */}
                    {shot.source_sentence_fr && (
                      <p className="text-[10px] text-muted-foreground leading-snug italic line-clamp-3">
                        🇫🇷 "{shot.source_sentence_fr}"
                      </p>
                    )}
                    {!shot.source_sentence_fr && shot.source_sentence && (
                      <p className="text-[10px] text-muted-foreground leading-snug italic line-clamp-3">
                        "{shot.source_sentence}"
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

        {/* Lightbox overlay */}
        {lightboxShot && (
          <div
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
            onClick={() => setLightboxIndex(null)}
          >
            <button
              className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
              onClick={() => setLightboxIndex(null)}
            >
              <X className="h-6 w-6" />
            </button>

            {/* Nav prev */}
            {lightboxIndex! > 0 && (
              <button
                className="absolute left-4 text-white/80 hover:text-white p-2"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex! - 1); }}
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
            )}

            {/* Nav next */}
            {lightboxIndex! < shotsWithImages.length - 1 && (
              <button
                className="absolute right-4 text-white/80 hover:text-white p-2"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex! + 1); }}
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            )}

            <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <img
                src={lightboxShot.shot.image_url!}
                alt={`Shot ${lightboxShot.globalIndex}`}
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
              <div className="text-white text-center space-y-1">
                <p className="font-display font-semibold">SHOT {lightboxShot.globalIndex} — {lightboxShot.shot.shot_type}</p>
                {(lightboxShot.shot.generation_cost as number) > 0 && (
                  <p className="text-xs text-white/70">{(lightboxShot.shot.generation_cost as number).toFixed(2)} $</p>
                )}
                {lightboxShot.shot.source_sentence_fr && (
                  <p className="text-sm text-white/80 italic max-w-2xl">🇫🇷 "{lightboxShot.shot.source_sentence_fr}"</p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
