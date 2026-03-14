import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, X, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfDocumentaryTabProps {
  projectId: string | null;
}

export default function PdfDocumentaryTab({ projectId }: PdfDocumentaryTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsePdf = useCallback(async (pdfFile: File) => {
    setParsing(true);
    setExtractedText(null);
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPageCount(pdf.numPages);

      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item: any) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) pages.push(text);
      }

      const fullText = pages.join("\n\n");
      if (!fullText.trim()) {
        toast.error("Aucun texte détecté dans ce PDF.");
        setExtractedText(null);
      } else {
        setExtractedText(fullText);
        toast.success(`${pdf.numPages} page(s) extraite(s)`);
      }
    } catch (err) {
      console.error("PDF parse error:", err);
      toast.error("Erreur lors de la lecture du PDF");
    }
    setParsing(false);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") {
      setFile(dropped);
      setExtractedText(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") {
      setFile(selected);
      setExtractedText(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    setExtractedText(null);
    setPageCount(0);
    if (inputRef.current) inputRef.current.value = "";
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
          dragOver
            ? "border-primary bg-primary/5"
            : file
              ? "border-border bg-card cursor-default"
              : "border-border hover:border-primary/50 hover:bg-secondary/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        {file ? (
          <div className="flex items-center gap-3 w-full">
            <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 shrink-0">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} Mo
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeFile(); }}
              className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-secondary">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Glissez votre PDF ici ou cliquez pour parcourir
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF uniquement — 20 Mo max
              </p>
            </div>
          </>
        )}
      </div>

      {/* Action button */}
      <div className="mt-6">
        <Button
          variant="hero"
          disabled={!file || !projectId || parsing}
          onClick={() => file && parsePdf(file)}
          className="w-full sm:w-auto min-h-[44px]"
        >
          {parsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Extraction en cours...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Analyser le document
            </>
          )}
        </Button>
      </div>

      {/* Results zone */}
      <div className="mt-8 rounded-lg border border-border bg-card p-6 sm:p-8">
        {extractedText ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Texte extrait — {pageCount} page(s) — {extractedText.length.toLocaleString()} caractères
              </p>
            </div>
            <div className="max-h-[300px] overflow-y-auto rounded border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {extractedText}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Uploadez un PDF puis lancez l'analyse pour extraire le contenu.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
