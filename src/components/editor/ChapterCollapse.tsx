import { useState, useCallback, useMemo } from "react";
import { ChevronDown, ListVideo, CheckCheck, Sparkles, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ChapterList from "./ChapterList";
import { type ChapterListState, type ChapterTitleVariant, type Chapter } from "./chapterTypes";
import { CORE_SECTION_TYPES, SECTION_TYPES, SECTION_META, type SectionType } from "./canonicalScriptTypes";
import { supabase } from "@/integrations/supabase/client";
import type { NarrativeSection } from "./SectionCard";

const TONES = [
  { value: "curiosity", label: "🔍 Curiosité" },
  { value: "dramatic", label: "🎭 Dramatique" },
  { value: "informative", label: "📘 Informatif" },
  { value: "contrarian", label: "⚡ Contrarien" },
  { value: "mixed", label: "🎲 Mix (varié)" },
] as const;

interface ChapterCollapseProps {
  /** Sections from NarrativeScriptBlock (preferred source of truth) */
  scriptSections?: NarrativeSection[];
  narration?: string | null;
  chapterState: ChapterListState | null;
  onChapterStateChange: (state: ChapterListState) => void;
  scriptLanguage?: string;
  shots?: Array<{ id: string; scene_id: string; shot_order: number; source_sentence: string | null; source_sentence_fr: string | null }>;
  scenesForShotOrder?: Array<{ id: string; scene_order: number }>;
}

export default function ChapterCollapse({
  scriptSections,
  narration,
  chapterState,
  onChapterStateChange,
  scriptLanguage,
  shots,
  scenesForShotOrder,
}: ChapterCollapseProps) {
  const [open, setOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchTone, setBatchTone] = useState("mixed");

  /** Build chapters directly from NarrativeScriptBlock sections */
  const chaptersFromSections = useMemo((): Chapter[] => {
    return CORE_SECTION_TYPES.map((type, idx) => {
      const meta = SECTION_META[type];
      const section = scriptSections?.find((s) => s.key === type);
      const text = section?.content?.trim() || "";
      const firstSentence = text.split(/[.!?]\s/)[0]?.trim() || "";

      return {
        id: type,
        index: idx,
        sectionType: type,
        startSentence: firstSentence.slice(0, 120),
        summary: "",
        title: `${meta.icon} ${meta.label}`,
        variants: [],
        titleFR: null,
        validated: false,
        sourceText: text,
      };
    });
  }, [scriptSections]);

  const normalizeChapterState = useCallback(
    (existingState: ChapterListState | null): ChapterListState => {
      const freshChapters = chaptersFromSections;
      const previousById = new Map((existingState?.chapters ?? []).map((chapter) => [chapter.id, chapter]));

      return {
        chapters: freshChapters.map((chapter) => {
          const previous = previousById.get(chapter.id);
          if (!previous) return chapter;

          return {
            ...chapter,
            // Keep user edits (title, variants, validation) but refresh sourceText
            title: previous.title || chapter.title,
            titleFR: previous.titleFR ?? chapter.titleFR,
            validated: previous.validated,
            variants: previous.variants ?? [],
            summary: previous.summary ?? chapter.summary,
            startSentence: chapter.startSentence || previous.startSentence,
            sourceText: chapter.sourceText, // always use fresh text from sections
          };
        }),
        method: "tags",
        lastUpdatedAt: new Date().toISOString(),
      };
    },
    [chaptersFromSections]
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
    if (chapters.length === 0) return;
    setBatchGenerating(true);

    // Use the normalized `chapters` (not chapterState.chapters which may be stale/legacy)
    const chaptersToProcess = chapters;
    const variantsMap = new Map<string, ChapterTitleVariant[]>();
    const selectedToneMap = new Map<string, string>();
    let errorCount = 0;

    for (let i = 0; i < chaptersToProcess.length; i++) {
      const ch = chaptersToProcess[i];
      setGeneratingId(ch.id);

      if (!ch.sourceText?.trim()) {
        console.warn(`Skipping chapter ${ch.id}: no sourceText`);
        errorCount++;
        continue;
      }

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
          console.error("chapter-titles error for", ch.id, error || data?.error);
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

    // Build updated chapters from the normalized list
    const updatedChapters = chaptersToProcess.map((ch) => {
      const newVars = variantsMap.get(ch.id);
      if (!newVars) return ch;

      const preferredTone = selectedToneMap.get(ch.id) || "";
      const existingVariants = ch.variants.map((v) => ({ ...v, selected: false }));
      const allVariants = [...newVars, ...existingVariants].slice(0, 20);

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
    });

    onChapterStateChange({
      chapters: updatedChapters,
      method: chapterState?.method || "tags",
      lastUpdatedAt: new Date().toISOString(),
    });

    setGeneratingId(null);
    setBatchGenerating(false);
    if (errorCount === 0) toast.success("9 chapitres générés !");
    else if (errorCount < chaptersToProcess.length) toast.warning(`${errorCount} erreur(s) sur ${chaptersToProcess.length}`);
    else toast.error("Aucun titre généré — vérifiez que le script contient du texte.");
  }, [chapters, batchTone, scriptLanguage, onChapterStateChange, chapterState?.method]);

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
          shots={shots}
          scenesForShotOrder={scenesForShotOrder}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
