import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, X, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Swords, ScrollText, Download, ArrowRight, ChevronDown, Copy, Mic, Plus, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface NarrativeAnalysis {
  central_mystery: string;
  main_contradiction: string;
  intriguing_discoveries: string[];
  narrative_tensions: { title: string; description: string }[];
}

interface DocSection {
  section_key: string;
  section_label: string;
  video_title: string;
  narrative_description: string;
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "it", label: "Italiano" },
];

interface PdfDocumentaryTabProps {
  projectId: string | null;
  scriptLanguage: string;
  onLanguageChange?: (lang: string) => void;
  onSendToScriptInput?: (text: string) => void;
  onAnalysisReady?: (analysis: NarrativeAnalysis, text: string) => void;
  onScriptReady?: (script: string) => void;
  // Lifted state for persistence
  extractedText: string | null;
  onExtractedTextChange: (text: string | null) => void;
  pageCount: number;
  onPageCountChange: (count: number) => void;
  fileName: string | null;
  onFileNameChange: (name: string | null) => void;
  analysis: NarrativeAnalysis | null;
  onAnalysisChange: (analysis: NarrativeAnalysis | null) => void;
  docStructure: DocSection[] | null;
  onDocStructureChange: (structure: DocSection[] | null) => void;
  script: string | null;
  onScriptChange: (script: string | null) => void;
}

