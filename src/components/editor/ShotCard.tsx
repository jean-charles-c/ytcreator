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
import { Pencil, Check, X, Loader2, Copy, Trash2, Upload, Merge, Scissors, ShieldAlert, ShieldOff, Languages, ChevronRight, Package, User, MapPin, Car, Building2, Landmark, Box, UserX } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { RecurringObject } from "@/components/editor/ObjectRegistryPanel";
import { getVisualStyleById } from "@/components/editor/visualStyle/types";

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

const TYPE_ICONS: Record<string, React.ReactNode> = {
  character: <User className="h-3 w-3" />,
  location: <MapPin className="h-3 w-3" />,
  vehicle: <Car className="h-3 w-3" />,
  building: <Building2 className="h-3 w-3" />,
  artifact: <Landmark className="h-3 w-3" />,
  weapon: <Box className="h-3 w-3" />,
  object: <Package className="h-3 w-3" />,
};

const TYPE_COLORS: Record<string, string> = {
  character: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  location: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  vehicle: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  building: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  artifact: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  weapon: "bg-red-500/10 text-red-600 border-red-500/20",
  object: "bg-green-500/10 text-green-600 border-green-500/20",
};

interface ShotCardProps {
  shot: Shot;
  globalIndex?: number;
  sceneLabel?: string;
  isLastInScene?: boolean;
  imageExpanded?: boolean;
  onToggleImageExpanded?: () => void;
  scriptLanguage?: string;
  aspectRatio?: string;
  visualStyleId?: string | null;
  imageModel?: string;
  linkedObjects?: RecurringObject[];
  allObjects?: RecurringObject[];
  onLinkObject?: (shotSceneOrder: number, objectId: string) => void;
  onUnlinkObject?: (shotSceneOrder: number, objectId: string) => void;
  sceneOrder?: number;
  onUpdate: (shot: Shot) => void;
  onDelete?: (shotId: string) => Promise<void> | void;
  onRegenerate?: (shotId: string) => Promise<void>;
  onGenerateImage?: (shotId: string, customPrompt?: string) => Promise<void>;
  onMergeWithNext?: (shotId: string) => Promise<void>;
  onSplit?: (shotId: string, splitIndex: number) => Promise<void>;
  onRetranslate?: (shotId: string) => Promise<void>;
}

const formatUsd = (value: number | string | null | undefined) => {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return `${amount.toFixed(2)} $`;
};

