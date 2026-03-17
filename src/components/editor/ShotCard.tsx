import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Check, X, Loader2, Copy, RefreshCw, Trash2, ImageIcon, Upload, Merge } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Shot = Tables<"shots">;

const SHOT_TYPES = [
  "Plan d'ensemble",
  "Plan d'activité",
  "Plan de détail",
  "Plan portrait",
  "Plan subjectif",
  "Plan d'interaction",
  "Plan environnemental",
  "Plan de détail d'artefact",
  "Plan de détail scientifique",
];

interface ShotCardProps {
  shot: Shot;
  globalIndex?: number;
  sceneLabel?: string;
  isLastInScene?: boolean;
  onUpdate: (shot: Shot) => void;
  onDelete?: (shotId: string) => Promise<void> | void;
  onRegenerate?: (shotId: string) => Promise<void>;
  onGenerateImage?: (shotId: string) => Promise<void>;
  onMergeWithNext?: (shotId: string) => Promise<void>;
}

const formatUsd = (value: number | string | null | undefined) => {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return `${amount.toFixed(2)} $`;
};

export default function ShotCard({ shot, globalIndex, sceneLabel, isLastInScene, onUpdate, onDelete, onRegenerate, onGenerateImage, onMergeWithNext }: ShotCardProps) {
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState(shot.shot_type);
  const [editDesc, setEditDesc] = useState(shot.description);
  const [editPrompt, setEditPrompt] = useState(shot.prompt_export ?? "");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageUrl = shot.image_url;
  const cost = typeof shot.generation_cost === "number" ? shot.generation_cost : Number(shot.generation_cost ?? 0);

  const startEdit = () => {
    setEditType(shot.shot_type);
    setEditDesc(shot.description);
    setEditPrompt(shot.prompt_export ?? "");
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("shots")
      .update({
        shot_type: editType,
        description: editDesc.trim(),
        prompt_export: editPrompt.trim() || null,
      })
      .eq("id", shot.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur de sauvegarde");
      return;
    }
    onUpdate({ ...shot, shot_type: editType, description: editDesc.trim(), prompt_export: editPrompt.trim() || null });
    setEditing(false);
    toast.success("Shot mis à jour");
  };

  const copyPrompt = () => {
    const text = shot.prompt_export || shot.description;
    navigator.clipboard.writeText(text);
    toast.success("Prompt copié");
  };

  const handleRegenerate = async () => {
    if (onRegenerate) {
      setRegenerating(true);
      try { await onRegenerate(shot.id); } finally { setRegenerating(false); }
    }
  };

  const handleGenerateImage = async () => {
    if (onGenerateImage) {
      setGeneratingImage(true);
      try { await onGenerateImage(shot.id); } finally { setGeneratingImage(false); }
    }
  };

  const handleDelete = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try { await onDelete(shot.id); setDeleteDialogOpen(false); } finally { setDeleting(false); }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${shot.project_id}/${shot.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("shot-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("shot-images").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("shots")
        .update({ image_url: publicUrl })
        .eq("id", shot.id);
      if (updateError) throw updateError;

      onUpdate({ ...shot, image_url: publicUrl });
      toast.success("Image uploadée !");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erreur lors de l'upload.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const inputClass = "w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  if (editing) {
    return (
      <div className="rounded border border-primary/30 bg-card p-4 space-y-2">
        <select value={editType} onChange={(e) => setEditType(e.target.value)} className={inputClass}>
          {SHOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          {!SHOT_TYPES.includes(editType) && <option value={editType}>{editType}</option>}
        </select>
        <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className={`${inputClass} min-h-[60px] resize-y`} placeholder="Description" />
        <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} className={`${inputClass} min-h-[80px] resize-y font-mono`} placeholder="Prompt export" />
        <div className="flex gap-2">
          <Button size="sm" onClick={saveEdit} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} OK
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="group rounded border border-border bg-card p-4 transition-colors hover:border-primary/30 relative">
        {imageUrl && (
          <div
            className="mb-3 rounded overflow-hidden border border-border cursor-pointer"
            onClick={() => setLightboxOpen(true)}
          >
            <img src={imageUrl} alt={`Shot ${globalIndex ?? ""}`} className="w-full h-auto object-cover" loading="lazy" />
          </div>
        )}

      <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-display font-medium text-primary">{globalIndex !== undefined ? `Shot ${globalIndex} — ` : ""}{shot.shot_type}</span>
            {sceneLabel && <span className="text-[10px] text-muted-foreground">{sceneLabel}</span>}
            <span className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Coût IA : {formatUsd(cost)}
            </span>
          </div>
          <div className="flex gap-1 shrink-0">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50" title="Uploader une image">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            </button>
            <button onClick={handleGenerateImage} disabled={generatingImage} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50" title={imageUrl ? "Regénérer le visuel" : "Générer le visuel"}>
              {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            </button>
            <button onClick={handleRegenerate} disabled={regenerating} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50" title="Regénérer ce shot">
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
            <button onClick={copyPrompt} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Copier le prompt">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button onClick={startEdit} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Éditer">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setDeleteDialogOpen(true)} className="p-1.5 rounded transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Supprimer ce shot">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {shot.source_sentence && (
          <div className="mb-2 rounded bg-secondary/50 border border-border px-3 py-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Phrase illustrée</span>
            <p className="text-xs text-foreground leading-relaxed mt-0.5 italic">"{shot.source_sentence}"</p>
            {shot.source_sentence_fr && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-1 italic border-t border-border/50 pt-1">🇫🇷 "{shot.source_sentence_fr}"</p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">{shot.description}</p>
        {shot.prompt_export && (
          <details className="group/details">
            <summary className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors">
              Prompt visuel (EN)
            </summary>
            <pre className="mt-1 rounded bg-background border border-border p-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text">
              {shot.prompt_export}
            </pre>
          </details>
        )}
      </div>

      {lightboxOpen && imageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-6 w-6" />
          </button>
          <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3">
            <img
              src={imageUrl}
              alt={`Shot ${globalIndex ?? ""}`}
              className="max-w-full max-h-[75vh] object-contain rounded cursor-pointer"
              onClick={() => setLightboxOpen(false)}
            />
            <div className="text-white text-center space-y-1">
              <p className="font-display font-semibold">SHOT {globalIndex} — {shot.shot_type}</p>
              <p className="text-xs text-white/70">Coût IA cumulé : {formatUsd(cost)}</p>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce shot ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}