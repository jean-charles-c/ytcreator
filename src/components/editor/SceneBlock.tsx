import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Pencil,
  Check,
  X,
  Scissors,
  Merge,
  CheckCircle2,
  Loader2,
  MapPin,
  Users,
  Clapperboard,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface SceneContext {
  contexte_scene: string;
  sujet: string;
  lieu: string;
  epoque: string;
  personnages: string;
  coherence_globale: string;
  lieux_ordonnes?: string[];
  epoques_ordonnees?: string[];
}

type Scene = Tables<"scenes">;

const SCENE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  action: { label: "Action", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  description: { label: "Description", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  dialogue: { label: "Dialogue", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  transition: { label: "Transition", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  exposition: { label: "Exposition", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

const CONTINUITY_LABELS: Record<string, string> = {
  new: "Nouveau fil",
  continues: "Continue",
  develops: "Développe",
};

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
  const [editNarrativeAction, setEditNarrativeAction] = useState(scene.narrative_action ?? "");
  const [saving, setSaving] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitPos, setSplitPos] = useState(Math.floor(scene.source_text.length / 2));

  const startEdit = () => {
    if (scene.validated) {
      toast.error("Scène validée — déverrouillez-la pour modifier.");
      return;
    }
    setEditTitle(scene.title);
    setEditText(scene.source_text);
    setEditVisual(scene.visual_intention ?? "");
    setEditNarrativeAction(scene.narrative_action ?? "");
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
        narrative_action: editNarrativeAction.trim() || null,
      })
      .eq("id", scene.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur de sauvegarde");
      return;
    }
    onUpdate({
      ...scene,
      title: editTitle.trim(),
      source_text: editText.trim(),
      visual_intention: editVisual.trim() || null,
      narrative_action: editNarrativeAction.trim() || null,
    });
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

  const sceneTypeInfo = SCENE_TYPE_LABELS[scene.scene_type ?? ""] ?? null;
  const continuityLabel = CONTINUITY_LABELS[scene.continuity ?? ""] ?? null;
  const hasCharacters = scene.characters && scene.characters !== "none";
  const hasLocation = scene.location && scene.location !== "unspecified";

  const inputClass = "w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div
      className={`rounded-lg border bg-card p-3 sm:p-5 animate-fade-in transition-colors ${scene.validated ? "border-primary/40 shadow-sm shadow-primary/5" : "border-border"}`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* ─── Header ─── */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 flex-wrap">
        <span className="text-xs font-display font-medium text-primary">SCÈNE {scene.scene_order}</span>
        {sceneTypeInfo && (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${sceneTypeInfo.color}`}>
            {sceneTypeInfo.label}
          </span>
        )}
        {continuityLabel && scene.continuity !== "new" && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <ArrowRight className="h-2.5 w-2.5" /> {continuityLabel}
          </span>
        )}
        {scene.validated && (
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] text-primary font-medium">
            <CheckCircle2 className="h-2.5 w-2.5" /> Validée
          </span>
        )}
        <div className="ml-auto flex items-center gap-0 sm:gap-0.5">
          {!editing && (
            <>
              <button onClick={startEdit} className="p-2 sm:p-2.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary active:bg-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center" title="Éditer">
                <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
              <button onClick={() => { if (scene.validated) { toast.error("Scène validée — déverrouillez-la pour scinder."); return; } setShowSplit(!showSplit); }} className="p-2 sm:p-2.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary active:bg-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center" title="Scinder">
                <Scissors className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
              {!isLast && (
                <button onClick={() => { if (scene.validated) { toast.error("Scène validée — déverrouillez-la pour fusionner."); return; } onMergeWithNext(scene.id); }} className="p-2 sm:p-2.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary active:bg-secondary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center" title="Fusionner avec la suivante">
                  <Merge className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              )}
              <button
                onClick={() => onToggleValidated(scene.id, !scene.validated)}
                className={`p-2 sm:p-2.5 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${scene.validated ? "text-primary hover:text-muted-foreground" : "text-muted-foreground hover:text-primary"} hover:bg-secondary active:bg-secondary`}
                title={scene.validated ? "Invalider" : "Valider"}
              >
                <CheckCircle2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={`${inputClass} h-11 sm:h-auto`} placeholder="Titre de la scène" />
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} className={`${inputClass} min-h-[100px] resize-y`} placeholder="Texte source" />
          <input type="text" value={editNarrativeAction} onChange={(e) => setEditNarrativeAction(e.target.value)} className={`${inputClass} h-11 sm:h-auto`} placeholder="Action narrative" />
          <input type="text" value={editVisual} onChange={(e) => setEditVisual(e.target.value)} className={`${inputClass} h-11 sm:h-auto`} placeholder="Intention visuelle (en français)" />
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

          {/* BlocContexteScene */}
          {(scene as any).scene_context && (() => {
            const ctx = (scene as any).scene_context as SceneContext;
            return (
              <details className="mb-3 rounded border border-accent/30 bg-accent/5 group/ctx" open>
                <summary className="flex items-center gap-1.5 p-2.5 sm:p-3 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden min-h-[40px]">
                  <BookOpen className="h-3 w-3 text-accent-foreground/70 shrink-0" />
                  <span className="text-[10px] font-semibold text-accent-foreground/80 uppercase tracking-wider">Contexte</span>
                  <span className="ml-auto text-muted-foreground text-[10px] group-open/ctx:rotate-90 transition-transform">▶</span>
                </summary>
                <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="break-words"><span className="font-medium text-foreground/80">Contexte :</span> <span className="text-muted-foreground">{ctx.contexte_scene}</span></div>
                    <div className="break-words"><span className="font-medium text-foreground/80">Sujet :</span> <span className="text-muted-foreground">{ctx.sujet}</span></div>
                    <div className="break-words"><span className="font-medium text-foreground/80">Lieu :</span> <span className="text-muted-foreground">{ctx.lieu}</span></div>
                    {ctx.lieux_ordonnes && ctx.lieux_ordonnes.length > 1 && (
                      <div className="break-words"><span className="font-medium text-foreground/80">Lieux (ordre) :</span> <span className="text-muted-foreground">{ctx.lieux_ordonnes.map((l, i) => `${i + 1}. ${l}`).join(" → ")}</span></div>
                    )}
                    <div className="break-words"><span className="font-medium text-foreground/80">Époque :</span> <span className="text-muted-foreground">{ctx.epoque}</span></div>
                    {ctx.epoques_ordonnees && ctx.epoques_ordonnees.length > 1 && (
                      <div className="break-words"><span className="font-medium text-foreground/80">Époques (ordre) :</span> <span className="text-muted-foreground">{ctx.epoques_ordonnees.map((e, i) => `${i + 1}. ${e}`).join(" → ")}</span></div>
                    )}
                    <div className="break-words"><span className="font-medium text-foreground/80">Personnages :</span> <span className="text-muted-foreground">{ctx.personnages}</span></div>
                    <div className="break-words sm:col-span-2"><span className="font-medium text-foreground/80">Cohérence :</span> <span className="text-muted-foreground">{ctx.coherence_globale}</span></div>
                  </div>
                </div>
              </details>
            );
          })()}

          {/* Narrative action */}
          {scene.narrative_action && scene.narrative_action !== "Non spécifié" && (
            <div className="flex items-start gap-2 mb-2">
              <Clapperboard className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <p className="text-sm font-medium text-foreground/80">{scene.narrative_action}</p>
            </div>
          )}

          {/* Source text */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-1">{scene.source_text}</p>
          {scene.source_text_fr && (
            <p className="text-sm text-muted-foreground/70 leading-relaxed mb-3 italic border-l-2 border-primary/20 pl-3">🇫🇷 {scene.source_text_fr}</p>
          )}

          {/* Characters + Location */}
          {(hasCharacters || hasLocation) && (
            <div className="flex flex-wrap gap-3 mb-3 mt-2">
              {hasCharacters && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" /> {scene.characters}
                </span>
              )}
              {hasLocation && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {scene.location}
                </span>
              )}
            </div>
          )}

          {/* Visual intention */}
          {scene.visual_intention && (
            <div className="rounded bg-secondary/50 border border-border p-3 space-y-1">
              <span className="text-[10px] font-medium text-primary uppercase tracking-wide">Sujet de la scène</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{scene.visual_intention}</p>
            </div>
          )}
        </>
      )}

      {/* Split tool */}
      {showSplit && !editing && (
        <div className="mt-4 rounded border border-border bg-secondary/30 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Déplacez le curseur pour choisir le point de scission :</p>
          <input type="range" min={10} max={scene.source_text.length - 10} value={splitPos} onChange={(e) => setSplitPos(Number(e.target.value))} className="w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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