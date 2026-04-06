import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, BookA } from "lucide-react";

interface Pronunciation {
  id: string;
  phrase: string;
  pronunciation: string;
}

interface CustomPronunciationsPanelProps {
  onPronunciationsChange?: (pronunciations: { phrase: string; pronunciation: string }[]) => void;
}

const BUILT_IN: { phrase: string; pronunciation: string }[] = [
  { phrase: "c'est", pronunciation: "sɛ" },
  { phrase: "n'est", pronunciation: "nɛ" },
  { phrase: "l'est", pronunciation: "lɛ" },
  { phrase: "s'est", pronunciation: "sɛ" },
  { phrase: "c'était", pronunciation: "setɛ" },
  { phrase: "n'était", pronunciation: "netɛ" },
  { phrase: "c'en", pronunciation: "sɑ̃" },
  { phrase: "n'en", pronunciation: "nɑ̃" },
  { phrase: "n'y", pronunciation: "ni" },
  { phrase: "qu'est", pronunciation: "kɛ" },
  { phrase: "qu'il", pronunciation: "kil" },
  { phrase: "qu'elle", pronunciation: "kɛl" },
  { phrase: "qu'on", pronunciation: "kɔ̃" },
  { phrase: "qu'un", pronunciation: "kœ̃" },
  { phrase: "qu'une", pronunciation: "kyn" },
  { phrase: "d'un", pronunciation: "dœ̃" },
  { phrase: "d'une", pronunciation: "dyn" },
  { phrase: "l'on", pronunciation: "lɔ̃" },
];

export default function CustomPronunciationsPanel({ onPronunciationsChange }: CustomPronunciationsPanelProps) {
  const [items, setItems] = useState<Pronunciation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhrase, setNewPhrase] = useState("");
  const [newPronunciation, setNewPronunciation] = useState("");
  const [saving, setSaving] = useState(false);
  const [showBuiltIn, setShowBuiltIn] = useState(false);

  const fetchItems = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("custom_pronunciations" as any)
      .select("id, phrase, pronunciation")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load custom pronunciations:", error);
      return;
    }
    const fetched = (data as any[] || []).map((r: any) => ({
      id: r.id as string,
      phrase: r.phrase as string,
      pronunciation: r.pronunciation as string,
    }));
    setItems(fetched);
    onPronunciationsChange?.(fetched.map(({ phrase, pronunciation }) => ({ phrase, pronunciation })));
    setLoading(false);
  }, [onPronunciationsChange]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    const phrase = newPhrase.trim();
    const pronunciation = newPronunciation.trim();
    if (!phrase || !pronunciation) {
      toast.error("Remplissez le mot et sa prononciation IPA.");
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase
      .from("custom_pronunciations" as any)
      .insert({ user_id: user.id, phrase, pronunciation } as any);

    if (error) {
      console.error("Insert error:", error);
      toast.error("Impossible d'ajouter la prononciation.");
    } else {
      toast.success(`Prononciation ajoutée : ${phrase} → /${pronunciation}/`);
      setNewPhrase("");
      setNewPronunciation("");
      await fetchItems();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("custom_pronunciations" as any)
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Impossible de supprimer.");
    } else {
      toast.success("Prononciation supprimée.");
      await fetchItems();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookA className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Prononciations IPA personnalisées</span>
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
          <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Corrections intégrées (non modifiables) :</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {BUILT_IN.map((b) => (
              <div key={b.phrase} className="flex items-center gap-1 text-[10px]">
                <span className="text-foreground font-mono">{b.phrase}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-primary font-mono">/{b.pronunciation}/</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      <div className="flex items-center gap-2">
        <Input
          value={newPhrase}
          onChange={(e) => setNewPhrase(e.target.value)}
          placeholder="Mot (ex: Libet)"
          className="h-8 text-xs flex-1 font-mono"
        />
        <Input
          value={newPronunciation}
          onChange={(e) => setNewPronunciation(e.target.value)}
          placeholder="IPA (ex: libɛ)"
          className="h-8 text-xs flex-1 font-mono"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 shrink-0"
          onClick={handleAdd}
          disabled={saving || !newPhrase.trim() || !newPronunciation.trim()}
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
          Aucune prononciation personnalisée. Ajoutez des corrections pour les noms propres ou mots mal prononcés.
        </p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 group">
              <span className="text-xs font-mono text-foreground flex-1 truncate">{item.phrase}</span>
              <span className="text-[10px] text-muted-foreground">→</span>
              <span className="text-xs font-mono text-primary flex-1 truncate">/{item.pronunciation}/</span>
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

export { BUILT_IN as BUILT_IN_PRONUNCIATIONS };
