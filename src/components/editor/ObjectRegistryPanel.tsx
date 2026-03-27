import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Package,
  Plus,
  Trash2,
  ChevronDown,
  Save,
  Car,
  Building2,
  Landmark,
  Box,
  RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

export interface RecurringObject {
  id: string;
  nom: string;
  type: "vehicle" | "building" | "artifact" | "weapon" | "object";
  description_visuelle: string;
  epoque: string;
  mentions_scenes: number[];
  identity_prompt: string;
}

// ── Helpers ────────────────────────────────────────────────────────

const TYPE_META: Record<RecurringObject["type"], { label: string; icon: React.ReactNode; color: string }> = {
  vehicle: { label: "Véhicule", icon: <Car className="h-3.5 w-3.5" />, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  building: { label: "Bâtiment", icon: <Building2 className="h-3.5 w-3.5" />, color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  artifact: { label: "Artefact", icon: <Landmark className="h-3.5 w-3.5" />, color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  weapon: { label: "Arme", icon: <Box className="h-3.5 w-3.5" />, color: "bg-red-500/10 text-red-600 border-red-500/20" },
  object: { label: "Objet", icon: <Package className="h-3.5 w-3.5" />, color: "bg-green-500/10 text-green-600 border-green-500/20" },
};

const IDENTITY_TEMPLATES: Record<RecurringObject["type"], (nom: string) => string> = {
  vehicle: (nom) =>
    `VEHICLE IDENTITY LOCK:\nThe vehicle must remain strictly identifiable as a ${nom} in every image.\nAlways preserve its signature silhouette, body proportions, roofline, front fascia, grille shape, headlight design, air intakes, fender curves, greenhouse, rear profile, wheelbase, stance, and emblem placement.\nDo not reinterpret, modernize, hybridize, or redesign the vehicle.\nDo not replace its defining features with elements from other models, other generations, or other brands.\nAcross all images, the vehicle must remain visually consistent and immediately recognizable as the same iconic vehicle.`,
  building: (nom) =>
    `BUILDING IDENTITY LOCK:\nThe building must remain strictly identifiable as ${nom} in every image.\nAlways preserve its architectural style, proportions, facade details, roofline, windows, entrance, materials, and distinctive ornamental features.\nDo not modernize, simplify, or alter the structure.\nAcross all images, the building must remain visually consistent and immediately recognizable.`,
  artifact: (nom) =>
    `ARTIFACT IDENTITY LOCK:\nThe artifact must remain strictly identifiable as ${nom} in every image.\nAlways preserve its shape, material, color, texture, proportions, and distinctive markings or engravings.\nDo not alter, stylize, or reinterpret the object.\nAcross all images, the artifact must remain visually consistent and immediately recognizable.`,
  weapon: (nom) =>
    `WEAPON IDENTITY LOCK:\nThe weapon must remain strictly identifiable as ${nom} in every image.\nAlways preserve its shape, dimensions, materials, mechanism details, and distinctive features.\nDo not modernize or alter the weapon design.\nAcross all images, the weapon must remain visually consistent and historically accurate.`,
  object: (nom) =>
    `OBJECT IDENTITY LOCK:\nThe object must remain strictly identifiable as ${nom} in every image.\nAlways preserve its shape, proportions, materials, color, and distinctive features.\nDo not alter, stylize, or reinterpret the object.\nAcross all images, the object must remain visually consistent and immediately recognizable.`,
};

function generateId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10);
}

// ── Component ──────────────────────────────────────────────────────

interface ObjectRegistryPanelProps {
  objects: RecurringObject[];
  onChange: (objects: RecurringObject[]) => void;
  sceneCount: number;
  onReanalyze?: () => void;
  isAnalyzing?: boolean;
}

export default function ObjectRegistryPanel({ objects, onChange, sceneCount, onReanalyze, isAnalyzing }: ObjectRegistryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addObject = useCallback(() => {
    const newObj: RecurringObject = {
      id: generateId(),
      nom: "",
      type: "object",
      description_visuelle: "",
      epoque: "",
      mentions_scenes: [],
      identity_prompt: "",
    };
    const updated = [...objects, newObj];
    onChange(updated);
    setExpandedId(newObj.id);
  }, [objects, onChange]);

  const updateObject = useCallback((id: string, patch: Partial<RecurringObject>) => {
    onChange(objects.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, [objects, onChange]);

  const removeObject = useCallback((id: string) => {
    onChange(objects.filter((o) => o.id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [objects, onChange, expandedId]);

  const handleTypeChange = useCallback((id: string, type: RecurringObject["type"]) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const newPrompt = obj.identity_prompt.trim() ? obj.identity_prompt : IDENTITY_TEMPLATES[type](obj.nom || "[NOM]");
    updateObject(id, { type, identity_prompt: newPrompt });
  }, [objects, updateObject]);

  const generatePrompt = useCallback((id: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    updateObject(id, { identity_prompt: IDENTITY_TEMPLATES[obj.type](obj.nom || "[NOM]") });
  }, [objects, updateObject]);

  const toggleScene = useCallback((id: string, sceneOrder: number) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const scenes = obj.mentions_scenes.includes(sceneOrder)
      ? obj.mentions_scenes.filter((s) => s !== sceneOrder)
      : [...obj.mentions_scenes, sceneOrder].sort((a, b) => a - b);
    updateObject(id, { mentions_scenes: scenes });
  }, [objects, updateObject]);

  if (objects.length === 0) {
    return (
      <details className="mb-6 rounded-lg border border-border bg-card p-3 sm:p-5 group">
        <summary className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5 sm:gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden min-h-[44px]">
          <Package className="h-4 w-4 text-primary shrink-0" />
          <span>Objets Récurrents</span>
          <span className="ml-1 text-xs text-muted-foreground font-normal">— Identité visuelle verrouillée</span>
          <span className="ml-auto text-muted-foreground text-xs group-open:rotate-90 transition-transform">▶</span>
        </summary>
        <div className="mt-4 flex flex-col items-center gap-3 py-6">
          <p className="text-sm text-muted-foreground">Aucun objet récurrent détecté. Ajoutez-en manuellement ou relancez l'analyse contextuelle.</p>
          <div className="flex gap-2">
            {onReanalyze && (
              <Button variant="default" size="sm" onClick={onReanalyze} disabled={isAnalyzing} className="min-h-[44px]">
                <RefreshCw className={`h-4 w-4 ${isAnalyzing ? "animate-spin" : ""}`} />
                {isAnalyzing ? "Analyse en cours…" : "Relancer l'analyse contextuelle"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={addObject} className="min-h-[44px]">
              <Plus className="h-4 w-4" /> Ajouter manuellement
            </Button>
          </div>
        </div>
      </details>
    );
  }

  return (
    <details className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-5 group" open>
      <summary className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5 sm:gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden min-h-[44px]">
        <Package className="h-4 w-4 text-primary shrink-0" />
        <span>Objets Récurrents</span>
        <span className="ml-1 text-xs font-bold text-primary">{objects.length}</span>
        <span className="hidden sm:inline ml-1 text-xs text-muted-foreground font-normal">— Identité visuelle verrouillée</span>
        <span className="ml-auto text-muted-foreground text-xs group-open:rotate-90 transition-transform">▶</span>
      </summary>

      <div className="mt-4 space-y-2">
        {objects.map((obj) => {
          const meta = TYPE_META[obj.type] || TYPE_META.object;
          const isExpanded = expandedId === obj.id;

          return (
            <div key={obj.id} className="rounded-lg border border-border bg-background">
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : obj.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary/50 transition-colors min-h-[44px]"
              >
                <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${meta.color}`}>
                  {meta.icon} {meta.label}
                </span>
                <span className="font-medium text-foreground truncate flex-1">{obj.nom || "(sans nom)"}</span>
                {obj.mentions_scenes.length > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    S{obj.mentions_scenes.join(", S")}
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded form */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                  {/* Row 1: nom + type + époque */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Nom exact</label>
                      <Input
                        value={obj.nom}
                        onChange={(e) => updateObject(obj.id, { nom: e.target.value })}
                        placeholder="Ferrari 250 GTO (1962)"
                        className="mt-0.5 h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Type</label>
                      <select
                        value={obj.type}
                        onChange={(e) => handleTypeChange(obj.id, e.target.value as RecurringObject["type"])}
                        className="mt-0.5 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {Object.entries(TYPE_META).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Époque / version</label>
                      <Input
                        value={obj.epoque}
                        onChange={(e) => updateObject(obj.id, { epoque: e.target.value })}
                        placeholder="1962-1964"
                        className="mt-0.5 h-9 text-sm"
                      />
                    </div>
                  </div>

                  {/* Description visuelle */}
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Description visuelle (caractéristiques physiques)</label>
                    <Textarea
                      value={obj.description_visuelle}
                      onChange={(e) => updateObject(obj.id, { description_visuelle: e.target.value })}
                      placeholder="Carrosserie berlinette fastback, capot long et nervuré, trois prises d'air avant, pare-brise panoramique incurvé, feux arrière ronds..."
                      className="mt-0.5 text-xs min-h-[60px]"
                      rows={3}
                    />
                  </div>

                  {/* Scènes concernées */}
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Scènes où l'objet apparaît</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.from({ length: sceneCount }, (_, i) => i + 1).map((order) => {
                        const isActive = obj.mentions_scenes.includes(order);
                        return (
                          <button
                            key={order}
                            onClick={() => toggleScene(obj.id, order)}
                            className={`text-[10px] w-7 h-7 rounded border transition-colors ${
                              isActive
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:bg-secondary"
                            }`}
                          >
                            {order}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Identity prompt */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Prompt d'identité visuelle (injecté dans chaque shot concerné)</label>
                      <Button variant="ghost" size="sm" onClick={() => generatePrompt(obj.id)} className="h-6 text-[10px] px-2">
                        Régénérer template
                      </Button>
                    </div>
                    <Textarea
                      value={obj.identity_prompt}
                      onChange={(e) => updateObject(obj.id, { identity_prompt: e.target.value })}
                      className="mt-0.5 text-xs min-h-[100px] font-mono"
                      rows={5}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <Button variant="destructive" size="sm" onClick={() => removeObject(obj.id)} className="h-8 text-xs">
                      <Trash2 className="h-3 w-3" /> Supprimer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex gap-2">
          {onReanalyze && (
            <Button variant="secondary" size="sm" onClick={onReanalyze} disabled={isAnalyzing} className="flex-1 min-h-[40px] text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
              {isAnalyzing ? "Analyse…" : "Relancer l'analyse IA"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={addObject} className="flex-1 min-h-[40px] text-xs">
            <Plus className="h-3.5 w-3.5" /> Ajouter un objet
          </Button>
        </div>
      </div>
    </details>
  );
}
