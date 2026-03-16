import { useState } from "react";
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
import { Pencil, Check, X, Loader2, Copy, RefreshCw, Trash2, ImageIcon } from "lucide-react";
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
  onUpdate: (shot: Shot) => void;
  onDelete?: (shotId: string) => Promise<void> | void;
  onRegenerate?: (shotId: string) => Promise<void>;
  onGenerateImage?: (shotId: string) => Promise<void>;
}

export default function ShotCard({ shot, globalIndex, sceneLabel, onUpdate, onDelete, onRegenerate, onGenerateImage }: ShotCardProps) {
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState(shot.shot_type);
  const [editDesc, setEditDesc] = useState(shot.description);
  const [editPrompt, setEditPrompt] = useState(shot.prompt_export ?? "");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const imageUrl = (shot as any).image_url;

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
      try {
        await onRegenerate(shot.id);
      } finally {
        setRegenerating(false);
      }
    }
  };

  const handleGenerateImage = async () => {
    if (onGenerateImage) {
      setGeneratingImage(true);
      try {
        await onGenerateImage(shot.id);
      } finally {
        setGeneratingImage(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!onDelete || deleting) return;

    setDeleting(true);
    try {
      await onDelete(shot.id);
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
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
        {/* Generated image */}
        {imageUrl && (
          <div className="mb-3 rounded overflow-hidden border border-border">
            <img src={imageUrl} alt={`Shot ${globalIndex ?? ""}`} className="w-full h-auto object-cover" loading="lazy" />
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-display font-medium text-primary">{globalIndex !== undefined ? `Shot ${globalIndex} — ` : ""}{shot.shot_type}</span>
            {sceneLabel && <span className="text-[10px] text-muted-foreground">{sceneLabel}</span>}
            {(shot.generation_cost as number) > 0 && (
              <span className="text-[9px] text-accent-foreground bg-accent/30 px-1.5 py-0.5 rounded w-fit">
                {shot.generation_cost} crédit{(shot.generation_cost as number) > 1 ? "s" : ""} IA
              </span>
            )}
          </div>
          <div className="flex gap-1">
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
        {(shot as any).source_sentence && (
          <div className="mb-2 rounded bg-secondary/50 border border-border px-3 py-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Phrase illustrée</span>
            <p className="text-xs text-foreground leading-relaxed mt-0.5 italic">"{(shot as any).source_sentence}"</p>
            {(shot as any).source_sentence_fr && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-1 italic border-t border-border/50 pt-1">🇫🇷 "{(shot as any).source_sentence_fr}"</p>
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