export default function PdfDocumentaryTab({
  projectId, scriptLanguage, onLanguageChange, onSendToScriptInput, onAnalysisReady, onScriptReady,
  extractedText, onExtractedTextChange, pageCount, onPageCountChange, fileName, onFileNameChange,
  analysis, onAnalysisChange, docStructure, onDocStructureChange, script, onScriptChange,
}: PdfDocumentaryTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [findingTension, setFindingTension] = useState(false);
  const [previousScripts, setPreviousScripts] = useState<string[]>([]);
  const [showPreviousScript, setShowPreviousScript] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scriptEndRef = useRef<HTMLDivElement>(null);

  // Combined: extract PDF text then immediately run analysis
  const extractAndAnalyze = useCallback(async (pdfFile: File) => {
    setParsing(true);
    onExtractedTextChange(null);
    onAnalysisChange(null);
    onDocStructureChange(null);
    onScriptChange(null);
    let fullText = "";
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      onPageCountChange(pdf.numPages);
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(" ").replace(/\s+/g, " ").trim();
        if (text) pages.push(text);
      }
      fullText = pages.join("\n\n");
      if (!fullText.trim()) { toast.error("Aucun texte détecté dans ce PDF."); setParsing(false); return; }
      onExtractedTextChange(fullText);
      toast.success(`${pdf.numPages} page(s) extraite(s)`);
    } catch (err) { console.error("PDF parse error:", err); toast.error("Erreur lors de la lecture du PDF"); setParsing(false); return; }
    setParsing(false);

    // Auto-chain: run analysis
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-pdf", { body: { text: fullText } });
      if (error) { toast.error("Erreur d'analyse"); console.error(error); setAnalyzing(false); return; }
      if (data?.error) { toast.error(data.error); setAnalyzing(false); return; }
      onAnalysisChange(data.analysis);
      onAnalysisReady?.(data.analysis, fullText);
      toast.success("Analyse narrative terminée");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setAnalyzing(false);
  }, [onAnalysisReady, onExtractedTextChange, onAnalysisChange, onDocStructureChange, onScriptChange, onPageCountChange]);

  // Combined: generate structure then script automatically
  const runFullScriptGeneration = useCallback(async (isRegenerate = false) => {
    if (!analysis || !extractedText) return;
    // Save current script before regenerating
    if (isRegenerate && script) {
      setPreviousScripts((prev) => [...prev, script]);
    }
    setGeneratingScript(true);
    setScriptOpen(true);
    onScriptChange("");

    // Step 1: Generate structure
    let sections: DocSection[];
    try {
      const { data, error } = await supabase.functions.invoke("documentary-structure", {
        body: { analysis, text: extractedText },
      });
      if (error || data?.error) {
        toast.error("Erreur de génération de la structure");
        console.error(error || data?.error);
        setGeneratingScript(false);
        return;
      }
      sections = data.sections;
      onDocStructureChange(sections);
      toast.success("Structure documentaire générée");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); setGeneratingScript(false); return; }

    // Step 2: Generate script (streaming)
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ analysis, structure: sections, text: extractedText, language: scriptLanguage }),
        }
      );
      if (!resp.ok || !resp.body) {
        toast.error("Erreur de génération du script");
        console.error(await resp.text());
        setGeneratingScript(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              full += content;
              onScriptChange(full);
            }
          } catch { /* partial */ }
        }
      }

      onScriptChange(full);
      onScriptReady?.(full);
      toast.success(`Script généré — ${full.length.toLocaleString()} caractères`);
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setGeneratingScript(false);
  }, [analysis, extractedText, scriptLanguage, script, onDocStructureChange, onScriptChange, onScriptReady]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") { setFile(dropped); onFileNameChange(dropped.name); onExtractedTextChange(null); onAnalysisChange(null); onDocStructureChange(null); onScriptChange(null); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") { setFile(selected); onFileNameChange(selected.name); onExtractedTextChange(null); onAnalysisChange(null); onDocStructureChange(null); onScriptChange(null); }
  };

  const removeFile = () => {
    setFile(null); onFileNameChange(null); onExtractedTextChange(null); onAnalysisChange(null); onDocStructureChange(null); onScriptChange(null); onPageCountChange(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const cleanScriptForExport = (raw: string): string => {
    return raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("---") && line.trim() !== "")
      .map((line) => line.trim())
      .join("\n");
  };

  const splitIntoVoiceOverBlocks = (raw: string): string[] => {
    const clean = cleanScriptForExport(raw);
    const sentences = clean.split(/(?<=\.)\s+/);
    const blocks: string[] = [];
    let currentBlock = "";

    for (const sentence of sentences) {
      const candidate = currentBlock ? currentBlock + " " + sentence : sentence;
      if (candidate.length > 8300 && currentBlock.length > 0) {
        blocks.push(currentBlock.trim());
        currentBlock = sentence;
      } else {
        currentBlock = candidate;
      }
    }
    if (currentBlock.trim()) blocks.push(currentBlock.trim());
    return blocks;
  };

  const exportVoiceOverBlocks = () => {
    if (!script) return;
    const blocks = splitIntoVoiceOverBlocks(script);
    const output = blocks.map((block, i) => `Voice Over Block ${i + 1} (${block.length} chars)\n\n${block}`).join("\n\n---\n\n");
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "voice_over_blocks.md"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${blocks.length} bloc(s) Voice Over exporté(s)`);
  };

  const copyScriptToClipboard = () => {
    if (!script) return;
    const clean = cleanScriptForExport(script);
    navigator.clipboard.writeText(clean).then(() => {
      toast.success("Script copié dans le presse-papiers");
    }).catch(() => {
      toast.error("Impossible de copier");
    });
  };

  const hasResults = !!(analysis || (script !== null && script !== ""));

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        Script Narratif &amp; Voice Over
      </h2>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Importez un dossier de recherche PDF pour générer un script documentaire complet.
      </p>

      <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileChange} className="hidden" />

      {/* Persistent PDF pill — shown when we have results */}
      {hasResults && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{fileName || "Document PDF"}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {pageCount > 0 && <span>{pageCount} p.</span>}
                  {pageCount > 0 && extractedText && <span>·</span>}
                  {extractedText && <span>{extractedText.length.toLocaleString()} car.</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {analysis && (
                <button
                  onClick={() => setAnalysisOpen(!analysisOpen)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Analyse
                </button>
              )}
              {script !== null && script !== "" && (
                <button
                  onClick={() => {
                    const el = scriptEndRef.current;
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <ScrollText className="h-3 w-3" />
                  Script
                  <span className="text-[10px] text-primary/60">{script.length.toLocaleString()} car.</span>
                </button>
              )}
              <button onClick={removeFile} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Retirer le document">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload zone — hidden once text is extracted */}
      {!extractedText && !hasResults && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !file && inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 sm:gap-4 rounded-lg border-2 border-dashed p-6 sm:p-12 transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : file ? "border-border bg-card cursor-default" : "border-border hover:border-primary/50 hover:bg-secondary/30"
          }`}
        >
          {file ? (
            <div className="flex items-center gap-3 w-full">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0"><FileText className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} Mo</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeFile(); }} className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center h-14 w-14 rounded-full bg-secondary"><Upload className="h-6 w-6 text-muted-foreground" /></div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Glissez votre PDF ici ou cliquez pour parcourir</p>
                <p className="text-xs text-muted-foreground mt-1">PDF uniquement — 20 Mo max</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Compact file info — shown during extraction (before pill appears) */}
      {extractedText && !hasResults && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate max-w-[150px] font-medium text-foreground text-[11px]">{file?.name || fileName}</span>
          <span>·</span>
          <span>{pageCount} p.</span>
          <span>·</span>
          <span>{extractedText.length.toLocaleString()} car.</span>
          <button onClick={removeFile} className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        {!extractedText && !analyzing && !hasResults && (
          <Button variant="hero" disabled={!file || !projectId || parsing} onClick={() => file && extractAndAnalyze(file)} className="min-h-[44px]">
            {parsing ? <><Loader2 className="h-4 w-4 animate-spin" /> Extraction en cours...</> : <><Sparkles className="h-4 w-4" /> Analyser le document</>}
          </Button>
        )}
        {analysis && !script && script === null && (
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Langue :</label>
              <select
                value={scriptLanguage}
                onChange={(e) => onLanguageChange?.(e.target.value)}
                className="h-9 rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <Button variant="hero" disabled={generatingScript} onClick={runFullScriptGeneration} className="min-h-[44px]">
              {generatingScript ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération en cours...</> : <><ScrollText className="h-4 w-4" /> Créer le script narratif</>}
            </Button>
          </div>
        )}
      </div>

      {/* Analysis loading */}
      {(parsing || analyzing) && (
        <div className="mt-6 flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {parsing ? "Extraction du texte en cours…" : "Analyse narrative en cours…"}
          </p>
        </div>
      )}

      {/* Analysis results — collapsible */}
      {analysis && (
        <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen} className="mt-6">
          <CollapsibleTrigger className="w-full rounded-lg border border-border bg-card p-4 sm:p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Analyse narrative</h3>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${analysisOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4 animate-fade-in">
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Mystère central</h3></div>
              <p className="text-sm text-muted-foreground leading-relaxed">{analysis.central_mystery}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Contradiction principale</h3></div>
              <p className="text-sm text-muted-foreground leading-relaxed">{analysis.main_contradiction}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Découvertes intrigantes</h3></div>
              <ul className="space-y-2">
                {analysis.intriguing_discoveries.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed"><span className="text-primary font-medium shrink-0">{i + 1}.</span>{d}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3"><Swords className="h-4 w-4 text-primary" /><h3 className="font-display text-sm font-semibold text-foreground">Tensions narratives</h3></div>
              <div className="space-y-3">
                {analysis.narrative_tensions.map((t, i) => (
                  <div key={i} className="group rounded border border-border bg-background p-3 relative">
                    <button
                      onClick={() => {
                        const updated = { ...analysis, narrative_tensions: analysis.narrative_tensions.filter((_, idx) => idx !== i) };
                        onAnalysisChange(updated);
                      }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded hover:bg-destructive/10"
                      title="Retirer cette tension"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <p className="text-sm font-medium text-foreground mb-1 pr-6">{t.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                  </div>
                ))}
              </div>
              {/* Add new tension via AI */}
              <button
                onClick={async () => {
                  if (!extractedText || findingTension) return;
                  setFindingTension(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("find-tension", {
                      body: { text: extractedText, existing_tensions: analysis.narrative_tensions },
                    });
                    if (error || data?.error) {
                      toast.error(data?.error || "Erreur lors de la recherche");
                      console.error(error || data?.error);
                    } else if (data?.tension) {
                      const updated = { ...analysis, narrative_tensions: [...analysis.narrative_tensions, data.tension] };
                      onAnalysisChange(updated);
                      toast.success("Nouvelle tension ajoutée");
                    }
                  } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
                  setFindingTension(false);
                }}
                disabled={findingTension || !extractedText}
                className="mt-3 w-full flex items-center justify-center gap-1.5 rounded border border-dashed border-border p-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-secondary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {findingTension ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Recherche dans le document…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Trouver une nouvelle tension</>
                )}
              </button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Generation loading */}
      {generatingScript && !script && (
        <div className="mt-6 flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Génération de la structure et du script…</p>
        </div>
      )}

      {/* Script result — collapsible */}
      {(script !== null && script !== "") && (
        <Collapsible open={scriptOpen} onOpenChange={setScriptOpen} className="mt-6">
          <CollapsibleTrigger className="w-full rounded-lg border border-border bg-card p-4 sm:p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Script narratif</h3>
              {!generatingScript && script && (
                <span className="text-xs text-muted-foreground">
                  {script.length.toLocaleString()} car.
                </span>
              )}
              {generatingScript && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" /> Écriture…
                </span>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${scriptOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 animate-fade-in">
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              {!generatingScript && script && (
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <Button variant="outline" size="sm" onClick={copyScriptToClipboard} className="h-8 text-xs">
                    <Copy className="h-3 w-3" /> Copier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    const clean = cleanScriptForExport(script);
                    const blob = new Blob([clean], { type: "text/markdown;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "script_narratif.md"; a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Script exporté en Markdown");
                  }} className="h-8 text-xs">
                    <Download className="h-3 w-3" /> .md
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportVoiceOverBlocks} className="h-8 text-xs">
                    <Mic className="h-3 w-3" /> VO Blocks
                  </Button>
                  <Button variant="hero" size="sm" onClick={() => {
                    const clean = cleanScriptForExport(script);
                    onSendToScriptInput?.(clean);
                    toast.success("Script envoyé dans ScriptInput");
                  }} className="h-8 text-xs">
                    <ArrowRight className="h-3 w-3" /> ScriptInput
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => runFullScriptGeneration(true)} disabled={generatingScript} className="h-8 text-xs">
                    <RotateCcw className="h-3 w-3" /> Régénérer
                  </Button>
                </div>
              )}
              <div className="max-h-[300px] sm:max-h-[500px] overflow-y-auto rounded border border-border bg-background p-3 sm:p-4">
                <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-body">{script}</pre>
                <div ref={scriptEndRef} />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

    </div>
  );
}
