import type { Chapter } from "./chapterTypes";
import ChapterItem from "./ChapterItem";

interface ChapterListProps {
  chapters: Chapter[];
  onToggleValidated: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onGenerateTitles: (id: string, tone: string) => Promise<void>;
  onSelectVariant: (chapterId: string, variantId: string) => void;
  generatingId?: string | null;
  isFrench?: boolean;
  shots?: Array<{ id: string; scene_id: string; shot_order: number; source_sentence: string | null; source_sentence_fr: string | null }>;
  scenesForShotOrder?: Array<{ id: string; scene_order: number }>;
}

export default function ChapterList({ chapters, onToggleValidated, onTitleChange, onGenerateTitles, onSelectVariant, generatingId, isFrench, shots, scenesForShotOrder }: ChapterListProps) {
  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
        <p className="text-sm text-muted-foreground">Aucun chapitre détecté.</p>
        <p className="text-xs text-muted-foreground/60">
          Générez d'abord un script avec des tags narratifs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {chapters.map((ch) => (
        <ChapterItem
          key={ch.id}
          chapter={ch}
          onToggleValidated={onToggleValidated}
          onTitleChange={onTitleChange}
          onGenerateTitles={onGenerateTitles}
          onSelectVariant={onSelectVariant}
          generating={generatingId === ch.id}
          isFrench={isFrench}
          shots={shots}
          scenesForShotOrder={scenesForShotOrder}
        />
      ))}
    </div>
  );
}
