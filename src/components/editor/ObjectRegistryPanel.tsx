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
  User,
  MapPin,
  X,
  SearchPlus,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

export interface RecurringObject {
  id: string;
  nom: string;
  type: "vehicle" | "building" | "artifact" | "weapon" | "object" | "character" | "location";
  description_visuelle: string;
  epoque: string;
  mentions_scenes: number[];
  identity_prompt: string;
}

// ── Helpers ────────────────────────────────────────────────────────

const TYPE_META: Record<RecurringObject["type"], { label: string; icon: React.ReactNode; color: string }> = {
  character: { label: "Personnage", icon: <User className="h-3.5 w-3.5" />, color: "bg-pink-500/10 text-pink-600 border-pink-500/20" },
  location: { label: "Lieu", icon: <MapPin className="h-3.5 w-3.5" />, color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20" },
  vehicle: { label: "Véhicule", icon: <Car className="h-3.5 w-3.5" />, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  building: { label: "Bâtiment", icon: <Building2 className="h-3.5 w-3.5" />, color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  artifact: { label: "Artefact", icon: <Landmark className="h-3.5 w-3.5" />, color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  weapon: { label: "Arme", icon: <Box className="h-3.5 w-3.5" />, color: "bg-red-500/10 text-red-600 border-red-500/20" },
  object: { label: "Objet", icon: <Package className="h-3.5 w-3.5" />, color: "bg-green-500/10 text-green-600 border-green-500/20" },
};

const IDENTITY_TEMPLATES: Record<RecurringObject["type"], (nom: string, epoque?: string) => string> = {
  character: (nom, epoque) => {
    const period = epoque || "[exact period]";
    return `Subject: ${nom} during ${period}\n\nThe character must remain strictly and unmistakably identifiable as ${nom} ${period} in every image.\nPreserve their exact facial structure, age appearance, hairstyle, body proportions, posture, clothing logic, distinctive traits, and all defining visual cues specific to that period.\nDo not redesign, beautify, modernize, stylize, de-age, age up, or merge them with any other person or character.\n\nCHARACTER IDENTITY LOCK:\nThe character must remain strictly and unmistakably identifiable as ${nom}.\n\nTIME PERIOD LOCK:\nThe character must be shown strictly as they appeared during ${period}.\nPreserve the age appearance, hairstyle, facial traits, clothing logic, accessories, and visual markers specific to that period.\nDo not mix features from earlier or later periods.\n\nMANDATORY PERIOD-SPECIFIC FEATURES:\n- [period feature 1]\n- [period feature 2]\n- [period feature 3]\n- [period feature 4]\n\nNO TEMPORAL DRIFT:\nDo not combine visual traits from different eras of the same character/person.`;
  },
  location: (nom, epoque) => {
    const period = epoque || "[exact period / state]";
    return `Subject: ${nom} during ${period}\n\nThe location must remain strictly and unmistakably identifiable as ${nom} ${period} in every image.\nPreserve its exact overall layout, proportions, architecture, structural silhouette, materials, surrounding context, landmark features, and all defining visual cues specific to that period.\nDo not redesign, relocate, modernize, stylize, fictionalize, or merge it with any other place.\n\nLOCATION IDENTITY LOCK:\nThe location must remain strictly and unmistakably identifiable as ${nom}.\n\nTIME PERIOD / HISTORICAL STATE LOCK:\nThe location must be shown strictly as it appeared during ${period}.\nPreserve the structural condition, materials, architectural features, surrounding layout, and environmental context specific to that period.\nDo not mix features from earlier or later versions of the same place.\n\nMANDATORY PERIOD-SPECIFIC FEATURES:\n- [feature 1]\n- [feature 2]\n- [feature 3]\n- [feature 4]\n\nNO TEMPORAL DRIFT:\nDo not combine visual traits from different historical states of the same location.`;
  },
  vehicle: (nom, epoque) => {
    const version = epoque || "[year / version]";
    return `Subject: ${nom} ${version}\n\nThe vehicle must remain strictly and unmistakably identifiable as a ${nom} ${version} in every image.\nPreserve its exact signature silhouette, proportions, front-end design, roofline, side profile, rear shape, wheel stance, and all defining design cues.\nDo not redesign, modernize, stylize, or merge it with any other car.\n\nVEHICLE IDENTITY LOCK:\nThe vehicle must remain strictly and unmistakably identifiable as ${nom} in every image.\nPreserve its exact silhouette, proportions, structural logic, materials, surface treatment, and all defining visual features.\nDo not redesign, stylize, modernize, simplify, or merge it with another vehicle.\n\nVERSION / TIME PERIOD LOCK:\nRepresent the vehicle strictly as the ${version}.\nPreserve only the design features specific to that exact version.\nDo not mix traits from other periods, generations, or reinterpretations.\n\nMANDATORY VISUAL FEATURES:\n- [feature 1]\n- [feature 2]\n- [feature 3]\n- [feature 4]\n- [feature 5]\n\nNO OBJECT DRIFT:\nDo not generate a generic lookalike, a related model, a modernized version, or a hybrid object.\nThe vehicle must remain visually consistent across the whole series.\nOnly the environment, lighting, camera angle, scale, context, and scene activity may vary.`;
  },
  building: (nom, epoque) => {
    const period = epoque || "[exact period / state]";
    return `Subject: ${nom} during ${period}\n\nThe location must remain strictly and unmistakably identifiable as ${nom} ${period} in every image.\nPreserve its exact overall layout, proportions, architecture, structural silhouette, materials, surrounding context, landmark features, and all defining visual cues specific to that period.\nDo not redesign, relocate, modernize, stylize, fictionalize, or merge it with any other place.\n\nLOCATION IDENTITY LOCK:\nThe location must remain strictly and unmistakably identifiable as ${nom}.\n\nTIME PERIOD / HISTORICAL STATE LOCK:\nThe location must be shown strictly as it appeared during ${period}.\nPreserve the structural condition, materials, architectural features, surrounding layout, and environmental context specific to that period.\nDo not mix features from earlier or later versions of the same place.\n\nMANDATORY PERIOD-SPECIFIC FEATURES:\n- [feature 1]\n- [feature 2]\n- [feature 3]\n- [feature 4]\n\nNO TEMPORAL DRIFT:\nDo not combine visual traits from different historical states of the same location.`;
  },
  artifact: (nom, epoque) => {
    const version = epoque || "[year / version]";
    return `Subject: ${nom} ${version}\n\nThe object must remain strictly and unmistakably identifiable as ${nom} ${version} in every image.\nPreserve its exact shape, proportions, structure, materials, surface treatment, distinctive details, and all defining visual cues.\nDo not redesign, modernize, stylize, simplify, or merge it with any other object.\n\nOBJECT IDENTITY LOCK:\nThe object must remain strictly and unmistakably identifiable as ${nom} in every image.\nPreserve its exact silhouette, proportions, structural logic, materials, surface treatment, and all defining visual features.\nDo not redesign, stylize, modernize, simplify, or merge it with another object.\n\nVERSION / TIME PERIOD LOCK:\nRepresent the object strictly as the ${version}.\nPreserve only the design features specific to that exact version.\nDo not mix traits from other periods, generations, or reinterpretations.\n\nMANDATORY VISUAL FEATURES:\n- [feature 1]\n- [feature 2]\n- [feature 3]\n- [feature 4]\n- [feature 5]\n\nNO OBJECT DRIFT:\nDo not generate a generic lookalike, a related model, a modernized version, or a hybrid object.\nThe object must remain visually consistent across the whole series.\nOnly the environment, lighting, camera angle, scale, context, and scene activity may vary.`;
  },
  weapon: (nom, epoque) => {
    const version = epoque || "[year / version]";
    return `Subject: ${nom} ${version}\n\nThe object must remain strictly and unmistakably identifiable as ${nom} ${version} in every image.\nPreserve its exact shape, proportions, structure, materials, surface treatment, distinctive details, and all defining visual cues.\nDo not redesign, modernize, stylize, simplify, or merge it with any other object.\n\nOBJECT IDENTITY LOCK:\nThe object must remain strictly and unmistakably identifiable as ${nom} in every image.\nPreserve its exact silhouette, proportions, structural logic, materials, surface treatment, and all defining visual features.\nDo not redesign, stylize, modernize, simplify, or merge it with another object.\n\nVERSION / TIME PERIOD LOCK:\nRepresent the object strictly as the ${version}.\nPreserve only the design features specific to that exact version.\nDo not mix traits from other periods, generations, or reinterpretations.\n\nMANDATORY VISUAL FEATURES:\n- [feature 1]\n- [feature 2]\n- [feature 3]\n- [feature 4]\n- [feature 5]\n\nNO OBJECT DRIFT:\nDo not generate a generic lookalike, a related model, a modernized version, or a hybrid object.\nThe object must remain visually consistent across the whole series.\nOnly the environment, lighting, camera angle, scale, context, and scene activity may vary.`;
  },
  object: (nom, epoque) => {
    const version = epoque || "[year / version]";
    return `Subject: ${nom} ${version}\n\nThe object must remain strictly and unmistakably identifiable as ${nom} ${version} in every image.\nPreserve its exact shape, proportions, structure, materials, surface treatment, distinctive details, and all defining visual cues.\nDo not redesign, modernize, stylize, simplify, or merge it with any other object.\n\nOBJECT IDENTITY LOCK:\nThe object must remain strictly and unmistakably identifiable as ${nom} in every image.\nPreserve its exact silhouette, proportions, structural logic, materials, surface treatment, and all defining visual features.\nDo not redesign, stylize, modernize, simplify, or merge it with another object.\n\nVERSION / TIME PERIOD LOCK:\nRepresent the object strictly as the ${version}.\nPreserve only the design features specific to that exact version.\nDo not mix traits from other periods, generations, or reinterpretations.\n\nMANDATORY VISUAL FEATURES:\n- [feature 1]\n- [feature 2]\n- [feature 3]\n- [feature 4]\n- [feature 5]\n\nNO OBJECT DRIFT:\nDo not generate a generic lookalike, a related model, a modernized version, or a hybrid object.\nThe object must remain visually consistent across the whole series.\nOnly the environment, lighting, camera angle, scale, context, and scene activity may vary.`;
  },
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
  onSearchMore?: (excludeNames: string[]) => void;
  isAnalyzing?: boolean;
}

export default function ObjectRegistryPanel({ objects, onChange, sceneCount, onReanalyze, onSearchMore, isAnalyzing }: ObjectRegistryPanelProps) {
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
    const newPrompt = obj.identity_prompt.trim() ? obj.identity_prompt : IDENTITY_TEMPLATES[type](obj.nom || "[NOM]", obj.epoque || undefined);
    updateObject(id, { type, identity_prompt: newPrompt });
  }, [objects, updateObject]);

  const generatePrompt = useCallback((id: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    updateObject(id, { identity_prompt: IDENTITY_TEMPLATES[obj.type](obj.nom || "[NOM]", obj.epoque || undefined) });
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
          <span>Objets & Personnages Récurrents</span>
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
        <span>Objets & Personnages Récurrents</span>
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
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); removeObject(obj.id); }}
                  className="ml-1 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title="Supprimer"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
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
          {onSearchMore && objects.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSearchMore(objects.map(o => o.nom).filter(Boolean))}
              disabled={isAnalyzing}
              className="flex-1 min-h-[40px] text-xs"
            >
              <Search className="h-3.5 w-3.5" />
              {isAnalyzing ? "Recherche…" : "Chercher d'autres récurrences"}
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