export default function ShotCard({ shot, globalIndex, sceneLabel, isLastInScene, imageExpanded, onToggleImageExpanded, scriptLanguage, aspectRatio = "16:9", visualStyleId, imageModel, linkedObjects, allObjects, onLinkObject, onUnlinkObject, sceneOrder, onUpdate, onDelete, onRegenerate, onGenerateImage, onMergeWithNext, onSplit, onRetranslate }: ShotCardProps) {
  const [editing, setEditing] = useState(false);
  const [showObjectPicker, setShowObjectPicker] = useState(false);
  const [editType, setEditType] = useState(shot.shot_type);
  const [editDesc, setEditDesc] = useState(shot.description);
  const [editPrompt, setEditPrompt] = useState(shot.prompt_export ?? "");
  const [editSourceSentence, setEditSourceSentence] = useState(shot.source_sentence ?? "");
  const [editSourceSentenceFr, setEditSourceSentenceFr] = useState(shot.source_sentence_fr ?? "");
  const [saving, setSaving] = useState(false);
  
  const [generatingImage, setGeneratingImage] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitIndex, setSplitIndex] = useState<number | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [retranslating, setRetranslating] = useState(false);
  const [editingFullPrompt, setEditingFullPrompt] = useState(false);
  const [fullPromptDraft, setFullPromptDraft] = useState("");
  const [customFullPrompt, setCustomFullPrompt] = useState<string | null>(null);
  const prevPromptExportRef = useRef(shot.prompt_export);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset custom prompt when shot is regenerated (prompt_export changed externally)
  if (shot.prompt_export !== prevPromptExportRef.current) {
    prevPromptExportRef.current = shot.prompt_export;
    if (customFullPrompt !== null) {
      setCustomFullPrompt(null);
    }
  }

  const imageUrl = shot.image_url;
  const cost = typeof shot.generation_cost === "number" ? shot.generation_cost : Number(shot.generation_cost ?? 0);

  const getEffectiveLinkedObjects = () => {
    const tightFramingRegex = /\b(gros\s*plan|tr[èe]s\s+gros\s+plan|plan\s+de\s+d[ée]tail|insert|macro|close[\s-]?up|extreme\s+close[\s-]?up|ecu|cu\b|detail\s+shot)\b/i;
    const isTightFraming = tightFramingRegex.test(`${shot.description || ""} ${shot.prompt_export || ""}`);
    return (linkedObjects || []).filter((obj) => {
      if (!isTightFraming) return true;
      const t = String((obj as any).type || (obj as any).object_type || "").toLowerCase();
      return t !== "lieu" && t !== "location" && t !== "place";
    });
  };

  const cleanIdentityLock = (raw: string): string => {
    let txt = String(raw || "");
    const blockHeaders = [
      /^(?:CHARACTER|LOCATION|OBJECT|VEHICLE)\s+IDENTITY\s+LOCK:[^\n]*(?:\n(?!\s*\n)[^\n]*)*/gim,
      /^IDENTITY\s+LOCK:[^\n]*(?:\n(?!\s*\n)[^\n]*)*/gim,
      /^TIME\s+PERIOD(?:\s*\/\s*HISTORICAL\s+STATE)?\s+LOCK:[^\n]*(?:\n(?!\s*\n)[^\n]*)*/gim,
      /^REFERENCE\s+IMAGES(?:\s+PROVIDED)?:[^\n]*(?:\n(?!\s*\n)[^\n]*)*/gim,
      /^NO\s+TEMPORAL\s+DRIFT:[^\n]*(?:\n(?!\s*\n)[^\n]*)*/gim,
    ];
    for (const re of blockHeaders) txt = txt.replace(re, "");
    return txt
      .replace(/^\s*Do not redesign[^\n]*\n?/gim, "")
      .replace(/^\s*Do not (?:combine|mix) (?:visual )?(?:traits|features)[^\n]*\n?/gim, "")
      .replace(/^\s*Use these reference images[^\n]*\n?/gim, "")
      .replace(/^\s*Preserve (?:their|its) (?:exact )?[^\n]*\n?/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const buildSceneFirstPrompt = (basePrompt: string, options?: { maxChars?: number }) => {
    const maxChars = options?.maxChars;
    const effectiveLinkedObjects = getEffectiveLinkedObjects();
    const resolvedStyle = visualStyleId && visualStyleId !== "none" ? getVisualStyleById(visualStyleId)?.promptSuffix : null;
    const promptText = `${shot.description || ""} ${basePrompt || ""}`;
    const soberTableScene = /\b(table|feuille|papier|stylo|assis|bureau|lampe)\b/i.test(promptText);

    let visualDescription = shot.description?.trim() || "";
    if (!visualDescription && basePrompt) visualDescription = basePrompt;

    let sceneBlock = [
      "YOU MUST RENDER THIS EXACT SCENE. The following visual description is the highest-priority instruction and overrides style ambience, reference-image content, and any generic kitchen context:",
      visualDescription,
    ].join("\n");

    const sourcePrompt = basePrompt?.trim();
    if (sourcePrompt && !sourcePrompt.toLowerCase().includes(visualDescription.slice(0, 60).toLowerCase())) {
      sceneBlock += `\n\nNarrative context, secondary to the exact visual description:\n${sourcePrompt}`;
    }

    const styleBlock = resolvedStyle
      ? `STYLE MODIFIER ONLY — apply this rendering style without changing the requested setting/action/composition:\n${resolvedStyle}`
      : null;
    const identityLocks = effectiveLinkedObjects
      .map(obj => {
        const cleaned = cleanIdentityLock(obj.identity_prompt || "");
        if (!cleaned && obj.nom) return `Subject: ${obj.nom}`;
        return cleaned;
      })
      .filter(Boolean);
    const hasRefImages = effectiveLinkedObjects.some(obj => obj.reference_images && obj.reference_images.length > 0);
    const techLines: string[] = [
      `Output: one single cinematic ${aspectRatio} image, no borders, no letterboxing, no square crop.`,
      "No visible written text in the image: no titles, labels, captions, signs, or readable document text. A blank sheet must stay blank.",
    ];
    if (soberTableScene) {
      techLines.push(
        "Hard scene lock: one chef only, seated at the table, serious/clinical expression, looking at a blank white sheet, holding a pen.",
        "Forbidden: professional kitchen background, cooking activity, stove, flames, pots, pans, vegetables, plates of food, smiling pose, standing hero portrait, extra chefs or duplicate characters.",
      );
    }
    if (hasRefImages) {
      techLines.push(
        "Reference images are identity anchors for face/clothing ONLY. Ignore their backgrounds, poses, props, smiles, cooking scenes, plates of food, and extra people.",
        "Preserve the subject's exact identity without redesign, modernization, hybridization, or generic lookalike.",
        "Single instance only: the subject appears EXACTLY ONCE. No duplicates, no mirroring, no split-screen, no diptych, no collage.",
      );
    }

    const build = (scene: string, locks: string[]) => [
      `SCENE TO RENDER — PRIMARY INSTRUCTION\n${scene}`,
      styleBlock,
      locks.length > 0 ? `SUBJECT IDENTITY ANCHORS — appearance only, never composition/setting\n${locks.join("\n\n")}` : null,
      `TECHNICAL CONSTRAINTS\n${techLines.join("\n")}`,
      hasRefImages
        ? `[Images de référence transmises au modèle]\n${effectiveLinkedObjects.flatMap(obj =>
            (obj.reference_images || []).map((url, i) => {
              const fileName = url.split("/").pop()?.split("?")[0] || `ref_${i + 1}`;
              return `  📷 ${obj.nom} — ${fileName}`;
            })
          ).join("\n")}`
        : null,
    ].filter(Boolean).join("\n\n---\n\n");

    let output = build(sceneBlock, identityLocks);
    if (maxChars && output.length > maxChars) {
      const compactLocks = identityLocks.map(lock => lock.split(/(?<=[.!?])\s+/)[0]?.slice(0, 180)).filter(Boolean) as string[];
      output = build(sceneBlock, compactLocks);
    }
    if (maxChars && output.length > maxChars) {
      const overflow = output.length - maxChars;
      const minSceneLength = Math.min(sceneBlock.length, 700);
      const trimmedScene = sceneBlock.slice(0, Math.max(minSceneLength, sceneBlock.length - overflow - 3)) + "...";
      output = build(trimmedScene, []);
    }
    return output;
  };

  const buildFullPromptPreview = (basePrompt: string) => {
    // If user has a custom edited version, use that
    if (customFullPrompt !== null) return customFullPrompt;
    const isKie = typeof imageModel === "string" && imageModel.startsWith("kie:");
    return buildSceneFirstPrompt(basePrompt, { maxChars: isKie ? 1900 : undefined });
  };

  const startEditFullPrompt = () => {
    const preview = buildFullPromptPreview(shot.prompt_export || shot.description);
    setFullPromptDraft(preview);
    setEditingFullPrompt(true);
  };

  const saveFullPrompt = () => {
    setCustomFullPrompt(fullPromptDraft);
    setEditingFullPrompt(false);
    toast.success("Prompt personnalisé sauvegardé — sera utilisé pour la prochaine génération");
  };

  const resetFullPrompt = () => {
    setCustomFullPrompt(null);
    setEditingFullPrompt(false);
    toast.info("Prompt réinitialisé au format automatique");
  };

  const startEdit = () => {
    setEditType(shot.shot_type);
    setEditDesc(shot.description);
    setEditPrompt(shot.prompt_export ?? "");
    setEditSourceSentence(shot.source_sentence ?? "");
    setEditSourceSentenceFr(shot.source_sentence_fr ?? "");
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
        source_sentence: editSourceSentence.trim() || null,
        source_sentence_fr: editSourceSentenceFr.trim() || null,
      })
      .eq("id", shot.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de la mise à jour.");
      return;
    }
    onUpdate({
      ...shot,
      shot_type: editType,
      description: editDesc.trim(),
      prompt_export: editPrompt.trim() || null,
      source_sentence: editSourceSentence.trim() || null,
      source_sentence_fr: editSourceSentenceFr.trim() || null,
    });
    setEditing(false);
    toast.success("Shot mis à jour !");
  };


  const handleGenerateImage = async () => {
    if (!onGenerateImage) return;
    setGeneratingImage(true);
    try {
      await onGenerateImage(
        shot.id,
        customFullPrompt ?? buildSceneFirstPrompt(shot.prompt_export || shot.description, {
          maxChars: typeof imageModel === "string" && imageModel.startsWith("kie:") ? 1900 : undefined,
        }),
      );
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleToggleNoCharacter = async () => {
    const next = !((shot as any).force_no_character === true);
    const { error } = await supabase
      .from("shots")
      .update({ force_no_character: next } as any)
      .eq("id", shot.id);
    if (error) {
      toast.error("Impossible de mettre à jour le mode sans personnage");
      return;
    }
    onUpdate({ ...(shot as any), force_no_character: next } as Shot);
    toast.success(
      next
        ? "Mode sans personnage activé : les références personnage seront ignorées"
        : "Mode sans personnage désactivé",
    );
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(shot.id);
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleMerge = async () => {
    if (!onMergeWithNext) return;
    setMerging(true);
    try {
      await onMergeWithNext(shot.id);
    } finally {
      setMerging(false);
    }
  };

  const handleSplit = async () => {
    if (!onSplit || splitIndex === null) return;
    setSplitting(true);
    try {
      await onSplit(shot.id, splitIndex);
      setSplitDialogOpen(false);
    } finally {
      setSplitting(false);
    }
  };

  const openSplitDialog = () => {
    const text = shot.source_sentence || "";
    if (text.length < 10) {
      toast.warning("Le texte est trop court pour être scindé.");
      return;
    }
    // Find a good default split point (nearest sentence boundary to middle)
    const mid = Math.floor(text.length / 2);
    let best = mid;
    for (let delta = 0; delta < Math.floor(text.length / 2); delta++) {
      const after = mid + delta;
      const before = mid - delta;
      if (after < text.length && /[.!?;]/.test(text[after])) { best = after + 1; break; }
      if (before > 0 && /[.!?;]/.test(text[before])) { best = before + 1; break; }
      if (after < text.length && text[after] === ",") { best = after + 1; break; }
      if (before > 0 && text[before] === ",") { best = before + 1; break; }
    }
    setSplitIndex(best);
    setSplitDialogOpen(true);
  };

  const copyPrompt = () => {
    const text = shot.prompt_export || shot.description;
    navigator.clipboard.writeText(text).then(() => toast.success("Prompt copié"));
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${shot.project_id}/${shot.id}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("shot-images").upload(path, file, { upsert: true });
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
      <div className="rounded border border-primary/30 bg-muted p-3 sm:p-4 space-y-2">
        <select value={editType} onChange={(e) => setEditType(e.target.value)} className={`${inputClass} min-h-[44px] sm:min-h-0`}>
          {SHOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          {!SHOT_TYPES.includes(editType) && <option value={editType}>{editType}</option>}
        </select>
        <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className={`${inputClass} min-h-[60px] resize-y`} placeholder="Description" />
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Phrase illustrée (EN) — utilisée par la VO</label>
          <textarea value={editSourceSentence} onChange={(e) => setEditSourceSentence(e.target.value)} className={`${inputClass} min-h-[50px] resize-y`} placeholder="Source sentence (EN)" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Phrase illustrée (FR)</label>
          <textarea value={editSourceSentenceFr} onChange={(e) => setEditSourceSentenceFr(e.target.value)} className={`${inputClass} min-h-[50px] resize-y`} placeholder="Source sentence (FR)" />
        </div>
        <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} className={`${inputClass} min-h-[80px] resize-y font-mono`} placeholder="Prompt export" />
        <div className="flex gap-2">
          <Button size="sm" onClick={saveEdit} disabled={saving} className="min-h-[44px] sm:min-h-0">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} OK
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="min-h-[44px] sm:min-h-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="group rounded border border-border bg-muted p-3 sm:p-4 transition-colors hover:border-primary/30 relative">
        {/* Action buttons — above image */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {globalIndex !== undefined && <span className="text-xs font-display font-bold text-emerald-500">Shot {globalIndex}</span>}
            <span className="text-[10px] text-muted-foreground">{shot.shot_type}</span>
          </div>
          <div className="flex gap-0.5 sm:gap-1 shrink-0 flex-wrap">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" title="Uploader une image">
              {uploading ? <Loader2 className="h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin" /> : <Upload className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
            </button>
            <button onClick={copyPrompt} className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" title="Copier le prompt">
              <Copy className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </button>
            <button onClick={startEdit} className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" title="Éditer">
              <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </button>
            {onMergeWithNext && !isLastInScene && (
              <button onClick={handleMerge} disabled={merging} className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" title="Fusionner avec le shot suivant">
                {merging ? <Loader2 className="h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin" /> : <Merge className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
              </button>
            )}
            {onSplit && shot.source_sentence && shot.source_sentence.length >= 10 && (
              <button onClick={openSplitDialog} disabled={splitting} className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" title="Scinder ce shot en deux">
                {splitting ? <Loader2 className="h-4 w-4 sm:h-3.5 sm:w-3.5 animate-spin" /> : <Scissors className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
              </button>
            )}
            <button onClick={() => setDeleteDialogOpen(true)} className="p-2 sm:p-1.5 rounded transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" title="Supprimer ce shot">
              <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </button>
          </div>
        </div>

        {imageUrl && (
          <div className="mb-3">
            <button
              onClick={() => onToggleImageExpanded?.()}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors mb-1"
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${imageExpanded ? 'rotate-90' : ''}`} />
              Visuel
            </button>
            {imageExpanded && (
              <div
                className="rounded overflow-hidden border border-border cursor-pointer"
                onClick={() => setLightboxOpen(true)}
              >
                <img src={imageUrl} alt={`Shot ${globalIndex ?? ""}`} className="w-full h-auto object-contain" loading="lazy" />
              </div>
            )}
          </div>
        )}
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Coût IA : {formatUsd(cost)}
          </span>
          {shot.guardrails === "safety_filtered" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600" title="Le prompt original a déclenché le filtre de sécurité du modèle.">
              <ShieldAlert className="h-3 w-3" /> Prompt adapté (safety)
            </span>
          )}
          {shot.guardrails === "safety_blocked" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive" title="Le prompt a été bloqué par le filtre de sécurité.">
              <ShieldOff className="h-3 w-3" /> Bloqué par safety
            </span>
          )}
        </div>
        {/* Linked recurring objects */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
            {linkedObjects?.map((obj) => (
              <span
                key={obj.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[obj.type] || TYPE_COLORS.object}`}
              >
                {TYPE_ICONS[obj.type] || TYPE_ICONS.object}
                {obj.nom}
                {onUnlinkObject && sceneOrder !== undefined && (
                  <button
                    onClick={() => onUnlinkObject(sceneOrder, obj.id)}
                    className="ml-0.5 hover:opacity-70"
                    title={`Retirer ${obj.nom} de ce shot`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
                {obj.reference_images && obj.reference_images.length > 0 && (
                  <span className="text-[9px] opacity-60">📷{obj.reference_images.length}</span>
                )}
              </span>
            ))}
            {onLinkObject && allObjects && sceneOrder !== undefined && (() => {
              const linkedIds = new Set(linkedObjects?.map(o => o.id) || []);
              const available = allObjects.filter(o => !linkedIds.has(o.id));
              if (available.length === 0) return null;
              return (
                <div className="relative">
                  <button
                    onClick={() => setShowObjectPicker(!showObjectPicker)}
                    className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-muted-foreground/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    title="Ajouter un objet/personnage/lieu"
                  >
                    <Package className="h-2.5 w-2.5" /> +
                  </button>
                  {showObjectPicker && (
                    <div className="absolute top-full left-0 z-50 mt-1 rounded border border-border bg-popover shadow-md p-1 min-w-[180px] max-h-[200px] overflow-y-auto">
                      {available.map(obj => (
                        <button
                          key={obj.id}
                          onClick={() => {
                            onLinkObject(sceneOrder, obj.id);
                            setShowObjectPicker(false);
                          }}
                          className={`w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-left hover:bg-secondary transition-colors`}
                        >
                          <span className={`flex items-center gap-1 text-[10px] px-1 py-0.5 rounded border ${TYPE_COLORS[obj.type] || TYPE_COLORS.object}`}>
                            {TYPE_ICONS[obj.type] || TYPE_ICONS.object}
                          </span>
                          {obj.nom || "(sans nom)"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <button
              type="button"
              onClick={handleToggleNoCharacter}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                (shot as any).force_no_character
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary"
              }`}
              title="Force le retrait des images de référence personnage et de leur identity lock — utile pour les plans métaphoriques (gros plan sur un objet, un détail, un symbole)."
            >
              <UserX className="h-2.5 w-2.5" />
              {(shot as any).force_no_character ? "Sans personnage : ON" : "Sans personnage"}
            </button>
        </div>
        <details className="group/shot-details">
          <summary className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors flex items-center gap-1">
            Phrase illustrée / Prompt
            <span className="ml-auto text-[9px] group-open/shot-details:rotate-90 transition-transform">▶</span>
          </summary>
          <div className="mt-2 space-y-2">
            {shot.source_sentence && (
              <div className="rounded bg-secondary/50 border border-border px-2 sm:px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Phrase illustrée</span>
                  {(() => {
                    const len = shot.source_sentence.trim().length;
                    const isShort = len < 40;
                    const isLong = len > 180;
                    const isOverSoft = len > 120 && len <= 180;
                    if (isShort) return <span className="text-[9px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-600 border-amber-500/20">Court ({len}c) — exception</span>;
                    if (isLong) return <span className="text-[9px] px-1.5 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/20">Long ({len}c) — re-segmenter</span>;
                    if (isOverSoft) return <span className="text-[9px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-600 border-amber-500/20">{len}c — toléré</span>;
                    return <span className="text-[9px] px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{len}c ✓</span>;
                  })()}
                </div>
                <p className="text-xs text-foreground leading-relaxed mt-0.5 italic break-words">"{shot.source_sentence}"</p>
                {shot.source_sentence_fr && scriptLanguage !== "fr" && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground leading-relaxed italic break-words flex-1">🇫🇷 "{shot.source_sentence_fr}"</p>
                    {onRetranslate && (
                      <button
                        onClick={async () => {
                          setRetranslating(true);
                          try { await onRetranslate(shot.id); } finally { setRetranslating(false); }
                        }}
                        disabled={retranslating}
                        className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                        title="Retraduire ce fragment"
                      >
                        {retranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                )}
                {!shot.source_sentence_fr && onRetranslate && scriptLanguage !== "fr" && (
                  <button
                    onClick={async () => {
                      setRetranslating(true);
                      try { await onRetranslate(shot.id); } finally { setRetranslating(false); }
                    }}
                    disabled={retranslating}
                    className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    title="Traduire ce fragment en français"
                  >
                    {retranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
                    <span>Traduire en 🇫🇷</span>
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed break-words">{shot.description}</p>
        {shot.prompt_export && (
              <details className="group/details">
                <summary className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors min-h-[44px] sm:min-h-0 flex items-center gap-1">
                  Prompt complet envoyé à l'IA
                  {customFullPrompt !== null && <span className="text-[9px] text-primary font-normal normal-case">(personnalisé)</span>}
                </summary>
                {editingFullPrompt ? (
                  <div className="mt-1 space-y-1.5">
                    <textarea
                      value={fullPromptDraft}
                      onChange={(e) => setFullPromptDraft(e.target.value)}
                      className="w-full rounded border border-primary/30 bg-background p-2 sm:p-3 text-[11px] text-foreground leading-relaxed whitespace-pre-wrap font-mono break-words resize-y min-h-[200px] focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={saveFullPrompt} className="h-7 text-[11px] px-2">
                        <Check className="h-3 w-3 mr-1" /> Sauvegarder
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingFullPrompt(false)} className="h-7 text-[11px] px-2">
                        <X className="h-3 w-3" /> Annuler
                      </Button>
                      {customFullPrompt !== null && (
                        <Button size="sm" variant="ghost" onClick={resetFullPrompt} className="h-7 text-[11px] px-2 text-destructive">
                          Réinitialiser
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 relative group/prompt">
                    <pre className="rounded bg-background border border-border p-2 sm:p-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono select-all cursor-text break-words overflow-x-auto">
                      {buildFullPromptPreview(shot.prompt_export)}
                    </pre>
                    <button
                      onClick={startEditFullPrompt}
                      className="absolute top-1 right-1 p-1.5 rounded bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors opacity-0 group-hover/prompt:opacity-100"
                      title="Modifier le prompt complet"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </details>
            )}
          </div>
        </details>
      </div>

      {lightboxOpen && imageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
              <p className="font-display font-semibold text-sm sm:text-base">SHOT {globalIndex} — {shot.shot_type}</p>
              <p className="text-xs text-white/70">Coût IA cumulé : {formatUsd(cost)}</p>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce shot ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deleting} className="min-h-[44px]">Annuler</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="min-h-[44px]">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Supprimer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Split dialog */}
      <AlertDialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Scissors className="h-4 w-4" /> Scinder ce shot en deux
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cliquez dans le texte pour choisir le point de coupure. Le shot sera divisé en deux fragments distincts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {shot.source_sentence && splitIndex !== null && (
            <div className="space-y-3">
              <div className="rounded border border-border bg-secondary/30 p-3">
                <p className="text-xs leading-relaxed">
                  <span className="bg-primary/20 text-foreground px-0.5 rounded">
                    {shot.source_sentence.slice(0, splitIndex)}
                  </span>
                  <span className="inline-block w-0.5 h-4 bg-primary mx-0.5 align-middle animate-pulse" />
                  <span className="bg-accent/30 text-foreground px-0.5 rounded">
                    {shot.source_sentence.slice(splitIndex)}
                  </span>
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Position de coupure</label>
                <input
                  type="range"
                  min={5}
                  max={shot.source_sentence.length - 5}
                  value={splitIndex}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    // Snap to nearest word boundary
                    const text = shot.source_sentence!;
                    let snapped = val;
                    for (let d = 0; d < 10; d++) {
                      if (val + d < text.length && text[val + d] === " ") { snapped = val + d + 1; break; }
                      if (val - d > 0 && text[val - d] === " ") { snapped = val - d + 1; break; }
                    }
                    setSplitIndex(snapped);
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Shot A : {splitIndex} car.</span>
                  <span>Shot B : {shot.source_sentence.length - splitIndex} car.</span>
                </div>
              </div>
            </div>
          )}
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={splitting} className="min-h-[44px]">Annuler</AlertDialogCancel>
            <Button onClick={handleSplit} disabled={splitting} className="min-h-[44px]">
              {splitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Scissors className="h-4 w-4 mr-1" />}
              Scinder
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
