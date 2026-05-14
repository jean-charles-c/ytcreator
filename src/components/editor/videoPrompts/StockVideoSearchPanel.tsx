/**
 * StockVideoSearchPanel — Search free royalty-free stock videos via Pexels & Pixabay APIs.
 *
 * MVP v1: search + filters + preview-on-hover + download.
 * Calls the `search-stock-videos` edge function which unifies both providers.
 */

import { useState, useCallback, useRef, useMemo } from "react";
import {
  Search,
  Loader2,
  Download,
  ExternalLink,
  PlayCircle,
  Sparkles,
  Filter as FilterIcon,
  RotateCcw,
  Clapperboard,
  AlertCircle,
  Link as LinkIcon,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

// ── Types (mirror the edge function output) ────────────────────────

type Source = "pexels" | "pixabay";
type Orientation = "any" | "landscape" | "portrait" | "square";

interface VideoQuality {
  label: string;
  url: string;
  width: number;
  height: number;
  fileSizeBytes?: number;
  fps?: number;
}

interface StockVideo {
  id: string;
  providerId: string;
  source: Source;
  sourceUrl: string;
  author: string;
  authorUrl: string | null;
  thumbnail: string;
  previewUrl: string;
  title: string;
  tags: string[];
  duration: number;
  width: number;
  height: number;
  qualities: VideoQuality[];
}

interface SearchResponse {
  query: string;
  total: number;
  pexelsTotal?: number;
  pixabayTotal?: number;
  page: number;
  perPage: number;
  videos: StockVideo[];
  warnings: string[];
}

// ── Constants ──────────────────────────────────────────────────────

const PIXABAY_CATEGORIES = [
  { value: "all", label: "Toutes catégories" },
  { value: "backgrounds", label: "Arrière-plans" },
  { value: "nature", label: "Nature" },
  { value: "places", label: "Lieux" },
  { value: "travel", label: "Voyage" },
  { value: "people", label: "Personnes" },
  { value: "business", label: "Business" },
  { value: "computer", label: "Tech / Informatique" },
  { value: "science", label: "Science" },
  { value: "education", label: "Éducation" },
  { value: "health", label: "Santé" },
  { value: "feelings", label: "Émotions" },
  { value: "fashion", label: "Mode" },
  { value: "food", label: "Cuisine" },
  { value: "animals", label: "Animaux" },
  { value: "sports", label: "Sports" },
  { value: "transportation", label: "Transport" },
  { value: "buildings", label: "Architecture" },
  { value: "industry", label: "Industrie" },
  { value: "music", label: "Musique" },
  { value: "religion", label: "Religion" },
];

const PER_PAGE = 24;

// ── Helpers ────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m${String(r).padStart(2, "0")}`;
}

function bestQualityLabel(v: StockVideo): string {
  return v.qualities[0]?.label ?? "—";
}

// ── Component ──────────────────────────────────────────────────────

interface StockVideoSearchPanelProps {
  projectId: string;
  scenes: Scene[];
  shots: Shot[];
  /** Called after a stock video is successfully attached to a shot — parent should refresh gallery */
  onStockVideoAttached?: () => void;
}

