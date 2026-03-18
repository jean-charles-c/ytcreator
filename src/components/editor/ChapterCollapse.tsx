import { useState, useCallback } from "react";
import { ChevronDown, ListVideo, CheckCheck } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ChapterList from "./ChapterList";
import { detectChapters } from "./chapterDetection";
import { chapterFromDetected, type ChapterListState, type ChapterTitleVariant } from "./chapterTypes";
import type { CanonicalScript } from "./canonicalScriptTypes";
import { supabase } from "@/integrations/supabase/client";

interface ChapterCollapseProps {
  canonicalScript: CanonicalScript | null;
  narration?: string | null;
  chapterState: ChapterListState | null;
  onChapterStateChange: (state: ChapterListState) => void;
  scriptLanguage?: string;
}

export default function ChapterCollapse({
  canonicalScript,
  narration,
  chapterState,
  onChapterStateChange,
  scriptLanguage,
}: ChapterCollapseProps) {
  const [open, setOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

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
  const allValidated = chapters.length > 0 && chapters.every((c) => c.validated);

  const handleValidateAll = useCallback(() => {
    if (!chapterState || chapters.length === 0) return;
    const newVal = !allValidated;
    onChapterStateChange({
      ...chapterState,
      chapters: chapterState.chapters.map((ch) => ({ ...ch, validated: newVal })),
      lastUpdatedAt: new Date().toISOString(),
    });
    toast.success(newVal ? "Tous les chapitres validés" : "Validation retirée");
  }, [chapterState, onChapterStateChange, allValidated, chapters.length]);

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

  const handleGenerateTitles = useCallback(
    async (id: string, tone: string) => {
      if (!chapterState) return;
      const chapter = chapterState.chapters.find((ch) => ch.id === id);
      if (!chapter) return;

      setGeneratingId(id);
      try {
        const { data, error } = await supabase.functions.invoke("chapter-titles", {
          body: {
            chapterText: chapter.sourceText,
            chapterLabel: chapter.title,
            tone,
            language: scriptLanguage || "en",
          },
        });

        if (error) { toast.error("Erreur de génération"); console.error(error); return; }
        if (data?.error) { toast.error(data.error); return; }

        const newVariants: ChapterTitleVariant[] = (data.titles || []).map(
          (t: { title: string; hookType: string; titleFR?: string }, i: number) => ({
            id: `${id}-v${Date.now()}-${i}`,
            title: t.title,
            hookType: t.hookType,
            selected: false,
            titleFR: t.titleFR || null,
          })
        );

        // Merge with existing variants (keep history)
        const existingVariants = chapter.variants.map((v) => ({ ...v, selected: false }));
        const allVariants = [...newVariants, ...existingVariants].slice(0, 20);

        onChapterStateChange({
          ...chapterState,
          chapters: chapterState.chapters.map((ch) =>
            ch.id === id ? { ...ch, variants: allVariants } : ch
          ),
          lastUpdatedAt: new Date().toISOString(),
        });

        toast.success("Titres générés !");
      } catch (e) {
        console.error(e);
        toast.error("Erreur inattendue");
      } finally {
        setGeneratingId(null);
      }
    },
    [chapterState, onChapterStateChange, scriptLanguage]
  );

  const handleSelectVariant = useCallback(
    (chapterId: string, variantId: string) => {
      if (!chapterState) return;
      onChapterStateChange({
        ...chapterState,
        chapters: chapterState.chapters.map((ch) => {
          if (ch.id !== chapterId) return ch;
          const selectedVariant = ch.variants.find((v) => v.id === variantId);
          return {
            ...ch,
            title: selectedVariant?.title || ch.title,
            titleFR: selectedVariant?.titleFR || ch.titleFR,
            variants: ch.variants.map((v) => ({ ...v, selected: v.id === variantId })),
          };
        }),
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
          onGenerateTitles={handleGenerateTitles}
          onSelectVariant={handleSelectVariant}
          generatingId={generatingId}
          isFrench={scriptLanguage === "fr"}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
