import { useState, useCallback } from "react";
import { ChevronDown, ListVideo, CheckCheck, Sparkles, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ChapterList from "./ChapterList";
import { detectChapters } from "./chapterDetection";
import { chapterFromDetected, type ChapterListState, type ChapterTitleVariant } from "./chapterTypes";
import { SECTION_TYPES, type CanonicalScript } from "./canonicalScriptTypes";
import { supabase } from "@/integrations/supabase/client";

const TONES = [
  { value: "curiosity", label: "🔍 Curiosité" },
  { value: "dramatic", label: "🎭 Dramatique" },
  { value: "informative", label: "📘 Informatif" },
  { value: "contrarian", label: "⚡ Contrarien" },
  { value: "mixed", label: "🎲 Mix (varié)" },
] as const;

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

  const normalizeChapterState = useCallback(
    (existingState: ChapterListState | null): ChapterListState => {
      const result = detectChapters(canonicalScript, narration);
      const detectedChapters = result.chapters.map(chapterFromDetected);
      const previousById = new Map((existingState?.chapters ?? []).map((chapter) => [chapter.id, chapter]));

      return {
        chapters: detectedChapters.map((chapter) => {
          const previous = previousById.get(chapter.id);
          if (!previous) return chapter;

          return {
            ...chapter,
            title: previous.title || chapter.title,
            titleFR: previous.titleFR ?? chapter.titleFR,
            validated: previous.validated,
            variants: previous.variants ?? [],
            summary: previous.summary ?? chapter.summary,
            startSentence: chapter.startSentence || previous.startSentence,
          };
        }),
        method: result.method,
        lastUpdatedAt: new Date().toISOString(),
      };
    },
    [canonicalScript, narration]
  );

  const isLegacyChapterState = useCallback((state: ChapterListState | null) => {
    if (!state) return true;
    if (state.chapters.length !== SECTION_TYPES.length) return true;
    return SECTION_TYPES.some((sectionType, index) => state.chapters[index]?.id !== sectionType);
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (!isOpen) return;

      if (isLegacyChapterState(chapterState)) {
        onChapterStateChange(normalizeChapterState(chapterState));
      }
    },
    [chapterState, isLegacyChapterState, normalizeChapterState, onChapterStateChange]
  );

  const chapters = isLegacyChapterState(chapterState)
    ? normalizeChapterState(chapterState).chapters
    : (chapterState?.chapters ?? []);
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

      <CollapsibleContent className="mt-2 rounded-lg border border-border bg-card p-4 space-y-3">
        {chapters.length > 0 && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidateAll}
              className="h-7 text-xs gap-1"
            >
              <CheckCheck className="h-3 w-3" />
              {allValidated ? "Dévalider tout" : "Valider tout"}
            </Button>
          </div>
        )}
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
