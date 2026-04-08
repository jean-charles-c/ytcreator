import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Replace, Pencil, Check, X, ShieldAlert } from "lucide-react";

interface TtsTransform {
  id: string;
  pattern: string;
  replacement: string;
  is_exception: boolean;
}

interface CustomTtsTransformsPanelProps {
  onTransformsChange?: (transforms: { pattern: string; replacement: string }[]) => void;
}

export default function CustomTtsTransformsPanel({ onTransformsChange }: CustomTtsTransformsPanelProps) {
  const [items, setItems] = useState<TtsTransform[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [newReplacement, setNewReplacement] = useState("");
  const [newIsException, setNewIsException] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPattern, setEditPattern] = useState("");
  const [editReplacement, setEditReplacement] = useState("");
  const [editIsException, setEditIsException] = useState(false);

  const fetchItems = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("custom_tts_transforms" as any)
      .select("id, pattern, replacement, is_exception")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load custom TTS transforms:", error);
      setLoading(false);
      return;
    }

    const fetched = (data as any[] || []).map((r: any) => ({
      id: r.id as string,
      pattern: r.pattern as string,
      replacement: r.replacement as string,
      is_exception: !!r.is_exception,
    }));

    setItems(fetched);
    onTransformsChange?.(fetched.filter(t => !t.is_exception).map(({ pattern, replacement }) => ({ pattern, replacement })));
    setLoading(false);
  }, [onTransformsChange]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    const pattern = newPattern.trim();
    const replacement = newReplacement.trim();
    if (!pattern) {
      toast.error("Remplissez le texte.");
      return;
    }
    if (!newIsException && !replacement) {
      toast.error("Remplissez le texte de remplacement.");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase
      .from("custom_tts_transforms" as any)
      .insert({ user_id: user.id, pattern, replacement: newIsException ? "" : replacement, is_exception: newIsException } as any);

    if (error) {
      toast.error("Impossible d'ajouter.");
    } else {
      toast.success(newIsException ? `Exception ajoutée : "${pattern}" ne sera pas fusionné` : `Transformation ajoutée : "${pattern}" → "${replacement}"`);
      setNewPattern("");
      setNewReplacement("");
      setNewIsException(false);
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
      toast.success("Entrée supprimée.");
      await fetchItems();
    }
  };

  const handleEdit = (item: TtsTransform) => {
    setEditingId(item.id);
    setEditPattern(item.pattern);
    setEditReplacement(item.replacement);
    setEditIsException(item.is_exception);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const pattern = editPattern.trim();
    if (!pattern) { toast.error("Le champ pattern est requis."); return; }

    const { error } = await supabase
      .from("custom_tts_transforms" as any)
      .update({ pattern, replacement: editIsException ? "" : editReplacement.trim(), is_exception: editIsException } as any)
      .eq("id", editingId);
    if (error) {
      toast.error("Impossible de modifier.");
    } else {
      toast.success("Entrée modifiée.");
      setEditingId(null);
      await fetchItems();
    }
  };

  const transforms = items.filter(i => !i.is_exception);
  const exceptions = items.filter(i => i.is_exception);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Replace className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Transformations texte → TTS</span>
        <span className="text-[10px] text-muted-foreground">({transforms.length})</span>
      </div>

      {/* Add form */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input value={newPattern} onChange={(e) => setNewPattern(e.target.value)} placeholder={newIsException ? "Exception (ex: n'a)" : "Chercher (ex: qu'à)"} className="h-8 text-xs flex-1 font-mono" />
          {!newIsException && (
            <Input value={newReplacement} onChange={(e) => setNewReplacement(e.target.value)} placeholder="Remplacer (ex: quà)" className="h-8 text-xs flex-1 font-mono" />
          )}
          <Button size="sm" variant="outline" className="h-8 px-2 shrink-0" onClick={handleAdd} disabled={saving || !newPattern.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch checked={newIsException} onCheckedChange={setNewIsException} className="scale-75" />
          <span className="text-[10px] text-muted-foreground">Exception (protéger ce mot des fusions d'élision)</span>
        </label>
      </div>

      {/* Transforms list */}
      {loading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {transforms.length === 0 && exceptions.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">Aucune transformation ni exception.</p>
          )}

          {transforms.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {transforms.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 group">
                  {editingId === item.id ? (
                    <>
                      <Input value={editPattern} onChange={(e) => setEditPattern(e.target.value)} className="h-6 text-xs flex-1 font-mono px-1" />
                      <span className="text-[10px] text-muted-foreground">→</span>
                      <Input value={editReplacement} onChange={(e) => setEditReplacement(e.target.value)} className="h-6 text-xs flex-1 font-mono px-1" />
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600" onClick={handleSaveEdit}><Check className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-mono text-foreground flex-1 truncate">{item.pattern}</span>
                      <span className="text-[10px] text-muted-foreground">→</span>
                      <span className="text-xs font-mono text-primary flex-1 truncate">{item.replacement || '(supprimé)'}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground" onClick={() => handleEdit(item)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3 w-3" /></Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Exceptions list */}
          {exceptions.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 mt-2">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[10px] font-semibold text-foreground">Exceptions aux fusions ({exceptions.length})</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {exceptions.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5 group">
                    {editingId === item.id ? (
                      <>
                        <Input value={editPattern} onChange={(e) => setEditPattern(e.target.value)} className="h-6 text-xs flex-1 font-mono px-1" />
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600" onClick={handleSaveEdit}><Check className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-mono text-foreground flex-1 truncate">{item.pattern}</span>
                        <span className="text-[10px] text-amber-600">protégé</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground" onClick={() => handleEdit(item)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3 w-3" /></Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
