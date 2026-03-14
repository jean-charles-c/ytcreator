import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Sparkles, X } from "lucide-react";

interface PdfDocumentaryTabProps {
  projectId: string | null;
}

export default function PdfDocumentaryTab({ projectId }: PdfDocumentaryTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") {
      setFile(dropped);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type === "application/pdf") {
      setFile(selected);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="container max-w-3xl py-6 sm:py-10 px-4 animate-fade-in">
      <h2 className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2">
        PDF Documentary Generator
      </h2>
      <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
        Transformez un dossier de recherche PDF en documentaire YouTube structuré.
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
          disabled={!file || !projectId}
          className="w-full sm:w-auto min-h-[44px]"
        >
          <Sparkles className="h-4 w-4" />
          Analyser le document
        </Button>
      </div>

      {/* Results zone (empty for now) */}
      <div className="mt-8 rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Uploadez un PDF puis lancez l'analyse pour générer votre documentaire.
          </p>
        </div>
      </div>
    </div>
  );
}
