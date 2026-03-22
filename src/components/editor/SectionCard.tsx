import { useRef, useEffect, useState } from "react";
import { ChevronDown, RotateCcw, Loader2, History, Clock, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { parseTaggedScript } from "./tagParser";

export interface NarrativeSection {
  key: string;
  label: string;
  icon: string;
  content: string;
}

/** Core narrative blocks (1-10) — the actual script */
export const NARRATIVE_SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "hook", label: "Hook", icon: "🎣" },
  { key: "context", label: "Context", icon: "📖" },
  { key: "promise", label: "Promise", icon: "🎯" },
  { key: "act1", label: "Act 1 — Setup", icon: "🏗️" },
  { key: "act2", label: "Act 2 — Escalade", icon: "⚡" },
  { key: "act2b", label: "Act 2B — Contre-point", icon: "🔀" },
  { key: "act3", label: "Act 3 — Impact", icon: "🔥" },
  { key: "climax", label: "Climax", icon: "💡" },
  { key: "insight", label: "Insight", icon: "🧠" },
  { key: "conclusion", label: "Conclusion", icon: "🎬" },
];

/** Editorial assist blocks (11-13) — optional quality layer */
export const EDITORIAL_SECTIONS: { key: string; label: string; icon: string }[] = [
  { key: "transitions", label: "Transitions", icon: "🔗" },
  { key: "style_check", label: "Style Check", icon: "🎨" },
  { key: "risk_check", label: "Risk Check", icon: "⚠️" },
];

/** All 13 sections for parsing */
export const ALL_SECTIONS = [...NARRATIVE_SECTIONS, ...EDITORIAL_SECTIONS];

export function parseScriptIntoSections(script: string): NarrativeSection[] {
  if (!script || !script.trim()) {
    return ALL_SECTIONS.map((s) => ({ ...s, content: "" }));
  }

  // V3: Use deterministic tag parser (priority path)
  const parsed = parseTaggedScript(script);

  if (parsed.tagged) {
    return ALL_SECTIONS.map((s) => ({
      ...s,
      content: parsed.sections.find((seg) => seg.key === s.key)?.content || "",
    }));
  }

  // Legacy fallback: header-based parsing
  const cleaned = script.trim();
  const headerPattern = /^#{1,3}\s*(Hook|Context|Promise|Introduction|Act\s*1[^]*?|Act\s*2[^]*?|Act\s*3[^]*?|Climax|Insight|Révélation|Conclusion|Setup|Escalade)[^\n]*/gim;
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

  // Final fallback: proportional split (core blocks only)
  const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim());
  const total = paragraphs.length;
  const ratios = [0.02, 0.10, 0.05, 0.15, 0.20, 0.10, 0.15, 0.08, 0.05, 0.04];
  const counts = ratios.map((r) => Math.max(1, Math.round(r * total)));

  let sum = counts.reduce((a, b) => a + b, 0);
  while (sum > total && counts.length > 0) {
    const maxIdx = counts.indexOf(Math.max(...counts));
    counts[maxIdx]--;
    sum--;
  }
  while (sum < total) {
    counts[4]++; // act2 gets extra
    sum++;
  }

  let offset = 0;
  // Only assign to core narrative sections for fallback
  return ALL_SECTIONS.map((s, i) => {
    if (i < NARRATIVE_SECTIONS.length) {
      const sectionParas = paragraphs.slice(offset, offset + counts[i]);
      offset += counts[i];
      return { ...s, content: sectionParas.join("\n\n") };
    }
    return { ...s, content: "" };
  });
}

function resolveKey(headerText: string): string {
  if (/hook/i.test(headerText)) return "hook";
  if (/context/i.test(headerText)) return "context";
  if (/promise/i.test(headerText)) return "promise";
  if (/introduction/i.test(headerText)) return "context";
  if (/act\s*1|setup/i.test(headerText)) return "act1";
  if (/act\s*2|escalade/i.test(headerText)) return "act2";
  if (/act\s*3/i.test(headerText)) return "act3";
  if (/climax|révélation|revelation/i.test(headerText)) return "climax";
  if (/insight/i.test(headerText)) return "insight";
  if (/conclusion/i.test(headerText)) return "conclusion";
  return "act2";
}

/** Tag map for reassembly — keeps tags so parseScriptIntoSections can round-trip */
const SECTION_TAG_MAP: Record<string, string> = {
  hook: "[[HOOK]]",
  context: "[[CONTEXT]]",
  promise: "[[PROMISE]]",
  act1: "[[ACT1]]",
  act2: "[[ACT2]]",
  act3: "[[ACT3]]",
  climax: "[[CLIMAX]]",
  insight: "[[INSIGHT]]",
  conclusion: "[[CONCLUSION]]",
};

/** Reassemble sections back into a single script string, preserving tags for round-trip parsing */
export function reassembleSections(sections: NarrativeSection[]): string {
  return sections
    .filter((s) => s.content.trim())
    .map((s) => {
      const tag = SECTION_TAG_MAP[s.key] || "";
      const body = s.content.trim();
      // Don't double-add tag if content already starts with it
      if (tag && body.startsWith(tag)) return body;
      return tag ? `${tag}\n${body}` : body;
    })
    .join("\n\n");
}

