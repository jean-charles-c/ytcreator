import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Chapter } from "./chapterTypes";

interface ChapterItemProps {
  chapter: Chapter;
  onToggleValidated: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
}

export default function ChapterItem({ chapter, onToggleValidated, onTitleChange }: ChapterItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapter.title);

  const commitTitle = () => {
    setEditing(false);
    if (draft.trim() && draft !== chapter.title) {
      onTitleChange(chapter.id, draft.trim());
    } else {
      setDraft(chapter.title);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-secondary/20">
      {/* Checkbox */}
      <Checkbox
        checked={chapter.validated}
        onCheckedChange={() => onToggleValidated(chapter.id)}
        className="mt-1 shrink-0"
      />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Index badge + editable title */}
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

        {/* Start sentence */}
        {chapter.startSentence && (
          <p className="text-xs text-muted-foreground line-clamp-1 pl-7">
            « {chapter.startSentence} »
          </p>
        )}

        {/* Summary */}
        {chapter.summary && (
          <p className="text-xs text-muted-foreground/70 pl-7">
            {chapter.summary}
          </p>
        )}
      </div>
    </div>
  );
}
