import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, X, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Swords, LayoutList, ScrollText, Download, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

interface PdfDocumentaryTabProps {
  projectId: string | null;
  onSendToScriptInput?: (text: string) => void;
  onAnalysisReady?: (analysis: NarrativeAnalysis, text: string) => void;
}

export default function PdfDocumentaryTab({ projectId, onSendToScriptInput, onAnalysisReady }: PdfDocumentaryTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingStructure, setGeneratingStructure] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [analysis, setAnalysis] = useState<NarrativeAnalysis | null>(null);
  const [docStructure, setDocStructure] = useState<DocSection[] | null>(null);
  const [script, setScript] = useState<string | null>(null);
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

  const runStructure = useCallback(async () => {
    if (!analysis || !extractedText) return;
    setGeneratingStructure(true);
    try {
      const { data, error } = await supabase.functions.invoke("documentary-structure", {
        body: { analysis, text: extractedText },
      });
      if (error) { toast.error("Erreur de génération"); console.error(error); setGeneratingStructure(false); return; }
      if (data?.error) { toast.error(data.error); setGeneratingStructure(false); return; }
      setDocStructure(data.sections);
      toast.success("Structure documentaire générée");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setGeneratingStructure(false);
  }, [analysis, extractedText]);

  const runScriptGeneration = useCallback(async () => {
    if (!analysis || !docStructure || !extractedText) return;
    setGeneratingScript(true);
    setScript("");
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ analysis, structure: docStructure, text: extractedText }),
        }
      );
      if (!resp.ok || !resp.body) {
        const err = await resp.text();
        toast.error("Erreur de génération du script");
        console.error(err);
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
      toast.success(`Script généré — ${full.length.toLocaleString()} caractères`);
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setGeneratingScript(false);
  }, [analysis, docStructure, extractedText]);

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

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        Script Narratif &amp; Voice Over
      </h2>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Importez un dossier de recherche PDF pour générer un script documentaire complet.
      </p>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 sm:gap-4 rounded-lg border-2 border-dashed p-6 sm:p-12 transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : file ? "border-border bg-card cursor-default" : "border-border hover:border-primary/50 hover:bg-secondary/30"
        }`}
      >
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileChange} className="hidden" />
        {file ? (
          <div className="flex items-center gap-3 w-full">
            <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 shrink-0"><FileText className="h-6 w-6 text-primary" /></div>
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

      {/* Action buttons */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
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
        {analysis && !docStructure && (
          <Button variant="hero" disabled={generatingStructure} onClick={runStructure} className="min-h-[44px]">
            {generatingStructure ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération structure...</> : <><LayoutList className="h-4 w-4" /> Créer le découpage narratif complet</>}
          </Button>
        )}
        {docStructure && !script && (
          <Button variant="hero" disabled={generatingScript} onClick={runScriptGeneration} className="min-h-[44px]">
            {generatingScript ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération script...</> : <><ScrollText className="h-4 w-4" /> Générer le script complet</>}
          </Button>
        )}
      </div>

      {/* Extracted text preview */}
      {extractedText && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Texte extrait — {pageCount} page(s) — {extractedText.length.toLocaleString()} caractères</p>
          </div>
          <div className="max-h-[200px] overflow-y-auto rounded border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{extractedText.slice(0, 3000)}{extractedText.length > 3000 && "…"}</p>
          </div>
        </div>
      )}

      {/* Analysis loading */}
      {analyzing && (
        <div className="mt-6 flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyse narrative en cours…</p>
        </div>
      )}

      {/* Analysis results */}
      {analysis && (
        <div className="mt-6 space-y-5 animate-fade-in">
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
        </div>
      )}

      {/* Structure loading */}
      {generatingStructure && (
        <div className="mt-6 flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Génération de la structure documentaire…</p>
        </div>
      )}

      {/* Documentary structure */}
      {docStructure && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <LayoutList className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">Structure documentaire</h3>
          </div>
          <div className="space-y-3">
            {docStructure.map((section, i) => (
              <div key={i} className="rounded border border-border bg-background p-4 transition-colors hover:bg-secondary/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-display font-medium text-primary">{section.section_label.toUpperCase()}</span>
                </div>
                <p className="text-sm font-medium text-foreground mb-1">{section.video_title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{section.narrative_description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Script generation */}
      {(script !== null) && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Script documentaire</h3>
              {!generatingScript && script && (
                <span className="text-xs text-muted-foreground ml-2">
                  {script.length.toLocaleString()} caractères
                </span>
              )}
            </div>
            {generatingScript && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Écriture en cours…</span>
              </div>
            )}
          </div>
          <div className="max-h-[300px] sm:max-h-[500px] overflow-y-auto rounded border border-border bg-background p-3 sm:p-4">
            <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-body">{script}</pre>
            <div ref={scriptEndRef} />
          </div>
          {!generatingScript && script && (
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => {
                const clean = cleanScriptForExport(script);
                const blob = new Blob([clean], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "script_documentaire.md"; a.click();
                URL.revokeObjectURL(url);
                toast.success("Script exporté en Markdown");
              }} className="min-h-[44px]">
                <Download className="h-4 w-4" /> Exporter en .md
              </Button>
              <Button variant="hero" onClick={() => {
                const clean = cleanScriptForExport(script);
                onSendToScriptInput?.(clean);
                toast.success("Script envoyé dans ScriptInput");
              }} className="min-h-[44px]">
                <ArrowRight className="h-4 w-4" /> Envoyer dans ScriptInput
              </Button>
            </div>
          )}
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
