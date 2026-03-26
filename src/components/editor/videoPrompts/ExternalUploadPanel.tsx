/**
 * ExternalUploadPanel — Dropzone + validation + preview for external images.
 * Supports drag-and-drop, file picker, format/size validation, and immediate preview.
 */

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  ImagePlus,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  FileImage,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface ExternalUploadPanelProps {
  projectId: string;
  userId: string;
  onUploaded: (upload: { id: string; imageUrl: string; label: string }) => void;
}

export default function ExternalUploadPanel({
  projectId,
  userId,
  onUploaded,
}: ExternalUploadPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function validateFile(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Format non supporté (${file.type || "inconnu"}). Utilisez JPG, PNG ou WebP.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum ${MAX_SIZE_MB} Mo.`;
    }
    return null;
  }

  const handleFile = useCallback((file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      setPreview(null);
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const clearSelection = () => {
    setSelectedFile(null);
    setPreview(null);
    setError(null);
    setLabel("");
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const id = crypto.randomUUID();
      const ext = selectedFile.name.split(".").pop() ?? "jpg";
      const filePath = `${projectId}/external/${id}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("shot-images")
        .upload(filePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: true,
        });

      if (storageError) throw storageError;

      const { data: urlData } = supabase.storage
        .from("shot-images")
        .getPublicUrl(filePath);
      const imageUrl = urlData.publicUrl;

      const { error: dbError } = await supabase
        .from("external_uploads")
        .insert({
          id,
          user_id: userId,
          project_id: projectId,
          image_url: imageUrl,
          label: label || selectedFile.name,
          display_order: 0,
        });

      if (dbError) throw dbError;

      onUploaded({ id, imageUrl, label: label || selectedFile.name });
      clearSelection();
      toast({ title: "Image uploadée", description: "Prête pour la génération vidéo" });
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({
        title: "Erreur d'upload",
        description: err.message ?? "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ImagePlus className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-medium text-foreground">Images externes</h3>
        <Badge
          variant="outline"
          className="text-[9px] px-1.5 py-0 bg-violet-500/10 text-violet-400 border-violet-500/30"
        >
          Hors script
        </Badge>
      </div>

      {/* Dropzone or Preview */}
      {!preview ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/30"
          }`}
        >
          <Upload className="h-6 w-6 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Glissez une image ici ou{" "}
              <span className="text-primary font-medium">parcourez</span>
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              JPG, PNG, WebP — max {MAX_SIZE_MB} Mo
            </p>
          </div>
        </div>
      ) : (
        <div className="relative rounded-lg border border-border overflow-hidden bg-secondary/30">
          <div className="flex gap-3 p-3">
            {/* Preview image */}
            <div className="shrink-0 w-24 h-24 rounded-md overflow-hidden border border-border">
              <img
                src={preview}
                alt="Aperçu"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Info + Label */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <FileImage className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground truncate">
                  {selectedFile?.name}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {selectedFile && (selectedFile.size / 1024 / 1024).toFixed(1)} Mo
                </span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              </div>

              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Description (optionnel)"
                className="text-xs h-7"
              />

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  disabled={uploading}
                  onClick={handleUpload}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {uploading ? "Upload…" : "Uploader"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={clearSelection}
                  disabled={uploading}
                >
                  <X className="h-3 w-3" />
                  Annuler
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
      />

      <p className="text-[10px] text-muted-foreground/60">
        Uploadez une image pour générer une vidéo indépendamment du script.
      </p>
    </div>
  );
}
