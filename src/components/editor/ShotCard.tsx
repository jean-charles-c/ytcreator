import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Check, X, Loader2, Copy } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Shot = Tables<"shots">;

const SHOT_TYPES = ["Establishing Shot", "Activity Shot", "Detail Shot", "Portrait Shot", "POV Shot"];

interface ShotCardProps {
  shot: Shot;
  globalIndex?: number;
  sceneLabel?: string;
  onUpdate: (shot: Shot) => void;
}

export default function ShotCard({ shot, globalIndex, sceneLabel, onUpdate }: ShotCardProps) {
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState(shot.shot_type);
  const [editDesc, setEditDesc] = useState(shot.description);
  const [editPrompt, setEditPrompt] = useState(shot.prompt_export ?? "");
  const [saving, setSaving] = useState(false);

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
    <div className="group rounded border border-border bg-card p-4 transition-colors hover:border-primary/30 relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-display font-medium text-primary">{globalIndex !== undefined ? `Shot ${globalIndex} — ` : ""}{shot.shot_type}</span>
        <div className="flex gap-1">
          <button onClick={copyPrompt} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Copier le prompt">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={startEdit} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Éditer">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-2">{shot.description}</p>
      {shot.prompt_export && (
        <pre className="rounded bg-background border border-border p-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text">
          {shot.prompt_export}
        </pre>
      )}
    </div>
  );
}
