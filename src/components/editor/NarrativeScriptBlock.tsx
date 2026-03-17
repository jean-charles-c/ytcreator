import { useRef } from "react";
import { ScrollText, Loader2, ChevronDown, Copy, ArrowRight, RotateCcw, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import SectionCard, { type NarrativeSection, type SectionHistoryEntry } from "./SectionCard";

/* ── Types ─────────────────────────────────────────── */

export interface ScriptVersion {
  id: number;
  content: string;
}

type BlockState = "empty" | "loading" | "error" | "success";

export interface NarrativeScriptBlockProps {
  /* State */
  script: string | null;
  generatingScript: boolean;
  sections: NarrativeSection[];
  scriptVersions: ScriptVersion[];
  currentVersionId: number | null;
  sectionHistory: Record<string, SectionHistoryEntry[]>;
  sectionTranslations: Record<string, string>;
  translatingSections: Set<string>;
  regeneratingSection: string | null;
  openSections: Set<string>;
  scriptLanguage: string;
  error?: string | null;

  /* Handlers */
  onToggleOpen: (open: boolean) => void;
  isOpen: boolean;
  onSectionToggle: (key: string) => void;
  onSectionContentChange: (key: string, content: string) => void;
  onRegenerateSection: (key: string) => Promise<void>;
  onRestoreSection: (key: string, content: string) => void;
  onTranslateSection: (key: string) => void;
  onCopyScript: () => void;
  onSendToNarration: () => void;
  onScriptVersionRestore: (version: ScriptVersion) => void;
  onVersionPreviewToggle: (id: number | null) => void;
  showVersionPreviewId: number | null;

  /* Regeneration controls */
  onRegenerate: () => void;
  canRegenerate: boolean;

  /* AI Analysis */
  analyzingScript?: boolean;
  onAnalyzeScript?: () => void;

  /* Toolbar extras (language, style, chars) */
  toolbarSlot?: React.ReactNode;
}

/* ── Helpers ───────────────────────────────────────── */

function cleanScriptForExport(raw: string): string {
  return raw.replace(/<plan>[\s\S]*?<\/plan>/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}

function deriveState(script: string | null, generatingScript: boolean, error?: string | null): BlockState {
  if (error) return "error";
  if (generatingScript && (!script || !script.trim())) return "loading";
  if (script && script.trim()) return "success";
  return "empty";
}

/* ── Component ─────────────────────────────────────── */

export default function NarrativeScriptBlock({
  script,
  generatingScript,
  sections,
  scriptVersions,
  currentVersionId,
  sectionHistory,
  sectionTranslations,
  translatingSections,
  regeneratingSection,
  openSections,
  scriptLanguage,
  error,
  onToggleOpen,
  isOpen,
  onSectionToggle,
  onSectionContentChange,
  onRegenerateSection,
  onRestoreSection,
  onTranslateSection,
  onCopyScript,
  onSendToNarration,
  onScriptVersionRestore,
  onVersionPreviewToggle,
  showVersionPreviewId,
  onRegenerate,
  canRegenerate,
  analyzingScript,
  onAnalyzeScript,
  toolbarSlot,
}: NarrativeScriptBlockProps) {
  const scriptEndRef = useRef<HTMLDivElement>(null);
  const state = deriveState(script, generatingScript, error);

  /* Don't render at all when truly empty and not loading */
  if (state === "empty") return null;

  return (
    <Collapsible open={isOpen} onOpenChange={onToggleOpen} className="mt-6">
      {/* ── Header ──────────────────────────────────── */}
      <CollapsibleTrigger className="w-full rounded-lg border border-border bg-card p-4 sm:p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold text-foreground">Script narratif</h3>
          {state === "success" && !generatingScript && script && (
            <span className="text-xs text-muted-foreground">
              {script.length.toLocaleString()} car.
            </span>
          )}
          {generatingScript && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" /> Écriture…
            </span>
          )}
          {state === "error" && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" /> Erreur
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 animate-fade-in">
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">

          {/* ── Loading state ───────────────────────── */}
          {state === "loading" && (
            <div className="flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Génération de la structure et du script…</p>
            </div>
          )}

          {/* ── Error state ─────────────────────────── */}
          {state === "error" && (
            <div className="flex items-center gap-2 p-3 rounded border border-destructive/20 bg-destructive/5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <p className="text-sm text-destructive">{error || "Une erreur est survenue."}</p>
            </div>
          )}

          {/* ── Success state ───────────────────────── */}
          {state === "success" && (
            <>
              {/* Toolbar */}
              {!generatingScript && script && (
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <Button variant="outline" size="sm" onClick={onCopyScript} className="h-8 text-xs">
                    <Copy className="h-3 w-3" /> Copier
                  </Button>
                  <Button variant="hero" size="sm" onClick={onSendToNarration} className="h-8 text-xs">
                    <ArrowRight className="h-3 w-3" /> ScriptInput
                  </Button>

                  {/* Extra controls injected by parent */}
                  {toolbarSlot}

                  <Button
                    variant="hero"
                    size="sm"
                    onClick={onRegenerate}
                    disabled={!canRegenerate}
                    className="h-8 text-xs"
                  >
                    <RotateCcw className="h-3 w-3" /> Régénérer
                  </Button>
                  {onAnalyzeScript && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onAnalyzeScript}
                      disabled={analyzingScript || generatingScript}
                      className="h-8 text-xs"
                    >
                      {analyzingScript ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {analyzingScript ? "Analyse…" : "Analyser la structure"}
                    </Button>
                  )}
                </div>
              )}

              {/* Versions */}
              {scriptVersions.length > 0 && !generatingScript && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {scriptVersions.map((version) => (
                      <button
                        key={version.id}
                        onClick={() =>
                          onVersionPreviewToggle(showVersionPreviewId === version.id ? null : version.id)
                        }
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium ${
                          currentVersionId === version.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                        }`}
                      >
                        V{version.id}
                        {currentVersionId === version.id && (
                          <span className="ml-1 text-[9px] opacity-70">actuelle</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {showVersionPreviewId !== null && (() => {
                    const previewVersion = scriptVersions.find((v) => v.id === showVersionPreviewId);
                    if (!previewVersion) return null;

                    return (
                      <div className="mt-2 rounded border border-border bg-background p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] text-muted-foreground">
                            Version {previewVersion.id} — {previewVersion.content.length.toLocaleString()} car.
                          </span>
                          <div className="flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(cleanScriptForExport(previewVersion.content));
                                toast.success("Version copiée");
                              }}
                              className="h-6 text-[10px] px-2"
                            >
                              <Copy className="h-2.5 w-2.5" /> Copier
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onScriptVersionRestore(previewVersion)}
                              className="h-6 text-[10px] px-2"
                            >
                              <RotateCcw className="h-2.5 w-2.5" /> Restaurer
                            </Button>
                          </div>
                        </div>
                        <div className="max-h-[150px] overflow-y-auto">
                          <pre className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-body">
                            {previewVersion.content.slice(0, 2000)}…
                          </pre>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* SectionCards — modular narrative view */}
              <div className="space-y-2">
                {sections.map((section, idx) => (
                  <SectionCard
                    key={section.key}
                    section={section}
                    index={idx}
                    isOpen={openSections.has(section.key)}
                    onToggle={() => onSectionToggle(section.key)}
                    onContentChange={onSectionContentChange}
                    onRegenerate={onRegenerateSection}
                    regenerating={regeneratingSection === section.key}
                    history={sectionHistory[section.key] || []}
                    onRestore={onRestoreSection}
                    translation={sectionTranslations[section.key] || null}
                    translating={translatingSections.has(section.key)}
                    onTranslate={onTranslateSection}
                    showTranslation={!!sectionTranslations[section.key]}
                    scriptLanguage={scriptLanguage}
                  />
                ))}
              </div>
              <div ref={scriptEndRef} />
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
