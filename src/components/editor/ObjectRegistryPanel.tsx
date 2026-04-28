import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Sparkles,
  FolderDown,
  Check,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

import type { Tables } from "@/integrations/supabase/types";
type Shot = Tables<"shots">;
type Scene = Tables<"scenes">;

interface ObjectRegistryPanelProps {
  objects: RecurringObject[];
  onChange: (objects: RecurringObject[]) => void;
  sceneCount: number;
  onReanalyze?: () => void;
  onSearchMore?: (excludeNames: string[]) => void;
  isAnalyzing?: boolean;
  shots?: Shot[];
  scenes?: Scene[];
  scriptLanguage?: string;
  projectId?: string;
}

export default function ObjectRegistryPanel({ objects, onChange, sceneCount, onReanalyze, onSearchMore, isAnalyzing, shots: allShots, scenes: allScenes, scriptLanguage = "fr", projectId }: ObjectRegistryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchingImages, setSearchingImages] = useState<Record<string, boolean>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importableObjects, setImportableObjects] = useState<{ projectTitle: string; projectId: string; objects: RecurringObject[] }[]>([]);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());

  // ── Auto-save library: every object that has at least one reference image
  // is upserted into the user-level recurring_object_library so it survives
  // re-segmentation and is reusable across projects. Debounced.
  const lastLibrarySyncRef = useRef<string>("");
  useEffect(() => {
    const candidates = objects.filter(
      (o) => o.nom?.trim() && Array.isArray(o.reference_images) && o.reference_images.length > 0,
    );
    if (candidates.length === 0) return;
    const signature = JSON.stringify(
      candidates.map((o) => ({
        n: o.nom.trim().toLowerCase(),
        t: o.type,
        e: o.epoque,
        d: o.description_visuelle,
        p: o.identity_prompt,
        r: o.reference_images,
      })),
    );
    if (signature === lastLibrarySyncRef.current) return;
    const handle = setTimeout(async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return;
        const rows = candidates.map((o) => ({
          user_id: uid,
          nom: o.nom.trim(),
          type: o.type,
          description_visuelle: o.description_visuelle || "",
          epoque: o.epoque || "",
          identity_prompt: o.identity_prompt || "",
          reference_images: o.reference_images || [],
          source_project_id: projectId || null,
        }));
        const { error } = await supabase
          .from("recurring_object_library")
          .upsert(rows, { onConflict: "user_id,nom,type" });
        if (error) {
          console.warn("Library auto-save failed:", error);
          return;
        }
        lastLibrarySyncRef.current = signature;
      } catch (e) {
        console.warn("Library auto-save error:", e);
      }
    }, 1500);
    return () => clearTimeout(handle);
  }, [objects, projectId]);

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
    onChange(objects.map((o) => {
      if (o.id !== id) return o;
      const updated = { ...o, ...patch };
      // Auto-regenerate identity_prompt when reference_images change
      if ('reference_images' in patch && !('identity_prompt' in patch)) {
        updated.identity_prompt = IDENTITY_TEMPLATES[updated.type](
          updated.nom || "[NOM]",
          updated.epoque || undefined,
          updated.reference_images
        );
      }
      return updated;
    }));
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

  const toggleShot = useCallback((id: string, shotId: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const current = obj.mentions_shots || [];
    const updated = current.includes(shotId)
      ? current.filter((s) => s !== shotId)
      : [...current, shotId];
    updateObject(id, { mentions_shots: updated });
  }, [objects, updateObject]);

  // Compute global shot index map (shot.id → global sequential number)
  const globalShotIndexMap = useMemo(() => {
    if (!allShots || !allScenes) return new Map<string, number>();
    const map = new Map<string, number>();
    const sortedScenes = [...allScenes].sort((a, b) => a.scene_order - b.scene_order);
    let idx = 1;
    for (const scene of sortedScenes) {
      const sceneShots = allShots
        .filter(s => s.scene_id === scene.id)
        .sort((a, b) => a.shot_order - b.shot_order);
      for (const shot of sceneShots) {
        map.set(shot.id, idx++);
      }
    }
    return map;
  }, [allShots, allScenes]);

  // Group shots by scene for display
  const shotsBySceneMap = useMemo(() => {
    if (!allShots || !allScenes) return new Map<string, { sceneTitle: string; sceneOrder: number; shots: Shot[] }>();
    const map = new Map<string, { sceneTitle: string; sceneOrder: number; shots: Shot[] }>();
    for (const scene of allScenes) {
      const sceneShots = allShots
        .filter(s => s.scene_id === scene.id)
        .sort((a, b) => a.shot_order - b.shot_order);
      if (sceneShots.length > 0) {
        map.set(scene.id, { sceneTitle: scene.title, sceneOrder: scene.scene_order, shots: sceneShots });
      }
    }
    return map;
  }, [allShots, allScenes]);

  const hasShots = allShots && allShots.length > 0;
  const [detectingShots, setDetectingShots] = useState(false);

  const autoDetectShots = useCallback(async () => {
    if (!allShots || allShots.length === 0 || objects.length === 0) {
      toast.info("Aucun shot ou objet à analyser.");
      return;
    }
    setDetectingShots(true);
    try {
      const objectsPayload = objects.map(o => ({
        id: o.id,
        nom: o.nom,
        type: o.type,
        description_visuelle: o.description_visuelle,
      }));
      const shotsPayload = allShots.map(s => ({
        id: s.id,
        scene_id: s.scene_id,
        source_sentence: s.source_sentence,
        source_sentence_fr: s.source_sentence_fr,
        description: s.description,
      }));

      const { data, error } = await supabase.functions.invoke("detect-object-shots", {
        body: { objects: objectsPayload, shots: shotsPayload },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const results = data?.results as Record<string, string[]> | undefined;
      if (!results) {
        toast.info("Aucun résultat de détection.");
        return;
      }

      // Merge AI results with existing manual selections (union)
      const updated = objects.map(obj => {
        const aiShotIds = results[obj.id] || [];
        const existing = obj.mentions_shots || [];
        const merged = Array.from(new Set([...existing, ...aiShotIds]));
        return { ...obj, mentions_shots: merged };
      });

      onChange(updated);
      const totalDetected = Object.values(results).reduce((sum, ids) => sum + ids.length, 0);
      toast.success(`Auto-détection terminée : ${totalDetected} association(s) trouvée(s)`);
    } catch (e: any) {
      console.error("Auto-detect error:", e);
      toast.error("Erreur auto-détection : " + (e.message || "Erreur inconnue"));
    } finally {
      setDetectingShots(false);
    }
  }, [objects, allShots, onChange]);

  const uploadToStorage = useCallback(async (objectName: string, imageUrl: string, refIndex: number): Promise<string | null> => {
    try {
      // Determine extension from URL
      const urlExt = imageUrl.split("/").pop()?.split("?")[0]?.split(".").pop()?.toLowerCase();
      const ext = (urlExt === "png" || urlExt === "webp") ? urlExt : "jpg";
      const safeName = objectName.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
      const filePath = `${safeName}_ref_${refIndex}.${ext}`;

      // Use server-side proxy to avoid CORS issues
      const { data, error } = await supabase.functions.invoke("proxy-download-image", {
        body: { url: imageUrl, filePath },
      });

      if (error) {
        console.error("Proxy download error:", error);
        return null;
      }

      return data?.publicUrl || null;
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

  // ── Import from other projects ────────────────────────────────────
  const loadImportableObjects = useCallback(async () => {
    setImportLoading(true);
    setImportableObjects([]);
    setSelectedImports(new Set());
    try {
      // Read from the user-level library (persistent across projects).
      const { data: libRows, error } = await supabase
        .from("recurring_object_library")
        .select("id, nom, type, description_visuelle, epoque, identity_prompt, reference_images, source_project_id, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const sourceIds = Array.from(
        new Set((libRows || []).map((r: any) => r.source_project_id).filter(Boolean)),
      );
      const titleMap = new Map<string, string>();
      if (sourceIds.length > 0) {
        const { data: projs } = await supabase
          .from("projects")
          .select("id, title")
          .in("id", sourceIds as string[]);
        for (const p of projs || []) titleMap.set(p.id, p.title);
      }

      const existingNames = new Set(objects.map((o) => (o.nom || "").toLowerCase().trim()));

      // Group entries by source project for display.
      const groups = new Map<string, { projectTitle: string; projectId: string; objects: RecurringObject[] }>();
      for (const row of libRows || []) {
        const refs = Array.isArray(row.reference_images) ? row.reference_images : [];
        if (refs.length === 0 || !row.nom) continue;
        const key = row.source_project_id || "__library__";
        if (!groups.has(key)) {
          groups.set(key, {
            projectId: key,
            projectTitle:
              key === "__library__"
                ? "Bibliothèque personnelle"
                : titleMap.get(key) || "Projet sans titre",
            objects: [],
          });
        }
        groups.get(key)!.objects.push({
          id: row.id,
          nom: row.nom,
          type: row.type as RecurringObject["type"],
          description_visuelle: row.description_visuelle || "",
          epoque: row.epoque || "",
          identity_prompt: row.identity_prompt || "",
          reference_images: refs as string[],
          mentions_scenes: [],
          mentions_shots: [],
          ...({ _alreadyExists: existingNames.has(String(row.nom).toLowerCase().trim()) } as any),
        } as any);
      }
      setImportableObjects(Array.from(groups.values()));
    } catch (e: any) {
      toast.error("Erreur chargement : " + (e.message || "Erreur inconnue"));
    } finally {
      setImportLoading(false);
    }
  }, [projectId, objects]);

  const openImportDialog = useCallback(() => {
    setImportDialogOpen(true);
    loadImportableObjects();
  }, [loadImportableObjects]);

  const toggleImportSelection = useCallback((objectId: string) => {
    setSelectedImports(prev => {
      const next = new Set(prev);
      if (next.has(objectId)) next.delete(objectId);
      else next.add(objectId);
      return next;
    });
  }, []);

  const confirmImport = useCallback(() => {
    const toImport: RecurringObject[] = [];
    for (const group of importableObjects) {
      for (const obj of group.objects) {
        if (selectedImports.has(obj.id)) {
          toImport.push({
            ...obj,
            id: generateId(), // new id for this project
            mentions_scenes: [],
            mentions_shots: [],
          });
        }
      }
    }
    if (toImport.length === 0) return;
    onChange([...objects, ...toImport]);
    toast.success(`${toImport.length} objet(s) importé(s)`);
    setImportDialogOpen(false);
  }, [importableObjects, selectedImports, objects, onChange]);

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
            <Button variant="outline" size="sm" onClick={openImportDialog} className="min-h-[44px]">
              <FolderDown className="h-4 w-4" /> Importer d'un autre projet
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

                  {/* Shots où l'objet apparaît */}
                  {hasShots && (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        Shots où l'objet apparaît
                        {(obj.mentions_shots?.length || 0) > 0 && (
                          <span className="ml-1 text-primary font-bold">({obj.mentions_shots!.length})</span>
                        )}
                      </label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {allShots!
                          .slice()
                          .sort((a, b) => (globalShotIndexMap.get(a.id) ?? 0) - (globalShotIndexMap.get(b.id) ?? 0))
                          .map((shot) => {
                            const isActive = (obj.mentions_shots || []).includes(shot.id);
                            const globalNum = globalShotIndexMap.get(shot.id) ?? shot.shot_order;
                            return (
                              <button
                                key={shot.id}
                                onClick={() => toggleShot(obj.id, shot.id)}
                                title={`Shot ${globalNum} — ${(
                                  scriptLanguage === "fr"
                                    ? shot.source_sentence
                                    : shot.source_sentence_fr || shot.source_sentence
                                )?.slice(0, 120) || shot.description?.slice(0, 120) || ""}`}
                                className={`text-[10px] w-7 h-7 rounded border transition-colors ${
                                  isActive
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-muted-foreground border-border hover:bg-secondary"
                                }`}
                              >
                                {globalNum}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}


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
          {hasShots && objects.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={autoDetectShots}
              disabled={detectingShots}
              className="flex-1 min-h-[40px] text-xs"
            >
              {detectingShots ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {detectingShots ? "Détection IA…" : "Auto-détecter les shots"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={addObject} className="flex-1 min-h-[40px] text-xs">
            <Plus className="h-3.5 w-3.5" /> Ajouter un objet
          </Button>
          <Button variant="outline" size="sm" onClick={openImportDialog} className="flex-1 min-h-[40px] text-xs">
            <FolderDown className="h-3.5 w-3.5" /> Importer
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

      {/* Import dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FolderDown className="h-4 w-4" /> Importer des objets récurrents
            </DialogTitle>
          </DialogHeader>
          {importLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des projets…
            </div>
          ) : importableObjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucun objet avec images de référence trouvé dans vos autres projets.
            </p>
          ) : (
            <div className="space-y-4">
              {importableObjects.map((group) => (
                <div key={group.projectId}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {group.projectTitle}
                  </h4>
                  <div className="space-y-1.5">
                    {group.objects.map((obj) => {
                      const alreadyExists = (obj as any)._alreadyExists;
                      const isSelected = selectedImports.has(obj.id);
                      const meta = TYPE_META[obj.type] || TYPE_META.object;
                      return (
                        <label
                          key={obj.id}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                            alreadyExists
                              ? "opacity-50 border-border bg-muted/30 cursor-not-allowed"
                              : isSelected
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-secondary/50"
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            disabled={alreadyExists}
                            onCheckedChange={() => !alreadyExists && toggleImportSelection(obj.id)}
                          />
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${meta.color}`}>
                              {meta.icon} {meta.label}
                            </span>
                            <span className="text-sm font-medium truncate">{obj.nom}</span>
                            {obj.reference_images && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                📷 {obj.reference_images.length}
                              </span>
                            )}
                            {alreadyExists && (
                              <span className="text-[10px] text-muted-foreground italic shrink-0">déjà présent</span>
                            )}
                          </div>
                          {obj.reference_images && obj.reference_images.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              {obj.reference_images.slice(0, 2).map((url, i) => (
                                <img key={i} src={url} alt="" className="w-8 h-8 rounded border border-border object-cover" loading="lazy" />
                              ))}
                            </div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setImportDialogOpen(false)}>
                  Annuler
                </Button>
                <Button size="sm" onClick={confirmImport} disabled={selectedImports.size === 0}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Importer {selectedImports.size > 0 ? `(${selectedImports.size})` : ""}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </details>
  );
}
