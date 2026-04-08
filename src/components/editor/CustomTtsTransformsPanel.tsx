import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Replace } from "lucide-react";

interface TtsTransform {
  id: string;
  pattern: string;
  replacement: string;
}

interface CustomTtsTransformsPanelProps {
  onTransformsChange?: (transforms: { pattern: string; replacement: string }[]) => void;
}

const BUILT_IN: { pattern: string; replacement: string }[] = [
  { pattern: "c'est + voyelle", replacement: "cest t..." },
  { pattern: "n'est + voyelle", replacement: "nest t..." },
  { pattern: "c' + voyelle", replacement: "c (fusionné)" },
  { pattern: "n' + voyelle", replacement: "n (fusionné)" },
  { pattern: "s' + voyelle", replacement: "s (fusionné)" },
  { pattern: "l' + voyelle", replacement: "l (fusionné)" },
  { pattern: "d' + voyelle", replacement: "d (fusionné)" },
  { pattern: "m' + voyelle", replacement: "m (fusionné)" },
  { pattern: "t' + voyelle", replacement: "t (fusionné)" },
  { pattern: "qu' + voyelle", replacement: "qu (fusionné)" },
];

export default function CustomTtsTransformsPanel({ onTransformsChange }: CustomTtsTransformsPanelProps) {
  const [items, setItems] = useState<TtsTransform[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [newReplacement, setNewReplacement] = useState("");
  const [saving, setSaving] = useState(false);
  const [showBuiltIn, setShowBuiltIn] = useState(false);

  const fetchItems = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("custom_tts_transforms" as any)
      .select("id, pattern, replacement")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load custom TTS transforms:", error);
      return;
    }
    const fetched = (data as any[] || []).map((r: any) => ({
      id: r.id as string,
      pattern: r.pattern as string,
      replacement: r.replacement as string,
    }));
    setItems(fetched);
    onTransformsChange?.(fetched.map(({ pattern, replacement }) => ({ pattern, replacement })));
    setLoading(false);
  }, [onTransformsChange]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    const pattern = newPattern.trim();
    const replacement = newReplacement.trim();
    if (!pattern) {
      toast.error("Remplissez le texte à chercher.");
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase
      .from("custom_tts_transforms" as any)
      .insert({ user_id: user.id, pattern, replacement } as any);

    if (error) {
      console.error("Insert error:", error);
      toast.error("Impossible d'ajouter la transformation.");
    } else {
      toast.success(`Transformation ajoutée : "${pattern}" → "${replacement}"`);
      setNewPattern("");
      setNewReplacement("");
      await fetchItems();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("custom_tts_transforms" as any)
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Impossible de supprimer.");
    } else {
      toast.success("Transformation supprimée.");
      await fetchItems();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Replace className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Transformations texte → TTS</span>
        </div>
        <button
          onClick={() => setShowBuiltIn(!showBuiltIn)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          {showBuiltIn ? "Masquer les intégrées" : `Voir les ${BUILT_IN.length} intégrées`}
        </button>
      </div>

      {showBuiltIn && (
        <div className="rounded-md border border-border bg-muted/30 p-2 max-h-40 overflow-y-auto">
          <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Transformations intégrées (non modifiables) :</p>
          <div className="grid grid-cols-1 gap-y-0.5">
            {BUILT_IN.map((b) => (
              <div key={b.pattern} className="flex items-center gap-1 text-[10px]">
                <span className="text-foreground font-mono">{b.pattern}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-primary font-mono">{b.replacement}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      <div className="flex items-center gap-2">
        <Input
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          placeholder="Chercher (ex: qu'à)"
          className="h-8 text-xs flex-1 font-mono"
        />
        <Input
          value={newReplacement}
          onChange={(e) => setNewReplacement(e.target.value)}
          placeholder="Remplacer (ex: quà)"
          className="h-8 text-xs flex-1 font-mono"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 shrink-0"
          onClick={handleAdd}
          disabled={saving || !newPattern.trim()}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-2">
          Aucune transformation personnalisée. Ajoutez des règles de remplacement texte avant envoi au TTS.
        </p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 group">
              <span className="text-xs font-mono text-foreground flex-1 truncate">{item.pattern}</span>
              <span className="text-[10px] text-muted-foreground">→</span>
              <span className="text-xs font-mono text-primary flex-1 truncate">{item.replacement || '(supprimé)'}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { BUILT_IN as BUILT_IN_TTS_TRANSFORMS };
