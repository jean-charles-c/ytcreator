import { useRef, useEffect, useState } from "react";
import { ChevronDown, RotateCcw, Loader2, History, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface NarrativeSection {
  key: string;
  label: string;
  icon: string;
  content: string;
}

/** Fixed narrative structure — order matters */
export const NARRATIVE_SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "hook", label: "Hook", icon: "🎣" },
  { key: "introduction", label: "Introduction", icon: "📖" },
  { key: "act1", label: "Act 1 — Setup", icon: "🏗️" },
  { key: "act2", label: "Act 2 — Escalade", icon: "⚡" },
  { key: "act3", label: "Act 3 — Climax", icon: "🔥" },
  { key: "climax", label: "Révélation", icon: "💡" },
  { key: "conclusion", label: "Conclusion", icon: "🎬" },
];

/**
 * Parse a monolithic script into narrative sections.
 * Attempts to split by markdown-style headers (## Hook, ## Act 1, etc.)
 * or by paragraph count as fallback.
 */
export function parseScriptIntoSections(script: string): NarrativeSection[] {
  if (!script || !script.trim()) {
    return NARRATIVE_SECTIONS.map((s) => ({ ...s, content: "" }));
  }

  const cleaned = script.trim();

  // Try header-based split first
  const headerPattern = /^#{1,3}\s*(Hook|Introduction|Act\s*1[^]*?|Act\s*2[^]*?|Act\s*3[^]*?|Climax|Révélation|Conclusion|Setup|Escalade)[^\n]*/gim;
  const headerMatches = [...cleaned.matchAll(headerPattern)];

  if (headerMatches.length >= 3) {
    const segments: { key: string; content: string }[] = [];
    for (let i = 0; i < headerMatches.length; i++) {
      const start = headerMatches[i].index! + headerMatches[i][0].length;
      const end = i + 1 < headerMatches.length ? headerMatches[i + 1].index! : cleaned.length;
      const headerText = headerMatches[i][1].toLowerCase().trim();
      const key = resolveKey(headerText);
      segments.push({ key, content: cleaned.slice(start, end).trim() });
    }

    if (headerMatches[0].index! > 0) {
      const preContent = cleaned.slice(0, headerMatches[0].index!).trim();
      if (preContent) {
        const hookSeg = segments.find((s) => s.key === "hook");
        if (hookSeg) hookSeg.content = preContent + "\n\n" + hookSeg.content;
        else segments.unshift({ key: "hook", content: preContent });
      }
    }

    return NARRATIVE_SECTIONS.map((s) => ({
      ...s,
      content: segments.find((seg) => seg.key === s.key)?.content || "",
    }));
  }

  // Fallback: split by paragraphs proportionally
  const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim());
  const total = paragraphs.length;
  const ratios = [0.10, 0.10, 0.20, 0.25, 0.15, 0.10, 0.10];
  const counts = ratios.map((r) => Math.max(1, Math.round(r * total)));

  let sum = counts.reduce((a, b) => a + b, 0);
  while (sum > total && counts.length > 0) {
    const maxIdx = counts.indexOf(Math.max(...counts));
    counts[maxIdx]--;
    sum--;
  }
  while (sum < total) {
    counts[3]++;
    sum++;
  }

  let offset = 0;
  return NARRATIVE_SECTIONS.map((s, i) => {
    const sectionParas = paragraphs.slice(offset, offset + counts[i]);
    offset += counts[i];
    return { ...s, content: sectionParas.join("\n\n") };
  });
}

function resolveKey(headerText: string): string {
  if (/hook/i.test(headerText)) return "hook";
  if (/introduction/i.test(headerText)) return "introduction";
  if (/act\s*1|setup/i.test(headerText)) return "act1";
  if (/act\s*2|escalade/i.test(headerText)) return "act2";
  if (/act\s*3/i.test(headerText)) return "act3";
  if (/climax|révélation|revelation/i.test(headerText)) return "climax";
  if (/conclusion/i.test(headerText)) return "conclusion";
  return "act2";
}

/** Reassemble sections back into a single script string */
export function reassembleSections(sections: NarrativeSection[]): string {
  return sections
    .filter((s) => s.content.trim())
    .map((s) => s.content.trim())
    .join("\n\n");
}

export interface SectionHistoryEntry {
  content: string;
  timestamp: string;
  label?: string;
}

interface SectionCardProps {
  section: NarrativeSection;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onContentChange?: (key: string, content: string) => void;
  onRegenerate?: (key: string) => Promise<void>;
  regenerating?: boolean;
  history?: SectionHistoryEntry[];
  onRestore?: (key: string, content: string) => void;
}

export default function SectionCard({ section, index, isOpen, onToggle, onContentChange, onRegenerate, regenerating, history, onRestore }: SectionCardProps) {
  const wordCount = section.content ? section.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = section.content?.length || 0;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (el && isOpen) {
      el.style.height = "auto";
      el.style.height = Math.max(120, el.scrollHeight) + "px";
    }
  }, [section.content, isOpen]);

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full rounded-t-lg border border-border bg-card px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between hover:bg-secondary/30 transition-colors group data-[state=closed]:rounded-b-lg">
        <div className="flex items-center gap-2.5">
          <span className="text-base leading-none" role="img" aria-label={section.label}>
            {section.icon}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold text-foreground">
              {section.label}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
              {charCount > 0 ? `${charCount.toLocaleString()} car. · ${wordCount} mots` : "vide"}
            </span>
            {history && history.length > 0 && (
              <span className="text-[10px] text-muted-foreground font-mono">
                · {history.length} ver.
              </span>
            )}
            {regenerating && (
              <span className="flex items-center gap-1 text-[10px] text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> Régénération…
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-lg border border-t-0 border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center justify-end gap-2 mb-2">
            {history && history.length > 0 && onRestore && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setHistoryOpen(!historyOpen); }}
                className="h-7 text-[11px] gap-1.5"
              >
                <History className="h-3 w-3" />
                Historique ({history.length})
              </Button>
            )}
            {onRegenerate && (
              <Button
                variant="outline"
                size="sm"
                disabled={regenerating}
                onClick={(e) => { e.stopPropagation(); onRegenerate(section.key); }}
                className="h-7 text-[11px] gap-1.5"
              >
                {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Régénérer
              </Button>
            )}
          </div>

          {/* History panel */}
          {historyOpen && history && history.length > 0 && onRestore && (
            <div className="mb-3 rounded border border-border bg-background p-3 space-y-2 max-h-[250px] overflow-y-auto">
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Versions précédentes
              </p>
              {history.map((entry, i) => (
                <div key={i} className="rounded border border-border bg-card p-2.5 group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">
                      {entry.label || `V${history.length - i}`} — {formatTimestamp(entry.timestamp)} — {entry.content.length.toLocaleString()} car.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { onRestore(section.key, entry.content); setHistoryOpen(false); }}
                      className="h-5 text-[9px] px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Restaurer
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-2">
                    {entry.content.slice(0, 200)}{entry.content.length > 200 ? "…" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={section.content}
            onChange={(e) => onContentChange?.(section.key, e.target.value)}
            placeholder="Saisissez le contenu de cette section…"
            className="w-full min-h-[120px] bg-transparent text-sm text-foreground leading-relaxed resize-y font-body border-none outline-none focus:ring-0 p-0 placeholder:text-muted-foreground/40"
            aria-label={`Édition section ${section.label}`}
            disabled={regenerating}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}