import { useState, useCallback, useMemo } from "react";
import { ChevronDown, ListVideo } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ChapterList from "./ChapterList";
import { detectChapters } from "./chapterDetection";
import { chapterFromDetected, type Chapter, type ChapterListState } from "./chapterTypes";
import type { CanonicalScript } from "./canonicalScriptTypes";

interface ChapterCollapseProps {
  canonicalScript: CanonicalScript | null;
  narration?: string | null;
  chapterState: ChapterListState | null;
  onChapterStateChange: (state: ChapterListState) => void;
}

export default function ChapterCollapse({
  canonicalScript,
  narration,
  chapterState,
  onChapterStateChange,
}: ChapterCollapseProps) {
  const [open, setOpen] = useState(false);

  // Auto-detect chapters when opening if none exist
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen && (!chapterState || chapterState.chapters.length === 0)) {
        const result = detectChapters(canonicalScript, narration);
        if (result.chapters.length > 0) {
          onChapterStateChange({
            chapters: result.chapters.map(chapterFromDetected),
            method: result.method,
            lastUpdatedAt: new Date().toISOString(),
          });
        }
      }
    },
    [canonicalScript, narration, chapterState, onChapterStateChange]
  );

  const chapters = chapterState?.chapters ?? [];
  const validatedCount = chapters.filter((c) => c.validated).length;

  const handleToggleValidated = useCallback(
    (id: string) => {
      if (!chapterState) return;
      onChapterStateChange({
        ...chapterState,
        chapters: chapterState.chapters.map((ch) =>
          ch.id === id ? { ...ch, validated: !ch.validated } : ch
        ),
        lastUpdatedAt: new Date().toISOString(),
      });
    },
    [chapterState, onChapterStateChange]
  );

  const handleTitleChange = useCallback(
    (id: string, title: string) => {
      if (!chapterState) return;
      onChapterStateChange({
        ...chapterState,
        chapters: chapterState.chapters.map((ch) =>
          ch.id === id ? { ...ch, title } : ch
        ),
        lastUpdatedAt: new Date().toISOString(),
      });
    },
    [chapterState, onChapterStateChange]
  );

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full rounded-lg border border-border bg-card p-4 transition-colors hover:bg-secondary/30 group">
          <div className="flex items-center gap-2">
            <ListVideo className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">
              Chapitres de la vidéo
            </h3>
            {chapters.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {validatedCount}/{chapters.length} validés
              </span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 rounded-lg border border-border bg-card p-4">
        <ChapterList
          chapters={chapters}
          onToggleValidated={handleToggleValidated}
          onTitleChange={handleTitleChange}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
