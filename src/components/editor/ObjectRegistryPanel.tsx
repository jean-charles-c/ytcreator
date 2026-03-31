import { useState, useCallback, useRef, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Package,
  Plus,
  Trash2,
  ChevronDown,
  Car,
  Building2,
  Landmark,
  Box,
  RefreshCw,
  User,
  MapPin,
  X,
  Search,
  ImageIcon,
  Upload,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────

export interface RecurringObject {
  id: string;
  nom: string;
  type: "vehicle" | "building" | "artifact" | "weapon" | "object" | "character" | "location";
  description_visuelle: string;
  epoque: string;
  mentions_scenes: number[];
  mentions_shots?: string[];
  identity_prompt: string;
  reference_images?: string[];
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

const objectIdentityBlock = (nom: string, version: string) =>
  `OBJECT IDENTITY LOCK:\n\nThe object must remain strictly and unmistakably identifiable as ${nom} ${version} in every image.\n\nPreserve its exact shape, proportions, structure, materials, surface treatment, distinctive details, and all defining visual cues.\n\nDo not redesign, modernize, stylize, simplify, or merge it with any other object.\n\n`;

const characterIdentityBlock = (nom: string, period: string) =>
  `CHARACTER IDENTITY LOCK:\n\nThe character must remain strictly and unmistakably identifiable as ${nom} ${period} in every image.\n\nPreserve their exact facial structure, age appearance, hairstyle, body proportions, posture, clothing logic, distinctive traits, and all defining visual cues specific to that period.\n\nDo not redesign, beautify, modernize, stylize, de-age, age up, or merge them with any other person or character.\n\n`;

const locationIdentityBlock = (nom: string, period: string) =>
  `LOCATION IDENTITY LOCK:\n\nThe location must remain strictly and unmistakably identifiable as ${nom} ${period} in every image.\n\nPreserve its exact overall layout, proportions, architecture, structural silhouette, materials, surrounding context, landmark features, and all defining visual cues specific to that period.\n\nDo not redesign, relocate, modernize, stylize, fictionalize, or merge it with any other place.\n\n`;

const vehicleIdentityBlock = (nom: string, version: string) =>
  `VEHICLE IDENTITY LOCK:\n\nThe vehicle must remain strictly and unmistakably identifiable as a ${nom} ${version} in every image.\n\nPreserve its exact signature silhouette, proportions, front-end design, roofline, side profile, rear shape, wheel stance, and all defining design cues.\n\nDo not redesign, modernize, stylize, or merge it with any other car.\n\n`;

export const buildRefFileName = (nom: string, index: number, url?: string): string => {
  const safeName = (nom || "ref").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  const ext = url ? (url.split("/").pop()?.split("?")[0]?.split(".").pop() || "jpg") : "jpg";
  return `${safeName}_ref_${index}.${ext}`;
};

const buildRefImageList = (nom: string, refImages?: string[]) => {
  if (!refImages || refImages.length === 0) return `REFERENCE IMAGES: None provided yet.`;
  const items = refImages.map((url, i) => {
    return `- ${buildRefFileName(nom, i + 1, url)}`;
  }).join("\n");
  return `REFERENCE IMAGES PROVIDED:\n${items}\nUse these reference images as fidelity anchors to preserve exact visual identity.`;
};

export const IDENTITY_TEMPLATES: Record<RecurringObject["type"], (nom: string, epoque?: string, refImages?: string[]) => string> = {
  character: (nom, epoque, refImages) => {
    const period = epoque || "[exact period]";
    return `${characterIdentityBlock(nom, period)}Subject: ${nom} during ${period}\n\nTIME PERIOD LOCK:\nThe character must be shown strictly as they appeared during ${period}.\nPreserve the age appearance, hairstyle, facial traits, clothing logic, accessories, and visual markers specific to that period.\nDo not mix features from earlier or later periods.\n\n${buildRefImageList(nom, refImages)}\n\nNO TEMPORAL DRIFT:\nDo not combine visual traits from different eras of the same character/person.`;
  },
  location: (nom, epoque, refImages) => {
    const period = epoque || "[exact period / state]";
    return `${locationIdentityBlock(nom, period)}Subject: ${nom} during ${period}\n\nTIME PERIOD / HISTORICAL STATE LOCK:\nThe location must be shown strictly as it appeared during ${period}.\nPreserve the structural condition, materials, architectural features, surrounding layout, and environmental context specific to that period.\nDo not mix features from earlier or later versions of the same place.\n\n${buildRefImageList(nom, refImages)}\n\nNO TEMPORAL DRIFT:\nDo not combine visual traits from different historical states of the same location.`;
  },
  vehicle: (nom, epoque, refImages) => {
    const version = epoque || "[year / version]";
    return `${vehicleIdentityBlock(nom, version)}Subject: ${nom} ${version}\n\nVERSION / TIME PERIOD LOCK:\nRepresent the vehicle strictly as the ${version}.\nPreserve only the design features specific to that exact version.\nDo not mix traits from other periods, generations, or reinterpretations.\n\n${buildRefImageList(nom, refImages)}\n\nNO OBJECT DRIFT:\nDo not generate a generic lookalike, a related model, a modernized version, or a hybrid object.\nThe vehicle must remain visually consistent across the whole series.\nOnly the environment, lighting, camera angle, scale, context, and scene activity may vary.`;
  },
  building: (nom, epoque, refImages) => {
    const period = epoque || "[exact period / state]";
    return `${locationIdentityBlock(nom, period)}Subject: ${nom} during ${period}\n\nTIME PERIOD / HISTORICAL STATE LOCK:\nThe location must be shown strictly as it appeared during ${period}.\nPreserve the structural condition, materials, architectural features, surrounding layout, and environmental context specific to that period.\nDo not mix features from earlier or later versions of the same place.\n\n${buildRefImageList(nom, refImages)}\n\nNO TEMPORAL DRIFT:\nDo not combine visual traits from different historical states of the same location.`;
  },
  artifact: (nom, epoque, refImages) => {
    const version = epoque || "[year / version]";
    return `${objectIdentityBlock(nom, version)}Subject: ${nom} ${version}\n\nVERSION / TIME PERIOD LOCK:\nRepresent the object strictly as the ${version}.\nPreserve only the design features specific to that exact version.\nDo not mix traits from other periods, generations, or reinterpretations.\n\n${buildRefImageList(nom, refImages)}\n\nNO OBJECT DRIFT:\nDo not generate a generic lookalike, a related model, a modernized version, or a hybrid object.\nThe object must remain visually consistent across the whole series.\nOnly the environment, lighting, camera angle, scale, context, and scene activity may vary.`;
  },
  weapon: (nom, epoque, refImages) => {
    const version = epoque || "[year / version]";
    return `${objectIdentityBlock(nom, version)}Subject: ${nom} ${version}\n\nVERSION / TIME PERIOD LOCK:\nRepresent the object strictly as the ${version}.\nPreserve only the design features specific to that exact version.\nDo not mix traits from other periods, generations, or reinterpretations.\n\n${buildRefImageList(nom, refImages)}\n\nNO OBJECT DRIFT:\nDo not generate a generic lookalike, a related model, a modernized version, or a hybrid object.\nThe object must remain visually consistent across the whole series.\nOnly the environment, lighting, camera angle, scale, context, and scene activity may vary.`;
  },
  object: (nom, epoque, refImages) => {
    const version = epoque || "[year / version]";
    return `${objectIdentityBlock(nom, version)}Subject: ${nom} ${version}\n\nVERSION / TIME PERIOD LOCK:\nRepresent the object strictly as the ${version}.\nPreserve only the design features specific to that exact version.\nDo not mix traits from other periods, generations, or reinterpretations.\n\n${buildRefImageList(nom, refImages)}\n\nNO OBJECT DRIFT:\nDo not generate a generic lookalike, a related model, a modernized version, or a hybrid object.\nThe object must remain visually consistent across the whole series.\nOnly the environment, lighting, camera angle, scale, context, and scene activity may vary.`;
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
  const [searchingImages, setSearchingImages] = useState<Record<string, boolean>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
    const newPrompt = obj.identity_prompt.trim() ? obj.identity_prompt : IDENTITY_TEMPLATES[type](obj.nom || "[NOM]", obj.epoque || undefined, obj.reference_images);
    updateObject(id, { type, identity_prompt: newPrompt });
  }, [objects, updateObject]);

  const generatePrompt = useCallback((id: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    updateObject(id, { identity_prompt: IDENTITY_TEMPLATES[obj.type](obj.nom || "[NOM]", obj.epoque || undefined, obj.reference_images) });
  }, [objects, updateObject]);

  const toggleScene = useCallback((id: string, sceneOrder: number) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const scenes = obj.mentions_scenes.includes(sceneOrder)
      ? obj.mentions_scenes.filter((s) => s !== sceneOrder)
      : [...obj.mentions_scenes, sceneOrder].sort((a, b) => a - b);
    updateObject(id, { mentions_scenes: scenes });
  }, [objects, updateObject]);

  const uploadToStorage = useCallback(async (objectName: string, imageUrl: string, refIndex: number): Promise<string | null> => {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const safeName = objectName.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
      const filePath = `${safeName}_ref_${refIndex}.${ext}`;
      const { error } = await supabase.storage.from("reference-images").upload(filePath, blob, {
        contentType: blob.type,
        upsert: true,
      });
      if (error) {
        console.error("Upload error:", error);
        return null;
      }
      const { data: publicUrlData } = supabase.storage.from("reference-images").getPublicUrl(filePath);
      return `${publicUrlData.publicUrl}?t=${Date.now()}`;
    } catch (e) {
      console.error("Upload failed:", e);
      return null;
    }
  }, []);

  const searchReferenceImages = useCallback(async (id: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj || !obj.nom) {
      toast.error("Renseignez le nom de l'objet avant de chercher des images.");
      return;
    }
    setSearchingImages(prev => ({ ...prev, [id]: true }));
    try {
      const searchQuery = `${obj.nom} ${obj.epoque || ""}`.trim();
      const res = await supabase.functions.invoke("search-reference-images", {
        body: { query: searchQuery, limit: 3 },
      });
      if (res.error) throw res.error;
      const data = res.data as { images: { url: string; thumb: string }[] };
      if (data.images.length === 0) {
        toast.info("Aucune image trouvée pour cette recherche.");
        return;
      }
      const existing = obj.reference_images || [];
      const startIdx = existing.length + 1;
      const uploadedUrls: string[] = [];
      for (let i = 0; i < data.images.length; i++) {
        const sourceUrl = data.images[i].url || data.images[i].thumb;
        const storageUrl = await uploadToStorage(obj.nom, sourceUrl, startIdx + i);
        if (storageUrl) uploadedUrls.push(storageUrl);
      }
      if (uploadedUrls.length === 0) {
        toast.info("Impossible d'uploader les images trouvées.");
        return;
      }
      updateObject(id, { reference_images: [...existing, ...uploadedUrls] });
      toast.success(`${uploadedUrls.length} image(s) de référence uploadée(s)`);
    } catch (e: any) {
      toast.error("Erreur recherche images : " + (e.message || "Erreur inconnue"));
    } finally {
      setSearchingImages(prev => ({ ...prev, [id]: false }));
    }
  }, [objects, updateObject, uploadToStorage]);

  const removeReferenceImage = useCallback((id: string, imgIndex: number) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const imgs = [...(obj.reference_images || [])];
    imgs.splice(imgIndex, 1);
    updateObject(id, { reference_images: imgs });
  }, [objects, updateObject]);

  const addReferenceImageUrl = useCallback(async (id: string, url: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const existing = obj.reference_images || [];
    const storageUrl = await uploadToStorage(obj.nom || "unknown", url, existing.length + 1);
    if (storageUrl) {
      updateObject(id, { reference_images: [...existing, storageUrl] });
      toast.success("Image de référence uploadée sur le serveur");
    } else {
      toast.error("Impossible d'uploader l'image sur le serveur. Vérifiez l'URL et réessayez.");
    }
  }, [objects, updateObject]);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileUpload = useCallback(async (id: string, file: File) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const accepted = ["image/jpeg", "image/png", "image/webp"];
    if (!accepted.includes(file.type)) {
      toast.error("Format non supporté. Utilisez JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 10 Mo).");
      return;
    }
    const existing = obj.reference_images || [];
    const refIndex = existing.length + 1;
    const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
    const safeName = (obj.nom || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
    const filePath = `${safeName}_ref_${refIndex}.${ext}`;
    try {
      const { error } = await supabase.storage.from("reference-images").upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      });
      if (error) throw error;
      const { data: publicUrlData } = supabase.storage.from("reference-images").getPublicUrl(filePath);
      const storageUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      updateObject(id, { reference_images: [...existing, storageUrl] });
      toast.success("Image de référence uploadée");
    } catch (e: any) {
      toast.error("Erreur upload : " + (e.message || "Erreur inconnue"));
    }
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

                  {/* Images de référence */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> Images de référence
                        {(obj.reference_images?.length || 0) > 0 && (
                          <span className="text-primary font-bold">({obj.reference_images!.length})</span>
                        )}
                      </label>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => searchReferenceImages(obj.id)}
                          disabled={searchingImages[obj.id] || !obj.nom}
                          className="h-7 text-xs px-2"
                        >
                          {searchingImages[obj.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                          Chercher sur le web
                        </Button>
                      </div>
                    </div>
                    {(obj.reference_images?.length || 0) > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {obj.reference_images!.map((imgUrl, imgIdx) => {
                          const cleanUrl = imgUrl.split("?")[0];
                          return (
                            <div key={imgIdx} className="relative group/img flex flex-col items-center">
                              <div
                                className="w-24 h-24 rounded border border-border overflow-hidden bg-secondary cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                onClick={() => setLightboxUrl(imgUrl)}
                                title="Cliquer pour agrandir"
                              >
                                <img src={imgUrl} alt={`Ref ${imgIdx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeReferenceImage(obj.id, imgIdx); }}
                                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover/img:opacity-100 transition-opacity"
                                  title="Supprimer cette image"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="flex flex-col items-center mt-0.5 max-w-[96px]">
                                <span className="text-[9px] font-medium text-foreground truncate w-full text-center" title={buildRefFileName(obj.nom, imgIdx + 1, imgUrl)}>
                                  {buildRefFileName(obj.nom, imgIdx + 1, imgUrl)}
                                </span>
                                <a
                                  href={cleanUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[7px] text-muted-foreground hover:text-primary truncate w-full text-center underline"
                                  title={cleanUrl}
                                >
                                  {cleanUrl.includes("reference-images") ? "📦 Serveur OVH" : "🌐 URL externe"}
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-1 flex gap-1.5">
                      <Input
                        placeholder="Coller une URL d'image et appuyer Entrée"
                        className="h-7 text-xs flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const input = e.currentTarget;
                            const url = input.value.trim();
                            if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
                              addReferenceImageUrl(obj.id, url);
                              input.value = "";
                            }
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 shrink-0"
                        onClick={() => fileInputRefs.current[obj.id]?.click()}
                      >
                        <Upload className="h-3 w-3" />
                        Fichier
                      </Button>
                      <input
                        ref={(el) => { fileInputRefs.current[obj.id] = el; }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(obj.id, file);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>

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
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Prompt d'identité visuelle (injecté dans chaque shot concerné)</label>
                      <Button variant="outline" size="sm" onClick={() => generatePrompt(obj.id)} className="h-7 text-xs px-3 border-primary/30 text-primary hover:bg-primary/10">
                        <RefreshCw className="h-3 w-3 mr-1" /> Régénérer le prompt
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

      {/* Lightbox dialog */}
      <Dialog open={!!lightboxUrl} onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 flex items-center justify-center bg-black/95 border-none">
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Image de référence agrandie"
              className="max-w-full max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </details>
  );
}
