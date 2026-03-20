import { useState, useCallback, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Sparkles, ChevronDown, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { Chapter, ChapterTitleVariant } from "./chapterTypes";
import { SECTION_META, SECTION_TAGS, type SectionType } from "./canonicalScriptTypes";

const TONES = [
  { value: "curiosity", label: "Curiosity" },
  { value: "dramatic", label: "Dramatic" },
  { value: "informative", label: "Informative" },
  { value: "contrarian", label: "Contrarian" },
] as const;

const hookBadgeColor: Record<string, string> = {
  curiosity: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  dramatic: "bg-red-500/10 text-red-400 border-red-500/20",
  informative: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  contrarian: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

interface ChapterItemProps {
  chapter: Chapter;
  onToggleValidated: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onGenerateTitles: (id: string, tone: string) => Promise<void>;
  onSelectVariant: (chapterId: string, variantId: string) => void;
  generating?: boolean;
  isFrench?: boolean;
  shots?: Array<{ id: string; scene_id: string; shot_order: number; source_sentence: string | null; source_sentence_fr: string | null }>;
  scenesForShotOrder?: Array<{ id: string; scene_order: number }>;
}

export default function ChapterItem({
  chapter,
  onToggleValidated,
  onTitleChange,
  onGenerateTitles,
  onSelectVariant,
  generating,
  isFrench,
  shots,
  scenesForShotOrder,
}: ChapterItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapter.title);
  const [tone, setTone] = useState("curiosity");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const commitTitle = () => {
    setEditing(false);
    if (draft.trim() && draft !== chapter.title) {
      onTitleChange(chapter.id, draft.trim());
    } else {
      setDraft(chapter.title);
    }
  };

  /** Find the first matching shot and convert it to the real global shot number in project order */
  const matchingShotOrder = useMemo(() => {
    if (!shots || shots.length === 0 || !chapter.sourceText) return null;
    const srcNorm = chapter.sourceText.toLowerCase().trim();
    if (!srcNorm) return null;

    const sceneOrderMap = new Map((scenesForShotOrder || []).map((scene) => [scene.id, scene.scene_order]));
    const globallySortedShots = [...shots].sort((a, b) => {
      const sceneA = sceneOrderMap.get(a.scene_id) ?? Number.MAX_SAFE_INTEGER;
      const sceneB = sceneOrderMap.get(b.scene_id) ?? Number.MAX_SAFE_INTEGER;
      if (sceneA !== sceneB) return sceneA - sceneB;
      return a.shot_order - b.shot_order;
    });

    const matchIndex = globallySortedShots.findIndex((shot) => {
      const sent = (shot.source_sentence || shot.source_sentence_fr || "").toLowerCase().trim();
      return sent.length >= 5 && srcNorm.includes(sent);
    });

    return matchIndex >= 0 ? matchIndex + 1 : null;
  }, [shots, scenesForShotOrder, chapter.sourceText]);

  const handleGenerate = useCallback(() => {
    onGenerateTitles(chapter.id, tone);
  }, [chapter.id, tone, onGenerateTitles]);

  return (
    <div className="rounded-lg border border-border bg-background p-3 sm:p-4 transition-colors hover:bg-secondary/10 space-y-2">
      {/* Row 1: checkbox + title + shot badge */}
      <div className="flex items-start gap-3">
        <Checkbox
          checked={chapter.validated}
          onCheckedChange={() => onToggleValidated(chapter.id)}
          className="mt-1 shrink-0"
        />

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center h-5 w-5 rounded bg-primary/10 text-primary text-[10px] font-bold shrink-0">
              {chapter.index + 1}
            </span>
            {chapter.sectionType && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border shrink-0">
                {SECTION_TAGS[chapter.sectionType]}
              </span>
            )}

            {editing ? (
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === "Enter" && commitTitle()}
                autoFocus
                className="h-7 text-sm font-medium"
              />
            ) : (
              <button
                onClick={() => { setDraft(chapter.title); setEditing(true); }}
                className="text-sm font-medium text-foreground text-left truncate hover:underline decoration-primary/40 underline-offset-2"
              >
                {chapter.title}
              </button>
            )}
          </div>

          {/* French translation */}
          {!isFrench && chapter.titleFR && (
            <p className="text-xs text-muted-foreground/80 pl-7 italic">
              🇫🇷 {chapter.titleFR}
            </p>
          )}

          {chapter.startSentence && (
            <p className="text-xs text-muted-foreground line-clamp-1 pl-7">
              {matchingShotOrder != null && (
                <span className="inline-flex items-center justify-center h-4 min-w-[1.25rem] px-1 rounded bg-accent text-accent-foreground text-[10px] font-bold mr-1.5 shrink-0">
                  Shot {matchingShotOrder}
                </span>
              )}
              « {chapter.startSentence} »
            </p>
          )}
        </div>
      </div>

      {/* Collapsible details: tone selector, generate button, variants */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1 pl-7 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
            {detailsOpen ? "Masquer" : "Titres & options"}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-2 pt-2">
          {/* Tone selector + generate button */}
          <div className="flex items-center gap-2 pl-7">
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
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
              variant="outline"
              size="sm"
              disabled={generating}
              onClick={handleGenerate}
              className="h-9 sm:h-7 text-xs gap-1 min-w-[44px]"
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Générer titres
            </Button>
          </div>

          {/* Variants */}
          {chapter.variants.length > 0 && (
            <div className="space-y-1 pl-7">
              {chapter.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelectVariant(chapter.id, v.id)}
                  className={`flex items-center gap-2 w-full text-left rounded border px-2 py-2.5 sm:py-1.5 text-xs transition-colors min-h-[44px] sm:min-h-0 ${
                    v.selected
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary/30"
                  }`}
                >
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${hookBadgeColor[v.hookType] || "bg-secondary text-muted-foreground border-border"}`}>
                    {v.hookType}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{v.title}</span>
                    {!isFrench && v.titleFR && (
                      <span className="block truncate text-[10px] text-muted-foreground/60 italic">🇫🇷 {v.titleFR}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}