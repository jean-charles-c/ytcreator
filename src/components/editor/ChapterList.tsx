import type { Chapter } from "./chapterTypes";
import ChapterItem from "./ChapterItem";

interface ChapterListProps {
  chapters: Chapter[];
  onToggleValidated: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
}

export default function ChapterList({ chapters, onToggleValidated, onTitleChange }: ChapterListProps) {
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
        />
      ))}
    </div>
  );
}
