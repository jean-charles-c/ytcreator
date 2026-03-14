import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, X, Loader2, CheckCircle2, AlertTriangle, Lightbulb, Swords, Youtube, Trophy, LayoutList } from "lucide-react";
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

interface YoutubeTitle {
  rank: number;
  title: string;
  hook_type: string;
}

interface DocSection {
  section_key: string;
  section_label: string;
  video_title: string;
  narrative_description: string;
}

interface PdfDocumentaryTabProps {
  projectId: string | null;
}

export default function PdfDocumentaryTab({ projectId }: PdfDocumentaryTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [generatingStructure, setGeneratingStructure] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [analysis, setAnalysis] = useState<NarrativeAnalysis | null>(null);
  const [youtubeTitles, setYoutubeTitles] = useState<YoutubeTitle[] | null>(null);
  const [docStructure, setDocStructure] = useState<DocSection[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsePdf = useCallback(async (pdfFile: File) => {
    setParsing(true);
    setExtractedText(null);
    setAnalysis(null);
    setYoutubeTitles(null);
    setDocStructure(null);
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
      toast.success("Analyse narrative terminée");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setAnalyzing(false);
  }, [extractedText]);

  const runYoutubePackaging = useCallback(async () => {
    if (!analysis || !extractedText) return;
    setGeneratingTitles(true);
    try {
      const { data, error } = await supabase.functions.invoke("youtube-packaging", {
        body: { analysis, text: extractedText },
      });
      if (error) { toast.error("Erreur de génération"); console.error(error); setGeneratingTitles(false); return; }
      if (data?.error) { toast.error(data.error); setGeneratingTitles(false); return; }
      const sorted = (data.titles as YoutubeTitle[]).sort((a, b) => a.rank - b.rank);
      setYoutubeTitles(sorted);
      toast.success("10 titres YouTube générés");
    } catch (e) { console.error(e); toast.error("Erreur inattendue"); }
    setGeneratingTitles(false);
  }, [analysis, extractedText]);

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") { setFile(dropped); setExtractedText(null); setAnalysis(null); setYoutubeTitles(null); setDocStructure(null); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") { setFile(selected); setExtractedText(null); setAnalysis(null); setYoutubeTitles(null); setDocStructure(null); }
  };

  const removeFile = () => {
    setFile(null); setExtractedText(null); setAnalysis(null); setYoutubeTitles(null); setDocStructure(null); setPageCount(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const hookBadgeColor = (type: string) => {
    const map: Record<string, string> = {
      question: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      paradoxe: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      superlatif: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      mystère: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      révélation: "bg-red-500/10 text-red-400 border-red-500/20",
    };
    return map[type.toLowerCase()] || "bg-secondary text-muted-foreground border-border";
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
        className={`relative flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-8 sm:p-12 transition-colors cursor-pointer ${
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
        {analysis && !youtubeTitles && (
          <Button variant="hero" disabled={generatingTitles} onClick={runYoutubePackaging} className="min-h-[44px]">
            {generatingTitles ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération titres...</> : <><Youtube className="h-4 w-4" /> Générer les titres YouTube</>}
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

      {/* YouTube titles loading */}
      {generatingTitles && (
        <div className="mt-6 flex items-center gap-2 p-3 rounded border border-primary/20 bg-primary/5">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Génération des titres YouTube…</p>
        </div>
      )}

      {/* YouTube titles results */}
      {youtubeTitles && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Youtube className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">Titres YouTube — classés par potentiel de clic</h3>
          </div>
          <div className="space-y-2">
            {youtubeTitles.map((t, i) => (
              <div key={i} className="flex items-center gap-3 rounded border border-border bg-background p-3 transition-colors hover:bg-secondary/30">
                <div className={`flex items-center justify-center h-7 w-7 rounded-full shrink-0 text-xs font-bold ${i === 0 ? "bg-primary text-primary-foreground" : i < 3 ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : t.rank}
                </div>
                <p className="text-sm text-foreground flex-1">{t.title}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${hookBadgeColor(t.hook_type)}`}>
                  {t.hook_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
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
