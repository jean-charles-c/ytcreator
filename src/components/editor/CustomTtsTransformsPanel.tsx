import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Replace, Pencil, Check, X } from "lucide-react";

interface TtsTransform {
  id: string;
  pattern: string;
  replacement: string;
}

interface CustomTtsTransformsPanelProps {
  onTransformsChange?: (transforms: { pattern: string; replacement: string }[]) => void;
}

const DEFAULT_ENTRIES: { pattern: string; replacement: string }[] = [
  { pattern: "c' + voyelle", replacement: "fusion (ex: c'est → cest)" },
  { pattern: "n' + voyelle", replacement: "fusion (ex: n'est → nest)" },
  { pattern: "s' + voyelle", replacement: "fusion (ex: s'est → sest)" },
  { pattern: "l' + voyelle", replacement: "fusion (ex: l'un → lun)" },
  { pattern: "d' + voyelle", replacement: "fusion (ex: d'une → dune)" },
  { pattern: "m' + voyelle", replacement: "fusion (ex: m'a → ma)" },
  { pattern: "t' + voyelle", replacement: "fusion (ex: t'en → ten)" },
  { pattern: "qu' + voyelle", replacement: "fusion (ex: qu'il → quil)" },
  { pattern: "c'est + voyelle", replacement: "liaison t (ex: cest tun)" },
  { pattern: "n'est + voyelle", replacement: "liaison t (ex: nest tun)" },
];

export default function CustomTtsTransformsPanel({ onTransformsChange }: CustomTtsTransformsPanelProps) {
  const [items, setItems] = useState<TtsTransform[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [newReplacement, setNewReplacement] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPattern, setEditPattern] = useState("");
  const [editReplacement, setEditReplacement] = useState("");

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
      setLoading(false);
      return;
    }

    let fetched = (data as any[] || []).map((r: any) => ({
      id: r.id as string,
      pattern: r.pattern as string,
      replacement: r.replacement as string,
    }));

    // Seed default entries on first use
    if (fetched.length === 0) {
      const inserts = DEFAULT_ENTRIES.map(e => ({
        user_id: user.id,
        pattern: e.pattern,
        replacement: e.replacement,
      }));
      const { error: seedErr } = await supabase
        .from("custom_tts_transforms" as any)
        .insert(inserts as any);
      if (!seedErr) {
        const { data: seeded } = await supabase
          .from("custom_tts_transforms" as any)
          .select("id, pattern, replacement")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });
        fetched = (seeded as any[] || []).map((r: any) => ({
          id: r.id as string,
          pattern: r.pattern as string,
          replacement: r.replacement as string,
        }));
      }
    }

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

  const handleEdit = (item: TtsTransform) => {
    setEditingId(item.id);
    setEditPattern(item.pattern);
    setEditReplacement(item.replacement);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const pattern = editPattern.trim();
    if (!pattern) {
      toast.error("Le champ pattern est requis.");
      return;
    }

    const { error } = await supabase
      .from("custom_tts_transforms" as any)
      .update({ pattern, replacement: editReplacement.trim() } as any)
      .eq("id", editingId);

    if (error) {
      toast.error("Impossible de modifier.");
    } else {
      toast.success("Transformation modifiée.");
      setEditingId(null);
      await fetchItems();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Replace className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Transformations texte → TTS</span>
        <span className="text-[10px] text-muted-foreground">({items.length})</span>
      </div>

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
          Aucune transformation. Ajoutez des règles de remplacement texte avant envoi au TTS.
        </p>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 group">
              {editingId === item.id ? (
                <>
                  <Input
                    value={editPattern}
                    onChange={(e) => setEditPattern(e.target.value)}
                    className="h-6 text-xs flex-1 font-mono px-1"
                  />
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <Input
                    value={editReplacement}
                    onChange={(e) => setEditReplacement(e.target.value)}
                    className="h-6 text-xs flex-1 font-mono px-1"
                  />
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600" onClick={handleSaveEdit}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs font-mono text-foreground flex-1 truncate">{item.pattern}</span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <span className="text-xs font-mono text-primary flex-1 truncate">{item.replacement || '(supprimé)'}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    onClick={() => handleEdit(item)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
