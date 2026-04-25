import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SaveNarrativeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  defaultDescription?: string;
  saving?: boolean;
  onSave: (input: { name: string; description: string; userNotes: string }) => Promise<void> | void;
}

/**
 * Étape 9 — Dialog "Sauvegarder comme forme narrative".
 * Champs : nom, description courte, notes auteur (intégrées au prompt).
 */
export default function SaveNarrativeFormDialog({
  open,
  onOpenChange,
  defaultName = "",
  defaultDescription = "",
  saving = false,
  onSave,
}: SaveNarrativeFormDialogProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [userNotes, setUserNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setDescription(defaultDescription);
      setUserNotes("");
    }
  }, [open, defaultName, defaultDescription]);

  const canSave = name.trim().length >= 2 && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    await onSave({
      name: name.trim(),
      description: description.trim(),
      userNotes: userNotes.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Sauvegarder comme forme narrative</DialogTitle>
            <DialogDescription>
              Cette forme sera disponible dans ScriptCreator v2 pour générer de nouveaux scripts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="form-name">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="form-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Récit immersif daté"
                maxLength={80}
                autoFocus
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Ce nom apparaîtra dans la liste des formes du ScriptCreator.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="form-desc">Description courte</Label>
              <Input
                id="form-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex : Reconstitution chronologique avec scènes incarnées."
                maxLength={160}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="form-notes">Notes auteur (optionnel)</Label>
              <Textarea
                id="form-notes"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="Précisions ou règles personnelles à appliquer en priorité (registre, personnages, interdits…)."
                rows={4}
                className="resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Ces notes seront injectées dans le prompt avec une priorité absolue.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sauvegarde…</>
              ) : (
                <><Save className="h-4 w-4" /> Sauvegarder la forme</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
