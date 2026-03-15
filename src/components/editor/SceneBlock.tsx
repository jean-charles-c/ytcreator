import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Film,
  Pencil,
  Check,
  X,
  Scissors,
  Merge,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Clapperboard,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Scene = Tables<"scenes">;

interface SceneBlockProps {
  scene: Scene;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  previousScene?: Scene;
  nextScene?: Scene;
  onUpdate: (scene: Scene) => void;
  onDelete: (id: string) => void;
  onMergeWithNext: (sceneId: string) => void;
  onSplit: (sceneId: string, splitText1: string, splitText2: string) => void;
  onToggleValidated: (sceneId: string, validated: boolean) => void;
}

export default function SceneBlock({
  scene,
  index,
  isLast,
  onUpdate,
  onMergeWithNext,
  onSplit,
  onToggleValidated,
}: SceneBlockProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(scene.title);
  const [editText, setEditText] = useState(scene.source_text);
  const [editVisual, setEditVisual] = useState(scene.visual_intention ?? "");
  const [saving, setSaving] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitPos, setSplitPos] = useState(Math.floor(scene.source_text.length / 2));

  const startEdit = () => {
    setEditTitle(scene.title);
    setEditText(scene.source_text);
    setEditVisual(scene.visual_intention ?? "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("scenes")
      .update({
        title: editTitle.trim(),
        source_text: editText.trim(),
        visual_intention: editVisual.trim() || null,
      })
      .eq("id", scene.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur de sauvegarde");
      return;
    }
    onUpdate({ ...scene, title: editTitle.trim(), source_text: editText.trim(), visual_intention: editVisual.trim() || null });
    setEditing(false);
    toast.success("Scène mise à jour");
  };

  const handleSplit = () => {
    const text1 = scene.source_text.slice(0, splitPos).trim();
    const text2 = scene.source_text.slice(splitPos).trim();
    if (!text1 || !text2) {
      toast.error("Les deux parties doivent contenir du texte");
      return;
    }
    onSplit(scene.id, text1, text2);
    setShowSplit(false);
  };

  const inputClass = "w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div
      className={`rounded border bg-card p-5 animate-fade-in transition-colors ${scene.validated ? "border-primary/40" : "border-border"}`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-display font-medium text-primary">SCÈNE {scene.scene_order}</span>
        {scene.validated && (
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] text-primary font-medium">
            <CheckCircle2 className="h-2.5 w-2.5" /> Validée
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {!editing && (
            <>
              <button onClick={startEdit} className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center" title="Éditer">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setShowSplit(!showSplit)} className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center" title="Scinder">
                <Scissors className="h-3.5 w-3.5" />
              </button>
              {!isLast && (
                <button onClick={() => onMergeWithNext(scene.id)} className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center" title="Fusionner avec la suivante">
                  <Merge className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => onToggleValidated(scene.id, !scene.validated)}
                className={`p-2 rounded transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${scene.validated ? "text-primary hover:text-muted-foreground" : "text-muted-foreground hover:text-primary"} hover:bg-secondary`}
                title={scene.validated ? "Invalider" : "Valider"}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={`${inputClass} h-11 sm:h-auto`} placeholder="Titre de la scène" />
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} className={`${inputClass} min-h-[100px] resize-y`} placeholder="Texte source" />
          <input type="text" value={editVisual} onChange={(e) => setEditVisual(e.target.value)} className={`${inputClass} h-11 sm:h-auto`} placeholder="Intention visuelle (optionnel)" />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Enregistrer
            </Button>
            <Button size="sm" variant="outline" onClick={cancelEdit}>
              <X className="h-3.5 w-3.5" /> Annuler
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="font-display text-base font-semibold text-foreground mb-2">{scene.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{scene.source_text}</p>
          {scene.visual_intention && (
            <div className="rounded bg-secondary/50 border border-border p-3 space-y-1">
              <span className="text-[10px] font-medium text-primary uppercase tracking-wide">Sujet de la scène</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{scene.visual_intention}</p>
            </div>
          )}
        </>
      )}

      {showSplit && !editing && (
        <div className="mt-4 rounded border border-border bg-secondary/30 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Déplacez le curseur pour choisir le point de scission :</p>
          <input type="range" min={10} max={scene.source_text.length - 10} value={splitPos} onChange={(e) => setSplitPos(Number(e.target.value))} className="w-full" />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-border bg-card p-2">
              <p className="text-[10px] text-muted-foreground font-medium mb-1">Partie 1</p>
              <p className="text-xs text-foreground">{scene.source_text.slice(0, splitPos).trim()}</p>
            </div>
            <div className="rounded border border-border bg-card p-2">
              <p className="text-[10px] text-muted-foreground font-medium mb-1">Partie 2</p>
              <p className="text-xs text-foreground">{scene.source_text.slice(splitPos).trim()}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSplit}>
              <Scissors className="h-3.5 w-3.5" /> Scinder
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSplit(false)}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
