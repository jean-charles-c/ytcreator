import { ChevronDown } from "lucide-react";
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

  // Try header-based split first: look for ## Hook, ## Introduction, etc.
  const headerPattern = /^#{1,3}\s*(Hook|Introduction|Act\s*1[^]*?|Act\s*2[^]*?|Act\s*3[^]*?|Climax|Révélation|Conclusion|Setup|Escalade)[^\n]*/gim;
  const headerMatches = [...cleaned.matchAll(headerPattern)];

  if (headerMatches.length >= 3) {
    // Header-based parsing
    const segments: { key: string; content: string }[] = [];
    for (let i = 0; i < headerMatches.length; i++) {
      const start = headerMatches[i].index! + headerMatches[i][0].length;
      const end = i + 1 < headerMatches.length ? headerMatches[i + 1].index! : cleaned.length;
      const headerText = headerMatches[i][1].toLowerCase().trim();
      const key = resolveKey(headerText);
      segments.push({ key, content: cleaned.slice(start, end).trim() });
    }

    // Content before first header goes to "hook"
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

  // Distribution: Hook ~10%, Intro ~10%, Act1 ~20%, Act2 ~25%, Act3 ~15%, Climax ~10%, Conclusion ~10%
  const ratios = [0.10, 0.10, 0.20, 0.25, 0.15, 0.10, 0.10];
  const counts = ratios.map((r) => Math.max(1, Math.round(r * total)));

  // Adjust to match total
  let sum = counts.reduce((a, b) => a + b, 0);
  while (sum > total && counts.length > 0) {
    const maxIdx = counts.indexOf(Math.max(...counts));
    counts[maxIdx]--;
    sum--;
  }
  while (sum < total) {
    counts[3]++; // Add extra to Act 2
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
  return "act2"; // fallback
}

interface SectionCardProps {
  section: NarrativeSection;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onContentChange?: (key: string, content: string) => void;
}

export default function SectionCard({ section, index, isOpen, onToggle, onContentChange }: SectionCardProps) {
  const wordCount = section.content ? section.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = section.content?.length || 0;

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
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-lg border border-t-0 border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
          <textarea
            value={section.content}
            onChange={(e) => onContentChange?.(section.key, e.target.value)}
            placeholder="Saisissez le contenu de cette section…"
            className="w-full min-h-[120px] bg-transparent text-sm text-foreground leading-relaxed resize-y font-body border-none outline-none focus:ring-0 p-0 placeholder:text-muted-foreground/40"
            aria-label={`Édition section ${section.label}`}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
