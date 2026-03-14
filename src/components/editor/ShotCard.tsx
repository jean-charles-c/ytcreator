import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clapperboard, Shield, Pencil, Check, X, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Shot = Tables<"shots">;

const SHOT_TYPES = ["Establishing Shot", "Activity Shot", "Detail Shot", "Portrait Shot", "POV Shot"];

interface ShotCardProps {
  shot: Shot;
  onUpdate: (shot: Shot) => void;
}

export default function ShotCard({ shot, onUpdate }: ShotCardProps) {
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

  const inputClass = "w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  if (editing) {
    return (
      <div className="rounded border border-primary/30 bg-card p-4 space-y-2">
        <select value={editType} onChange={(e) => setEditType(e.target.value)} className={inputClass}>
          {SHOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          {!SHOT_TYPES.includes(editType) && <option value={editType}>{editType}</option>}
        </select>
        <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className={`${inputClass} min-h-[60px] resize-y`} placeholder="Description" />
        <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} className={`${inputClass} min-h-[60px] resize-y font-mono`} placeholder="Prompt export" />
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
    <div className="group rounded border border-border bg-card overflow-hidden transition-colors hover:border-primary/30 relative">
      <button onClick={startEdit} className="absolute top-2 right-2 p-1 rounded bg-card/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Éditer">
        <Pencil className="h-3 w-3" />
      </button>
      <div className="aspect-video bg-secondary flex items-center justify-center">
        <Clapperboard className="h-8 w-8 text-muted-foreground/30" />
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-display font-medium text-primary">{shot.shot_type}</span>
          {shot.guardrails && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] text-primary font-medium" title="Historical Realism verified">
              <Shield className="h-2.5 w-2.5" /> HR
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{shot.description}</p>
        {shot.guardrails && (
          <div className="flex flex-wrap gap-1 mb-3">
            {shot.guardrails.split(",").map((g, gi) => (
              <span key={gi} className="rounded bg-secondary border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{g.trim()}</span>
            ))}
          </div>
        )}
        {shot.prompt_export && (
          <div className="rounded bg-background border border-border p-2">
            <code className="text-[10px] text-muted-foreground leading-tight block font-mono">{shot.prompt_export.slice(0, 120)}...</code>
          </div>
        )}
      </div>
    </div>
  );
}
