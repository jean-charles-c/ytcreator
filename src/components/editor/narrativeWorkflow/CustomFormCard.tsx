import { useState } from "react";
import { Pencil, Trash2, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { CustomNarrativeForm } from "@/hooks/useCustomNarrativeForms";
import { cn } from "@/lib/utils";

interface CustomFormCardProps {
  form: CustomNarrativeForm;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (id: string, patch: { name?: string; description?: string | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * Étape 9 — Carte d'une forme narrative personnalisée dans ScriptCreator v2.
 * Permet sélection, renommage, édition de description et suppression avec confirmation.
 */
export default function CustomFormCard({
  form,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
}: CustomFormCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? "");
  const [busy, setBusy] = useState(false);

  const openEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setName(form.name);
    setDescription(form.description ?? "");
    setEditOpen(true);
  };
  const openDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteOpen(true);
  };

  const handleSave = async () => {
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      await onUpdate(form.id, { name: name.trim(), description: description.trim() || null });
      setEditOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete(form.id);
      setConfirmDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        title={form.description || form.name}
        className={cn(
          "relative rounded-lg border p-3 text-left transition-all group",
          isSelected
            ? "border-primary bg-primary/10 ring-1 ring-primary"
            : "border-border bg-card hover:border-primary/50 hover:bg-secondary/30",
        )}
      >
        <div className="flex items-start justify-between gap-1">
          <span className="text-xs font-semibold text-foreground truncate pr-1">
            {form.name}
          </span>
          <span className="text-[9px] bg-accent/60 text-foreground px-1 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
            Personnalisée
          </span>
        </div>
        {form.description && (
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {form.description}
          </p>
        )}
        <div className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={openEdit}
            title="Renommer / éditer la description"
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={openDelete}
            title="Supprimer la forme"
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </button>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier la forme narrative</DialogTitle>
            <DialogDescription>
              Renomme la forme ou ajuste sa description. Le prompt système est conservé.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor={`name-${form.id}`}>
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`name-${form.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`desc-${form.id}`}>Description</Label>
              <Textarea
                id={`desc-${form.id}`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={160}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>
              <X className="h-4 w-4" /> Annuler
            </Button>
            <Button type="button" onClick={handleSave} disabled={busy || name.trim().length < 2}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</> : <><Save className="h-4 w-4" /> Enregistrer</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette forme ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {form.name} » sera supprimée définitivement. Les projets déjà créés
              avec cette forme ne sont pas affectés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Suppression…</> : <><Trash2 className="h-4 w-4" /> Supprimer</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