/** Content rules patterns to strip from generated scripts */
const GREETING_PATTERNS = [
  /^(Welcome to|Bienvenue sur|Bienvenue à|Bienvenue dans)\s+[^\n.!?]*[.!?]?\s*/gim,
  /^(Today we|Aujourd'hui nous|In this video|Dans cette vidéo|In today's video|Dans la vidéo d'aujourd'hui)[^\n.!?]*[.!?]?\s*/gim,
  /^(Hey everyone|Salut à tous|Hello everyone|Bonjour à tous)[^\n.!?]*[.!?]?\s*/gim,
];

export function sanitizeNarrativeSections(sections: NarrativeSection[]): { sections: NarrativeSection[]; warnings: string[] } {
  const warnings: string[] = [];

  const sanitized = sections.map((s) => {
    let content = s.content;
    for (const pattern of GREETING_PATTERNS) {
      const before = content;
      content = content.replace(pattern, "");
      if (content !== before) {
        warnings.push(`Formule d'accueil retirée de "${s.label}"`);
      }
    }
    content = content.replace(/^#{1,3}\s+.+$/gm, "").trim();
    content = content.replace(/\n{3,}/g, "\n\n").trim();
    return { ...s, content };
  });

  const emptySections = sanitized.filter((s) => !s.content.trim());
  if (emptySections.length > 0) {
    warnings.push(`Section(s) vide(s) : ${emptySections.map((s) => s.label).join(", ")}`);
  }

  return { sections: sanitized, warnings };
}

export interface SectionHistoryEntry {
  content: string;
  timestamp: string;
  label?: string;
}

/* ── Visual hierarchy per section type ─────────────── */

const SECTION_ACCENTS: Record<string, { border: string; bg: string; badge: string }> = {
  hook:         { border: "border-l-amber-500",   bg: "bg-amber-500/5",   badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  context:      { border: "border-l-sky-500",     bg: "bg-sky-500/5",     badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  promise:      { border: "border-l-cyan-500",    bg: "bg-cyan-500/5",    badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" },
  act1:         { border: "border-l-emerald-500", bg: "bg-emerald-500/5", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  act2:         { border: "border-l-violet-500",  bg: "bg-violet-500/5",  badge: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  act2b:        { border: "border-l-purple-500",  bg: "bg-purple-500/5",  badge: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  act3:         { border: "border-l-rose-500",    bg: "bg-rose-500/5",    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  climax:       { border: "border-l-orange-500",  bg: "bg-orange-500/5",  badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  insight:      { border: "border-l-teal-500",    bg: "bg-teal-500/5",    badge: "bg-teal-500/10 text-teal-700 dark:text-teal-400" },
  conclusion:   { border: "border-l-indigo-500",  bg: "bg-indigo-500/5",  badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400" },
  transitions:  { border: "border-l-slate-400",   bg: "bg-slate-400/5",   badge: "bg-slate-400/10 text-slate-600 dark:text-slate-400" },
  style_check:  { border: "border-l-pink-400",    bg: "bg-pink-400/5",    badge: "bg-pink-400/10 text-pink-600 dark:text-pink-400" },
  risk_check:   { border: "border-l-yellow-500",  bg: "bg-yellow-500/5",  badge: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
};

const DEFAULT_ACCENT = { border: "border-l-border", bg: "", badge: "bg-muted text-muted-foreground" };

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
  translation?: string | null;
  translating?: boolean;
  onTranslate?: (key: string) => void;
  showTranslation?: boolean;
  scriptLanguage?: string;
  /** If true, renders with editorial assist styling */
  editorial?: boolean;
}

export default function SectionCard({
  section, index, isOpen, onToggle, onContentChange, onRegenerate, regenerating,
  history, onRestore, translation, translating, onTranslate, scriptLanguage, editorial,
}: SectionCardProps) {
  const charCount = section.content?.length || 0;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const accent = SECTION_ACCENTS[section.key] || DEFAULT_ACCENT;
  const isEmpty = !section.content.trim();
  const isFrenchScript = scriptLanguage === "fr";

  // Auto-trigger translation when section is opened with content but no translation
  const autoTranslateTriggered = useRef(false);
  useEffect(() => {
    if (
      !isFrenchScript &&
      section.content.trim() &&
      !translation &&
      !translating &&
      onTranslate &&
      isOpen &&
      !autoTranslateTriggered.current
    ) {
      autoTranslateTriggered.current = true;
      onTranslate(section.key);
    }
  }, [isFrenchScript, section.content, translation, translating, onTranslate, isOpen, section.key]);

  // Reset auto-trigger when translation is invalidated
  useEffect(() => {
    if (!translation) {
      autoTranslateTriggered.current = false;
    }
  }, [translation]);

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

  const langLabel = scriptLanguage === "en" ? "English" : scriptLanguage === "es" ? "Español" : scriptLanguage === "de" ? "Deutsch" : scriptLanguage === "pt" ? "Português" : scriptLanguage === "it" ? "Italiano" : scriptLanguage?.toUpperCase() || "Original";

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      {/* ── Trigger / Header ─────────────────────────── */}
      <CollapsibleTrigger
        className={`
          w-full rounded-t-lg border border-border bg-card
          border-l-[3px] ${accent.border}
          px-3 py-3 sm:px-5 sm:py-3.5
          flex items-center justify-between
          hover:bg-secondary/30 transition-colors group
          data-[state=closed]:rounded-b-lg
          min-h-[48px]
        `}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-base leading-none shrink-0" role="img" aria-label={section.label}>
            {section.icon}
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2.5 min-w-0">
            <span className="font-display text-sm font-semibold text-foreground truncate">
              {section.label}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${accent.badge}`}>
                {index + 1}/9
              </span>
              {isEmpty ? (
                <span className="text-[10px] text-muted-foreground/50 font-mono italic">vide</span>
              ) : (
                <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                  {charCount.toLocaleString()} car.
                </span>
              )}
              {history && history.length > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  · {history.length} ver.
                </span>
              )}
              {!isFrenchScript && translation && (
                <span className="text-[10px] text-primary font-mono">· FR ✓</span>
              )}
              {regenerating && (
                <span className="flex items-center gap-1 text-[10px] text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Régénération…</span>
                </span>
              )}
              {translating && (
                <span className="flex items-center gap-1 text-[10px] text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Traduction…</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ml-2 ${isOpen ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>

      {/* ── Content panel ────────────────────────────── */}
      <CollapsibleContent>
        <div className={`rounded-b-lg border border-t-0 border-border border-l-[3px] ${accent.border} bg-card px-3 py-3 sm:px-5 sm:py-4`}>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 mb-2 flex-wrap">
            {history && history.length > 0 && onRestore && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setHistoryOpen(!historyOpen); }}
                className="min-h-[36px] sm:h-7 text-[11px] gap-1 sm:gap-1.5 px-2 sm:px-3"
              >
                <History className="h-3 w-3" />
                <span className="hidden sm:inline">Historique ({history.length})</span>
                <span className="sm:hidden">{history.length}</span>
              </Button>
            )}
            {onRegenerate && (
              <Button
                variant="outline"
                size="sm"
                disabled={regenerating}
                onClick={(e) => { e.stopPropagation(); onRegenerate(section.key); }}
                className="min-h-[36px] sm:h-7 text-[11px] gap-1 sm:gap-1.5 px-2 sm:px-3"
              >
                {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                <span className="hidden sm:inline">Régénérer</span>
              </Button>
            )}
          </div>

          {/* History panel */}
          {historyOpen && history && history.length > 0 && onRestore && (
            <div className="mb-3 rounded border border-border bg-background p-2 sm:p-3 space-y-2 max-h-[200px] sm:max-h-[250px] overflow-y-auto">
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Versions précédentes
              </p>
              {history.map((entry, i) => (
                <div key={i} className="rounded border border-border bg-card p-2 sm:p-2.5">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-[10px] text-muted-foreground truncate">
                      {entry.label || `V${history.length - i}`} — {formatTimestamp(entry.timestamp)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { onRestore(section.key, entry.content); setHistoryOpen(false); }}
                      className="min-h-[28px] h-auto text-[10px] px-2 shrink-0"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Restaurer
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-2">
                    {entry.content.slice(0, 150)}{entry.content.length > 150 ? "…" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Dual-block layout: Original + French ── */}
          <div className={`${!isFrenchScript ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : ""}`}>
            {/* Block 1: Original language */}
            <div className={!isFrenchScript ? "space-y-1" : ""}>
              {!isFrenchScript && (
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {langLabel}
                </p>
              )}
              <textarea
                ref={textareaRef}
                value={section.content}
                onChange={(e) => onContentChange?.(section.key, e.target.value)}
                placeholder="Saisissez le contenu de cette section…"
                className="w-full min-h-[100px] sm:min-h-[120px] bg-transparent text-[13px] sm:text-sm text-foreground leading-relaxed resize-y font-body border-none outline-none focus:ring-0 p-0 placeholder:text-muted-foreground/40"
                aria-label={`Édition section ${section.label}`}
                disabled={regenerating}
              />
            </div>

            {/* Block 2: French translation (always visible for non-FR scripts) */}
            {!isFrenchScript && (
              <div className="space-y-1 rounded border border-primary/15 bg-primary/5 p-2 sm:p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Languages className="h-3 w-3" /> Français
                  </p>
                  {translation && !translating && onTranslate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onTranslate(section.key)}
                      className="h-6 text-[10px] px-2 gap-1 text-primary hover:text-primary"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Retraduire
                    </Button>
                  )}
                </div>
                {translating ? (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Traduction en cours…</span>
                  </div>
                ) : translation ? (
                  <p className="text-[13px] sm:text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap font-body">
                    {translation}
                  </p>
                ) : isEmpty ? (
                  <p className="text-xs text-muted-foreground/50 italic py-2">Aucun contenu à traduire</p>
                ) : (
                  <p className="text-xs text-muted-foreground/50 italic py-2">Traduction en attente…</p>
                )}
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