export default function StockVideoSearchPanel({
  projectId,
  scenes,
  shots,
  onStockVideoAttached,
}: StockVideoSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"pexels" | "pixabay" | "both">("both");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [category, setCategory] = useState<string>("all");
  const [videoType, setVideoType] = useState<"all" | "film" | "animation">("all");
  const [editorsChoice, setEditorsChoice] = useState(false);
  const [minDuration, setMinDuration] = useState<number>(0);
  const [maxDuration, setMaxDuration] = useState<number>(0); // 0 = no max

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<StockVideo[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [pexelsTotal, setPexelsTotal] = useState<number | undefined>();
  const [pixabayTotal, setPixabayTotal] = useState<number | undefined>();
  const [importingId, setImportingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerVideo, setPickerVideo] = useState<StockVideo | null>(null);
  const [pickerQuality, setPickerQuality] = useState<VideoQuality | null>(null);
  const [pickerSelectedShot, setPickerSelectedShot] = useState<string | null>(null);

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Build a sorted, indexed view of the project's shots for the picker
  const shotPickerItems = useMemo(() => {
    const sceneMap = new Map(scenes.map((s) => [s.id, s]));
    const sortedScenes = [...scenes].sort((a, b) => a.scene_order - b.scene_order);
    const items: {
      shotId: string;
      sceneId: string;
      sceneTitle: string;
      sceneOrder: number;
      shotOrder: number;
      globalIndex: number;
      imageUrl: string | null;
      sentence: string;
    }[] = [];
    let gIdx = 1;
    for (const scene of sortedScenes) {
      const sceneShots = shots
        .filter((sh) => sh.scene_id === scene.id)
        .sort((a, b) => a.shot_order - b.shot_order);
      for (const sh of sceneShots) {
        items.push({
          shotId: sh.id,
          sceneId: sh.scene_id,
          sceneTitle: scene.title,
          sceneOrder: scene.scene_order,
          shotOrder: sh.shot_order,
          globalIndex: gIdx,
          imageUrl: sh.image_url,
          sentence: sh.source_sentence_fr ?? sh.source_sentence ?? "",
        });
        gIdx++;
      }
    }
    // void unused var warning if sceneMap not consumed
    void sceneMap;
    return items;
  }, [scenes, shots]);

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast({ title: "Saisis un mot-clé", variant: "destructive" });
      return;
    }
    setLoading(true);
    setWarnings([]);
    try {
      const { data, error } = await supabase.functions.invoke("search-stock-videos", {
        body: {
          query: trimmed,
          source,
          orientation,
          category: category === "all" ? undefined : category,
          videoType,
          editorsChoice,
          minDuration: minDuration > 0 ? minDuration : undefined,
          maxDuration: maxDuration > 0 ? maxDuration : undefined,
          locale: "fr",
          perPage: PER_PAGE,
        },
      });

      if (error) throw error;
      const resp = data as SearchResponse;
      setResults(resp.videos ?? []);
      setPexelsTotal(resp.pexelsTotal);
      setPixabayTotal(resp.pixabayTotal);
      setWarnings(resp.warnings ?? []);
      setHasSearched(true);
    } catch (err) {
      console.error("Search error:", err);
      toast({
        title: "Erreur de recherche",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [query, source, orientation, category, videoType, editorsChoice, minDuration, maxDuration]);

  const resetFilters = useCallback(() => {
    setSource("both");
    setOrientation("landscape");
    setCategory("all");
    setVideoType("all");
    setEditorsChoice(false);
    setMinDuration(0);
    setMaxDuration(0);
  }, []);

  const handleMouseEnter = (id: string) => {
    const el = videoRefs.current.get(id);
    if (el) {
      el.currentTime = 0;
      el.play().catch(() => {});
    }
  };

  const handleMouseLeave = (id: string) => {
    const el = videoRefs.current.get(id);
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  };

  const handleDownload = (video: StockVideo, quality: VideoQuality) => {
    // Open in a new tab — the browser will trigger the download (or play).
    // We can't use the `download` attribute reliably for cross-origin URLs.
    window.open(quality.url, "_blank", "noopener,noreferrer");
  };

  const openShotPicker = (video: StockVideo, quality: VideoQuality) => {
    if (shotPickerItems.length === 0) {
      toast({
        title: "Aucun shot disponible",
        description: "Génère d'abord la liste des shots pour pouvoir y associer une vidéo.",
        variant: "destructive",
      });
      return;
    }
    setPickerVideo(video);
    setPickerQuality(quality);
    setPickerSelectedShot(null);
    setPickerOpen(true);
  };

  const confirmAttachToShot = async () => {
    if (!pickerVideo || !pickerQuality || !pickerSelectedShot) return;
    setImportingId(pickerVideo.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const shotItem = shotPickerItems.find((it) => it.shotId === pickerSelectedShot);
      if (!shotItem) throw new Error("Shot introuvable");

      const providerKey = pickerVideo.source === "pexels" ? "stock_pexels" : "stock_pixabay";
      const aspectRatio = pickerVideo.width && pickerVideo.height
        ? pickerVideo.width >= pickerVideo.height
          ? "16:9"
          : "9:16"
        : "16:9";

      const insertPayload = {
        id: crypto.randomUUID(),
        user_id: user.id,
        project_id: projectId,
        source_type: "gallery" as const,
        source_shot_id: pickerSelectedShot,
        source_upload_id: null,
        source_image_url: shotItem.imageUrl ?? pickerVideo.thumbnail,
        provider: providerKey,
        prompt_used: `Stock import — ${pickerVideo.source} #${pickerVideo.providerId}`,
        negative_prompt: "",
        duration_sec: Math.max(1, Math.round(pickerVideo.duration || 0)),
        aspect_ratio: aspectRatio,
        status: "completed" as const,
        result_video_url: pickerQuality.url,
        result_thumbnail_url: pickerVideo.thumbnail,
        estimated_cost_usd: 0,
        selected_for_export: true,
        provider_metadata: {
          stock: {
            source: pickerVideo.source,
            providerVideoId: pickerVideo.providerId,
            sourceUrl: pickerVideo.sourceUrl,
            author: pickerVideo.author,
            authorUrl: pickerVideo.authorUrl,
            quality: pickerQuality.label,
            width: pickerQuality.width,
            height: pickerQuality.height,
            tags: pickerVideo.tags,
          },
        },
      };

      const { error } = await supabase
        .from("video_generations")
        .insert(insertPayload as never);

      if (error) throw error;

      toast({
        title: "Vidéo associée",
        description: `Shot ${String(shotItem.globalIndex).padStart(3, "0")} — ${pickerVideo.source === "pexels" ? "Pexels" : "Pixabay"} (${pickerQuality.label})`,
      });

      setPickerOpen(false);
      setPickerVideo(null);
      setPickerQuality(null);
      setPickerSelectedShot(null);
      onStockVideoAttached?.();
    } catch (err) {
      console.error("Stock import error:", err);
      toast({
        title: "Erreur d'import",
        description: err instanceof Error ? err.message : "Impossible d'associer la vidéo au shot",
        variant: "destructive",
      });
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search bar + filters trigger */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Ex: paysage montagne, drone city, café latte…"
            className="h-9 pl-8 text-sm"
            disabled={loading}
          />
        </div>

        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <FilterIcon className="h-3.5 w-3.5" />
                Filtres
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4 space-y-3" align="end">
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Source
                </label>
                <Select value={source} onValueChange={(v) => setSource(v as "pexels" | "pixabay" | "both")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Pexels + Pixabay</SelectItem>
                    <SelectItem value="pexels">Pexels uniquement</SelectItem>
                    <SelectItem value="pixabay">Pixabay uniquement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Orientation
                </label>
                <Select value={orientation} onValueChange={(v) => setOrientation(v as Orientation)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Toutes</SelectItem>
                    <SelectItem value="landscape">Paysage (16:9)</SelectItem>
                    <SelectItem value="portrait">Portrait (9:16)</SelectItem>
                    <SelectItem value="square">Carré (1:1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Catégorie <span className="text-muted-foreground/60 normal-case">(Pixabay)</span>
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {PIXABAY_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Type <span className="text-muted-foreground/60 normal-case">(Pixabay)</span>
                </label>
                <Select value={videoType} onValueChange={(v) => setVideoType(v as "all" | "film" | "animation")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="film">Vidéo réelle</SelectItem>
                    <SelectItem value="animation">Animation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Durée min (s)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={300}
                    value={minDuration || ""}
                    onChange={(e) => setMinDuration(Number(e.target.value) || 0)}
                    className="h-8 text-xs"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Durée max (s)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={300}
                    value={maxDuration || ""}
                    onChange={(e) => setMaxDuration(Number(e.target.value) || 0)}
                    className="h-8 text-xs"
                    placeholder="—"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <label className="text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  Editor's Choice
                  <span className="text-[10px] text-muted-foreground/60">(Pixabay)</span>
                </label>
                <Switch checked={editorsChoice} onCheckedChange={setEditorsChoice} />
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="w-full h-8 text-xs gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Réinitialiser
              </Button>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={runSearch}
            disabled={loading || !query.trim()}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Rechercher
          </Button>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Result summary */}
      {hasSearched && !loading && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{results.length} résultat{results.length > 1 ? "s" : ""}</span>
          {pexelsTotal !== undefined && (
            <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-300 border-blue-500/30">
              Pexels: {pexelsTotal.toLocaleString()}
            </Badge>
          )}
          {pixabayTotal !== undefined && (
            <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-300 border-green-500/30">
              Pixabay: {pixabayTotal.toLocaleString()}
            </Badge>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-video bg-secondary/40 rounded-md animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && hasSearched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center text-muted-foreground">
          <Clapperboard className="h-8 w-8 opacity-40" />
          <p className="text-sm">Aucun résultat pour «&nbsp;{query}&nbsp;»</p>
          <p className="text-[11px] opacity-70">Essaie d'autres mots-clés ou élargis les filtres.</p>
        </div>
      )}

      {/* Initial state */}
      {!loading && !hasSearched && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center text-muted-foreground">
          <Clapperboard className="h-8 w-8 text-primary/60" />
          <p className="text-sm">Recherche dans la banque de vidéos libres de droit</p>
          <p className="text-[11px] opacity-70 max-w-md">
            Pexels + Pixabay — gratuit, utilisation commerciale, sans attribution obligatoire
            (mais merci de créditer les auteurs ❤️).
          </p>
        </div>
      )}

      {/* Results grid */}
      {!loading && results.length > 0 && (
        <TooltipProvider delayDuration={300}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
            {results.map((v) => (
              <StockVideoCard
                key={v.id}
                video={v}
                videoRef={(el) => {
                  if (el) videoRefs.current.set(v.id, el);
                  else videoRefs.current.delete(v.id);
                }}
                onMouseEnter={() => handleMouseEnter(v.id)}
                onMouseLeave={() => handleMouseLeave(v.id)}
                onDownload={handleDownload}
                onImport={openShotPicker}
                importing={importingId === v.id}
              />
            ))}
          </div>
        </TooltipProvider>
      )}

      {/* Shot picker dialog */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open && !importingId) {
            setPickerOpen(false);
            setPickerVideo(null);
            setPickerQuality(null);
            setPickerSelectedShot(null);
          } else {
            setPickerOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-primary" />
              Associer la vidéo à un shot
            </DialogTitle>
            <DialogDescription className="text-xs">
              {pickerVideo && (
                <>
                  {pickerVideo.source === "pexels" ? "Pexels" : "Pixabay"} ·{" "}
                  © {pickerVideo.author} · {fmtDuration(pickerVideo.duration)} ·{" "}
                  {pickerQuality?.label} {pickerQuality?.width}×{pickerQuality?.height}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Video preview */}
          {pickerVideo && (
            <div className="relative rounded-md overflow-hidden border border-border bg-black/40 aspect-video">
              <video
                src={pickerVideo.previewUrl}
                poster={pickerVideo.thumbnail}
                autoPlay
                muted
                playsInline
                loop
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Shot list */}
          <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1 -mr-1">
            {shotPickerItems.map((it) => {
              const isSelected = pickerSelectedShot === it.shotId;
              return (
                <button
                  key={it.shotId}
                  type="button"
                  onClick={() => setPickerSelectedShot(it.shotId)}
                  className={`w-full text-left rounded-md border p-2 flex gap-2 items-center transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-card hover:bg-secondary/40"
                  }`}
                >
                  <div className="w-14 h-10 shrink-0 rounded overflow-hidden bg-secondary">
                    {it.imageUrl ? (
                      <img
                        src={it.imageUrl}
                        alt={`Shot ${it.globalIndex}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px]">
                        —
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1 rounded bg-secondary text-foreground">
                        Sc.{it.sceneOrder}
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        Shot {String(it.globalIndex).padStart(3, "0")}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {it.sentence || "(sans phrase)"}
                    </p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setPickerOpen(false)}
              disabled={!!importingId}
            >
              Annuler
            </Button>
            <Button
              onClick={confirmAttachToShot}
              disabled={!pickerSelectedShot || !!importingId}
              className="gap-1.5"
            >
              {importingId ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LinkIcon className="h-3.5 w-3.5" />
              )}
              Associer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────

interface StockVideoCardProps {
  video: StockVideo;
  videoRef: (el: HTMLVideoElement | null) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDownload: (v: StockVideo, q: VideoQuality) => void;
  onImport?: (v: StockVideo, q: VideoQuality) => void;
  importing: boolean;
}

function StockVideoCard({
  video,
  videoRef,
  onMouseEnter,
  onMouseLeave,
  onDownload,
  onImport,
  importing,
}: StockVideoCardProps) {
  const best = video.qualities[0];
  const [selectedQuality, setSelectedQuality] = useState<string>(best?.label ?? "");

  const currentQuality =
    video.qualities.find((q) => q.label === selectedQuality) ?? best;

  if (!best || !currentQuality) return null;

  return (
    <div
      className="group relative rounded-md overflow-hidden border border-border bg-card hover:border-primary/60 transition-colors"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Preview area */}
      <div className="relative aspect-video bg-secondary/50 overflow-hidden">
        {/* Thumbnail (fallback) */}
        <img
          src={video.thumbnail}
          alt={video.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Hover-to-play preview video */}
        {video.previewUrl && (
          <video
            ref={videoRef}
            src={video.previewUrl}
            muted
            playsInline
            loop
            preload="none"
            className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}

        {/* Top-left: source badge */}
        <Badge
          className={`absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0 ${
            video.source === "pexels"
              ? "bg-blue-500/85 hover:bg-blue-500 text-white border-blue-500"
              : "bg-green-500/85 hover:bg-green-500 text-white border-green-500"
          }`}
        >
          {video.source === "pexels" ? "Pexels" : "Pixabay"}
        </Badge>

        {/* Top-right: duration */}
        <Badge
          variant="outline"
          className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0 bg-black/60 text-white border-white/20 backdrop-blur-sm"
        >
          {fmtDuration(video.duration)}
        </Badge>

        {/* Bottom-left: quality badge */}
        <Badge
          variant="outline"
          className="absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0 bg-black/60 text-white border-white/20 backdrop-blur-sm"
        >
          {bestQualityLabel(video)} · {video.width}×{video.height}
        </Badge>

        {/* Center play icon (hides on hover) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-70 group-hover:opacity-0 transition-opacity">
          <PlayCircle className="h-10 w-10 text-white drop-shadow-lg" />
        </div>
      </div>

      {/* Info + actions */}
      <div className="p-2 space-y-1.5">
        {/* Author */}
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={video.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              © {video.author}
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">
            Voir sur {video.source === "pexels" ? "Pexels" : "Pixabay"}
          </TooltipContent>
        </Tooltip>

        {/* Quality selector + actions */}
        <div className="flex items-center gap-1">
          <Select value={selectedQuality} onValueChange={setSelectedQuality}>
            <SelectTrigger className="h-6 text-[10px] px-1.5 flex-1 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {video.qualities.map((q, i) => (
                <SelectItem key={`${q.label}-${i}`} value={q.label}>
                  {q.label} · {q.width}×{q.height}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => onDownload(video, currentQuality)}
              >
                <Download className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">
              Télécharger ({currentQuality.label})
            </TooltipContent>
          </Tooltip>

          {onImport && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onImport(video, currentQuality)}
                  disabled={importing}
                >
                  {importing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px]">
                Ajouter au projet
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={video.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-6 w-6 shrink-0 rounded-md hover:bg-secondary text-muted-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">
              Page source
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
