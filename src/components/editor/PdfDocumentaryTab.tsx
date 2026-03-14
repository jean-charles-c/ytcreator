import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, X, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Swords, ScrollText, Download, ArrowRight, ChevronDown, Copy } from "lucide-react";
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
}

export default function PdfDocumentaryTab({ projectId, scriptLanguage, onLanguageChange, onSendToScriptInput, onAnalysisReady, onScriptReady }: PdfDocumentaryTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [analysis, setAnalysis] = useState<NarrativeAnalysis | null>(null);
  const [docStructure, setDocStructure] = useState<DocSection[] | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scriptEndRef = useRef<HTMLDivElement>(null);

  const parsePdf = useCallback(async (pdfFile: File) => {
    setParsing(true);
    setExtractedText(null);
    setAnalysis(null);
    setDocStructure(null);
    setScript(null);
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPageCount(pdf.numPages);
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(" ").replace(/\s+/g, " ").trim();
        if (text) pages.push(text);
      }
      const fullText = pages.join("\n\n");
      if (!fullText.trim()) { toast.error("Aucun texte détecté dans ce PDF."); }
      else { setExtractedText(fullText); toast.success(`${pdf.numPages} page(s) extraite(s)`); }
    } catch (err) { console.error("PDF parse error:", err); toast.error("Erreur lors de la lecture du PDF"); }
    setParsing(false);
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!extractedText) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-pdf", { body: { text: extractedText } });
      if (error) { toast.error("Erreur d'analyse"); console.error(error); setAnalyzing(false); return; }
      if (data?.error) { toast.error(data.error); setAnalyzing(false); return; }
      setAnalysis(data.analysis);
      onAnalysisReady?.(data.analysis, extractedText);
      toast.success("Analyse narrative terminée");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setAnalyzing(false);
  }, [extractedText, onAnalysisReady]);

  // Combined: generate structure then script automatically
  const runFullScriptGeneration = useCallback(async () => {
    if (!analysis || !extractedText) return;
    setGeneratingScript(true);
    setScript("");

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
      setDocStructure(sections);
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
              setScript(full);
            }
          } catch { /* partial */ }
        }
      }

      setScript(full);
      onScriptReady?.(full);
      toast.success(`Script généré — ${full.length.toLocaleString()} caractères`);
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setGeneratingScript(false);
  }, [analysis, extractedText, scriptLanguage]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") { setFile(dropped); setExtractedText(null); setAnalysis(null); setDocStructure(null); setScript(null); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") { setFile(selected); setExtractedText(null); setAnalysis(null); setDocStructure(null); setScript(null); }
  };

  const removeFile = () => {
    setFile(null); setExtractedText(null); setAnalysis(null); setDocStructure(null); setScript(null); setPageCount(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const cleanScriptForExport = (raw: string): string => {
    return raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("---") && line.trim() !== "")
      .map((line) => line.trim())
      .join("\n");
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

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        Script Narratif &amp; Voice Over
      </h2>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Importez un dossier de recherche PDF pour générer un script documentaire complet.
      </p>

      <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileChange} className="hidden" />

      {/* Upload zone — hidden once text is extracted */}
      {!extractedText && (
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

      {/* Compact file info + stats — shown after extraction */}
      {extractedText && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate max-w-[150px] font-medium text-foreground text-[11px]">{file?.name}</span>
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
        {!extractedText && (
          <Button variant="hero" disabled={!file || !projectId || parsing} onClick={() => file && parsePdf(file)} className="min-h-[44px]">
            {parsing ? <><Loader2 className="h-4 w-4 animate-spin" /> Extraction en cours...</> : <><Sparkles className="h-4 w-4" /> Extraire le texte</>}
          </Button>
        )}
        {extractedText && !analysis && (
          <Button variant="hero" disabled={analyzing} onClick={runAnalysis} className="min-h-[44px]">
            {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours...</> : <><Sparkles className="h-4 w-4" /> Analyser le document</>}
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
                  <div key={i} className="rounded border border-border bg-background p-3">
                    <p className="text-sm font-medium text-foreground mb-1">{t.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                  </div>
                ))}
              </div>
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

      {/* Script result */}
      {(script !== null && script !== "") && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Script narratif</h3>
              {!generatingScript && script && (
                <span className="text-xs text-muted-foreground">
                  {script.length.toLocaleString()} car.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {generatingScript && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Écriture en cours…</span>
                </>
              )}
              {!generatingScript && script && (
                <>
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
                  <Button variant="hero" size="sm" onClick={() => {
                    const clean = cleanScriptForExport(script);
                    onSendToScriptInput?.(clean);
                    toast.success("Script envoyé dans ScriptInput");
                  }} className="h-8 text-xs">
                    <ArrowRight className="h-3 w-3" /> ScriptInput
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="max-h-[300px] sm:max-h-[500px] overflow-y-auto rounded border border-border bg-background p-3 sm:p-4">
            <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-body">{script}</pre>
            <div ref={scriptEndRef} />
          </div>
        </div>
      )}

      {!extractedText && !analysis && (
        <div className="mt-8 rounded-lg border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Uploadez un PDF puis lancez l'analyse pour extraire le contenu.</p>
          </div>
        </div>
      )}
    </div>
  );
}
