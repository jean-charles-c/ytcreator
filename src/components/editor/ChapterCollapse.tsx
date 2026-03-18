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
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchTone, setBatchTone] = useState("mixed");

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

  const handleBatchGenerate = useCallback(async () => {
    if (!chapterState || chapters.length === 0) return;
    setBatchGenerating(true);

    // For each chapter, call the edge function directly and collect results
    const variantsMap = new Map<string, ChapterTitleVariant[]>();
    const selectedToneMap = new Map<string, string>(); // track which tone was the "preferred"
    let errorCount = 0;

    for (let i = 0; i < chapterState.chapters.length; i++) {
      const ch = chapterState.chapters[i];
      setGeneratingId(ch.id);

      // Always use "mixed" to generate all 4 tones; batchTone determines which gets pre-selected
      try {
        const { data, error } = await supabase.functions.invoke("chapter-titles", {
          body: {
            chapterText: ch.sourceText,
            chapterLabel: ch.title,
            tone: "mixed",
            language: scriptLanguage || "en",
          },
        });

        if (error || data?.error) {
          console.error(error || data?.error);
          errorCount++;
          continue;
        }

        const newVariants: ChapterTitleVariant[] = (data.titles || []).map(
          (t: { title: string; hookType: string; titleFR?: string }, vi: number) => ({
            id: `${ch.id}-v${Date.now()}-${vi}`,
            title: t.title,
            hookType: t.hookType,
            selected: false,
            titleFR: t.titleFR || null,
          })
        );

        variantsMap.set(ch.id, newVariants);
        selectedToneMap.set(ch.id, batchTone === "mixed" ? "" : batchTone);
      } catch (e) {
        console.error(e);
        errorCount++;
      }
    }

    // Single state update with all results — pre-select the variant matching batchTone
    onChapterStateChange({
      ...chapterState,
      chapters: chapterState.chapters.map((ch) => {
        const newVars = variantsMap.get(ch.id);
        if (!newVars) return ch;

        const preferredTone = selectedToneMap.get(ch.id) || "";
        const existingVariants = ch.variants.map((v) => ({ ...v, selected: false }));
        const allVariants = [...newVars, ...existingVariants].slice(0, 20);

        // Auto-select the first variant matching the preferred tone
        const matchIdx = preferredTone
          ? allVariants.findIndex((v) => v.hookType === preferredTone)
          : 0;
        const selectedIdx = matchIdx >= 0 ? matchIdx : 0;
        const selectedVariant = allVariants[selectedIdx];

        return {
          ...ch,
          title: selectedVariant?.title || ch.title,
          titleFR: selectedVariant?.titleFR || ch.titleFR,
          variants: allVariants.map((v, vi) => ({ ...v, selected: vi === selectedIdx })),
        };
      }),
      lastUpdatedAt: new Date().toISOString(),
    });

    setGeneratingId(null);
    setBatchGenerating(false);
    if (errorCount === 0) toast.success("9 chapitres générés !");
    else toast.warning(`${errorCount} erreur(s) sur 9`);
  }, [chapterState, chapters.length, batchTone, scriptLanguage, onChapterStateChange]);

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
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <Select value={batchTone} onValueChange={setBatchTone} disabled={batchGenerating}>
              <SelectTrigger className="h-7 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="default"
              size="sm"
              onClick={handleBatchGenerate}
              disabled={batchGenerating}
              className="h-7 text-xs gap-1"
            >
              {batchGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Générer les 9 titres
            </Button>
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
