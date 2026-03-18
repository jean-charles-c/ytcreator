import { useState, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Loader2, Sparkles } from "lucide-react";
import type { Chapter, ChapterTitleVariant } from "./chapterTypes";

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
}

export default function ChapterItem({
  chapter,
  onToggleValidated,
  onTitleChange,
  onGenerateTitles,
  onSelectVariant,
  generating,
  isFrench,
}: ChapterItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapter.title);
  const [tone, setTone] = useState("curiosity");

  const commitTitle = () => {
    setEditing(false);
    if (draft.trim() && draft !== chapter.title) {
      onTitleChange(chapter.id, draft.trim());
    } else {
      setDraft(chapter.title);
    }
  };

  const handleGenerate = useCallback(() => {
    onGenerateTitles(chapter.id, tone);
  }, [chapter.id, tone, onGenerateTitles]);

  return (
    <div className="rounded-lg border border-border bg-background p-3 transition-colors hover:bg-secondary/10 space-y-2">
      {/* Row 1: checkbox + title */}
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
              « {chapter.startSentence} »
            </p>
          )}
        </div>
      </div>

      {/* Row 2: tone selector + generate button */}
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
          className="h-7 text-xs gap-1"
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Générer titres
        </Button>
      </div>

      {/* Row 3: variants */}
      {chapter.variants.length > 0 && (
        <div className="space-y-1 pl-7">
          {chapter.variants.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelectVariant(chapter.id, v.id)}
              className={`flex items-center gap-2 w-full text-left rounded border px-2 py-1.5 text-xs transition-colors ${
                v.selected
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary/30"
              }`}
            >
              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${hookBadgeColor[v.hookType] || "bg-secondary text-muted-foreground border-border"}`}>
                {v.hookType}
              </span>
              <span className="truncate">{v.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
