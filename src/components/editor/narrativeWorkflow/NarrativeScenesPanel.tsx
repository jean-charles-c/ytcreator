import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Film,
  Loader2,
  Wand2,
  RefreshCw,
  Plus,
  Heart,
  Compass,
  MapPin,
  Users,
  Package,
  ArrowRight,
  Lock,
  Unlock,
  Trash2,
  ChevronDown,
  Sparkles,
  Zap,
  Gauge,
  Maximize2,
  Minimize2,
  Send,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNarrativeOutline, type NarrativeChapter } from "@/hooks/useNarrativeOutline";
import { useNarrativeScenes, type NarrativeSceneRow } from "@/hooks/useNarrativeScenes";

interface NarrativeScenesPanelProps {
  projectId: string | null;
  /**
   * Étape 16 — Callback déclenché après transfert réussi vers la
   * Segmentation View. Permet à l'écran parent (Editor) de rafraîchir
   * `scenes`, `globalContext` et de basculer sur l'onglet Segmentation.
   */
  onSentToSegmentation?: () => void;
}

type Variant = "default" | "shorter" | "more_dramatic" | "more_rhythmic" | "more_detailed";

const VARIANT_LABELS: Record<Variant, { label: string; icon: any }> = {
  default: { label: "Standard", icon: Sparkles },
  shorter: { label: "Plus court", icon: Minimize2 },
  more_dramatic: { label: "Plus dramatique", icon: Zap },
  more_rhythmic: { label: "Plus rythmé", icon: Gauge },
  more_detailed: { label: "Plus détaillé", icon: Maximize2 },
};

/**
 * Étape 13 — Génération et édition contrôlée des scènes par chapitre.
 * Le panneau s'appuie sur le sommaire courant du projet et expose des actions :
 *  - générer toutes les scènes du projet
 *  - générer les scènes d'un chapitre
 *  - étendre (plus de scènes) un chapitre
 *  - régénérer un chapitre (préserve les scènes validées)
 *  - régénérer une scène (refuse si validée, sauf confirmation)
 */
export default function NarrativeScenesPanel({ projectId, onSentToSegmentation }: NarrativeScenesPanelProps) {
  const { data: outlineData, loading: loadingOutline } = useNarrativeOutline(projectId);
  const outline = outlineData?.outline ?? null;
  const chapters = outlineData?.chapters ?? [];

  const { scenesByChapter, loading, reload, updateScene, deleteScene } = useNarrativeScenes(
    projectId,
    outline?.id ?? null,
  );

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [overwriteAsk, setOverwriteAsk] = useState<{ kind: "all" | "chapter" | "scene"; id?: string } | null>(null);
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});

  // Étape 16 — état d'envoi vers Segmentation View.
  const [sending, setSending] = useState(false);
  const [askSendOverwrite, setAskSendOverwrite] = useState<{
    existing: number;
    incoming: number;
    incomplete: number;
  } | null>(null);
  const [askIncomplete, setAskIncomplete] = useState<number | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const totalScenes = useMemo(
    () => Object.values(scenesByChapter).reduce((acc, arr) => acc + arr.length, 0),
    [scenesByChapter],
  );
  const allScenesFlat = useMemo(
    () => Object.values(scenesByChapter).flat(),
    [scenesByChapter],
  );
  const incompleteCount = useMemo(
    () =>
      allScenesFlat.filter(
        (s) => !((s.voice_over_text ?? s.content ?? "").trim()),
      ).length,
    [allScenesFlat],
  );

  const callGenerate = useCallback(
    async (params: {
      mode: "generate" | "extend" | "regenerate_chapter" | "regenerate_scene";
      variant?: Variant;
      chapter_id?: string;
      scene_id?: string;
      overwrite?: boolean;
      requested_count?: number;
      key: string;
    }) => {
      if (!projectId) return;
      setBusyKey(params.key);
      try {
        const { data: res, error } = await supabase.functions.invoke(
          "generate-narrative-scenes",
          {
            body: {
              project_id: projectId,
              mode: params.mode,
              variant: params.variant ?? "default",
              chapter_id: params.chapter_id ?? null,
              scene_id: params.scene_id ?? null,
              overwrite: params.overwrite === true,
              requested_count: params.requested_count ?? null,
            },
          },
        );
        if (error) {
          const msg =
            (error as any)?.context?.body?.error ||
            (error as any)?.message ||
            "Erreur lors de la génération";
          throw new Error(msg);
        }
        if (!res?.ok) {
          if (res?.error === "scene_validated") {
            setOverwriteAsk({ kind: "scene", id: params.scene_id });
            return;
          }
          if (Array.isArray(res?.errors) && res.errors.some((e: string) => e.includes("scenes_exist"))) {
            setOverwriteAsk(
              params.chapter_id
                ? { kind: "chapter", id: params.chapter_id }
                : { kind: "all" },
            );
            return;
          }
          throw new Error(res?.error || "Génération échouée");
        }
        toast.success(`${res.created ?? 0} scène(s) générée(s).`);
        await reload();
      } catch (e: any) {
        console.error("generate scenes", e);
        toast.error(e?.message || "Erreur lors de la génération");
      } finally {
        setBusyKey(null);
      }
    },
    [projectId, reload],
  );

  const toggleValidated = useCallback(
    async (scene: NarrativeSceneRow) => {
      try {
        await updateScene(scene.id, { validated: !scene.validated } as any);
      } catch (e) {
        toast.error("Impossible de modifier la validation.");
      }
    },
    [updateScene],
  );

  const removeScene = useCallback(
    async (scene: NarrativeSceneRow) => {
      if (scene.validated) {
        toast.error("Scène validée — déverrouillez-la pour supprimer.");
        return;
      }
      try {
        await deleteScene(scene.id);
        toast.success("Scène supprimée.");
      } catch (e) {
        toast.error("Suppression impossible.");
      }
    },
    [deleteScene],
  );

  /**
   * Étape 16 — Envoi des scènes narratives vers la Segmentation View.
   * - Insère les scènes dans la table `scenes` consommée par Segmentation.
   * - Conserve voix off, personnages, lieux, objets, contexte et ordre.
   * - Déclenche `analyze-context` pour préparer l'analyse des récurrences.
   * - Demande confirmation si des scènes existent déjà côté Segmentation.
   */
  const callSendToSegmentation = useCallback(
    async (overwrite: boolean) => {
      if (!projectId || !outline) return;
      setSending(true);
      try {
        const { data: res, error } = await supabase.functions.invoke(
          "send-narrative-to-segmentation",
          {
            body: {
              project_id: projectId,
              outline_id: outline.id,
              overwrite,
              trigger_context_analysis: true,
              validated_only: false,
            },
          },
        );
        if (error) {
          const msg =
            (error as any)?.context?.body?.error ||
            (error as any)?.message ||
            "Erreur lors du transfert";
          throw new Error(msg);
        }
        if (!res?.ok) {
          if (res?.error === "scenes_exist") {
            setAskSendOverwrite({
              existing: res.existing_count ?? 0,
              incoming: res.incoming_count ?? 0,
              incomplete: res.incomplete_count ?? 0,
            });
            return;
          }
          throw new Error(res?.error || "Transfert échoué");
        }
        setSentAt(new Date().toISOString());
        toast.success(
          `${res.scenes_inserted ?? 0} scène(s) transférée(s) vers Segmentation View.${
            res.context_analysis_triggered ? " Analyse des récurrences en cours." : ""
          }`,
        );
        if (res.warning) toast.message(res.warning);
        onSentToSegmentation?.();
      } catch (e: any) {
        console.error("send-narrative-to-segmentation", e);
        toast.error(e?.message || "Erreur lors du transfert");
      } finally {
        setSending(false);
      }
    },
    [projectId, outline, onSentToSegmentation],
  );

  const onSendClick = useCallback(() => {
    if (totalScenes === 0) return;
    if (incompleteCount > 0) {
      setAskIncomplete(incompleteCount);
      return;
    }
    void callSendToSegmentation(false);
  }, [totalScenes, incompleteCount, callSendToSegmentation]);

  if (!projectId) return null;
  if (loadingOutline) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
      </div>
    );
  }
  if (!outline) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary shrink-0" />
            <h4 className="font-display text-sm sm:text-base font-semibold text-foreground">
              Scènes narratives
            </h4>
            {totalScenes > 0 && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {totalScenes} scène{totalScenes > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
            Découpage scène par scène généré à partir du sommaire et de la forme narrative.
            Les scènes validées sont protégées.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <VariantMenu
            label={
              totalScenes > 0 ? (
                <><RefreshCw className="h-4 w-4" /> Régénérer le projet</>
              ) : (
                <><Wand2 className="h-4 w-4" /> Générer les scènes</>
              )
            }
            disabled={busyKey !== null}
            busy={busyKey === "all"}
            onSelect={(variant) =>
              callGenerate({
                key: "all",
                mode: "generate",
                variant,
                overwrite: totalScenes > 0,
              })
            }
          />
          {/* Étape 16 — Envoi vers Segmentation View */}
          {totalScenes > 0 && onSentToSegmentation && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sending || busyKey !== null}
              onClick={onSendClick}
              title="Insère les scènes dans Segmentation View et déclenche l'analyse des récurrences."
              className="min-h-[40px] sm:min-h-[36px]"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="ml-1.5 sm:hidden">Envoyer</span>
              <span className="ml-1.5 hidden sm:inline">Envoyer vers Segmentation View</span>
            </Button>
          )}
        </div>
      </div>

      {sentAt && (
        <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Scènes transférées vers Segmentation View le{" "}
          {new Date(sentAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
        </div>
      )}

      {chapters.length === 0 && (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          Génère d'abord le sommaire pour pouvoir produire les scènes.
        </div>
      )}

      {chapters.length > 0 && (
        <ol className="space-y-3">
          {chapters.map((ch) => {
            const chScenes = scenesByChapter[ch.id] ?? [];
            const open = openChapters[ch.id] ?? true;
            return (
              <ChapterScenesGroup
                key={ch.id}
                chapter={ch}
                scenes={chScenes}
                open={open}
                onToggleOpen={() =>
                  setOpenChapters((prev) => ({ ...prev, [ch.id]: !open }))
                }
                busyKey={busyKey}
                onGenerate={(variant) =>
                  callGenerate({
                    key: `gen-${ch.id}`,
                    mode: "generate",
                    chapter_id: ch.id,
                    variant,
                    overwrite: chScenes.length > 0,
                  })
                }
                onExtend={(variant) =>
                  callGenerate({
                    key: `ext-${ch.id}`,
                    mode: "extend",
                    chapter_id: ch.id,
                    variant,
                  })
                }
                onRegenChapter={(variant) =>
                  callGenerate({
                    key: `regch-${ch.id}`,
                    mode: "regenerate_chapter",
                    chapter_id: ch.id,
                    variant,
                  })
                }
                onRegenScene={(scene, variant) =>
                  callGenerate({
                    key: `regsc-${scene.id}`,
                    mode: "regenerate_scene",
                    scene_id: scene.id,
                    variant,
                  })
                }
                onToggleValidated={toggleValidated}
                onDelete={removeScene}
              />
            );
          })}
        </ol>
      )}

      <AlertDialog
        open={overwriteAsk !== null}
        onOpenChange={(o) => !o && setOverwriteAsk(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {overwriteAsk?.kind === "scene"
                ? "Régénérer cette scène validée ?"
                : "Remplacer les scènes existantes ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {overwriteAsk?.kind === "scene"
                ? "Cette scène est verrouillée. Confirme pour la régénérer."
                : "Les scènes non validées seront remplacées. Les scènes validées sont protégées et conservées."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const ask = overwriteAsk;
                setOverwriteAsk(null);
                if (!ask) return;
                if (ask.kind === "scene" && ask.id) {
                  void callGenerate({
                    key: `regsc-${ask.id}`,
                    mode: "regenerate_scene",
                    scene_id: ask.id,
                    overwrite: true,
                  });
                } else if (ask.kind === "chapter" && ask.id) {
                  void callGenerate({
                    key: `gen-${ask.id}`,
                    mode: "generate",
                    chapter_id: ask.id,
                    overwrite: true,
                  });
                } else {
                  void callGenerate({
                    key: "all",
                    mode: "generate",
                    overwrite: true,
                  });
                }
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Étape 16 — Confirmation : scènes déjà présentes côté Segmentation View */}
      <AlertDialog
        open={askSendOverwrite !== null}
        onOpenChange={(o) => !o && setAskSendOverwrite(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer les scènes existantes ?</AlertDialogTitle>
            <AlertDialogDescription>
              {askSendOverwrite ? (
                <>
                  Segmentation View contient déjà {askSendOverwrite.existing} scène(s).
                  Le transfert va les remplacer par {askSendOverwrite.incoming} nouvelle(s)
                  scène(s) issues du workflow narratif. Les shots associés seront effacés
                  (Segmentation View elle-même n'est pas recréée).
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAskSendOverwrite(null);
                void callSendToSegmentation(true);
              }}
            >
              Remplacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Étape 16 — Avertissement : scènes incomplètes (sans voix off) */}
      <AlertDialog
        open={askIncomplete !== null}
        onOpenChange={(o) => !o && setAskIncomplete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{askIncomplete} scène(s) sans voix off</AlertDialogTitle>
            <AlertDialogDescription>
              Certaines scènes n'ont pas encore de texte voix off. Elles seront tout de même
              transférées vers Segmentation View, mais leur contenu narratif sera vide.
              Souhaites-tu poursuivre ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAskIncomplete(null);
                void callSendToSegmentation(false);
              }}
            >
              Transférer quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChapterScenesGroup({
  chapter,
  scenes,
  open,
  onToggleOpen,
  busyKey,
  onGenerate,
  onExtend,
  onRegenChapter,
  onRegenScene,
  onToggleValidated,
  onDelete,
}: {
  chapter: NarrativeChapter;
  scenes: NarrativeSceneRow[];
  open: boolean;
  onToggleOpen: () => void;
  busyKey: string | null;
  onGenerate: (variant: Variant) => void;
  onExtend: (variant: Variant) => void;
  onRegenChapter: (variant: Variant) => void;
  onRegenScene: (scene: NarrativeSceneRow, variant: Variant) => void;
  onToggleValidated: (scene: NarrativeSceneRow) => void;
  onDelete: (scene: NarrativeSceneRow) => void;
}) {
  const empty = scenes.length === 0;
  return (
    <li className="rounded-md border border-border/70 bg-background/40 p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggleOpen}
          className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold shrink-0 hover:bg-primary/25 transition-colors"
          title={open ? "Réduire" : "Développer"}
        >
          {chapter.chapter_order}
        </button>
        <div className="min-w-0 flex-1">
          <h5 className="font-display text-sm sm:text-base font-semibold text-foreground">
            {chapter.title}
          </h5>
          {chapter.intention && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
              {chapter.intention}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
              {scenes.length} scène{scenes.length > 1 ? "s" : ""}
            </span>
            {scenes.some((s) => s.validated) && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 inline-flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" />
                {scenes.filter((s) => s.validated).length} validée(s)
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {empty ? (
            <VariantMenu
              size="sm"
              label={<><Wand2 className="h-3.5 w-3.5" /> Générer</>}
              disabled={busyKey !== null}
              busy={busyKey === `gen-${chapter.id}`}
              onSelect={onGenerate}
            />
          ) : (
            <>
              <VariantMenu
                size="sm"
                label={<><Plus className="h-3.5 w-3.5" /> Plus de scènes</>}
                disabled={busyKey !== null}
                busy={busyKey === `ext-${chapter.id}`}
                onSelect={onExtend}
              />
              <VariantMenu
                size="sm"
                variant="outline"
                label={<><RefreshCw className="h-3.5 w-3.5" /> Régénérer</>}
                disabled={busyKey !== null}
                busy={busyKey === `regch-${chapter.id}`}
                onSelect={onRegenChapter}
              />
            </>
          )}
          <button
            type="button"
            onClick={onToggleOpen}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
            title={open ? "Réduire" : "Développer"}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`}
            />
          </button>
        </div>
      </div>

      {open && !empty && (
        <ol className="space-y-2">
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              busyKey={busyKey}
              onRegen={(variant) => onRegenScene(scene, variant)}
              onToggleValidated={() => onToggleValidated(scene)}
              onDelete={() => onDelete(scene)}
            />
          ))}
        </ol>
      )}

      {open && empty && (
        <div className="rounded-md border border-dashed border-border/50 bg-muted/10 p-3 text-center text-[11px] text-muted-foreground">
          Aucune scène pour ce chapitre. Lance une génération.
        </div>
      )}
    </li>
  );
}

function SceneCard({
  scene,
  busyKey,
  onRegen,
  onToggleValidated,
  onDelete,
}: {
  scene: NarrativeSceneRow;
  busyKey: string | null;
  onRegen: (variant: Variant) => void;
  onToggleValidated: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={`rounded border bg-background/60 p-2.5 sm:p-3 ${
        scene.validated ? "border-primary/40 shadow-sm shadow-primary/5" : "border-border/60"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex items-center justify-center h-5 min-w-5 rounded bg-secondary text-foreground/80 text-[10px] font-semibold px-1 shrink-0">
          #{scene.scene_order}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h6 className="text-[13px] font-semibold text-foreground truncate">
              {scene.title || "Sans titre"}
            </h6>
            {scene.narrative_role && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border inline-flex items-center gap-0.5">
                <Compass className="h-2.5 w-2.5" /> {scene.narrative_role}
              </span>
            )}
            {scene.dominant_emotion && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20 inline-flex items-center gap-0.5">
                <Heart className="h-2.5 w-2.5" /> {scene.dominant_emotion}
              </span>
            )}
            {scene.validated && (
              <span className="text-[9px] inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-primary font-medium">
                <Lock className="h-2.5 w-2.5" /> Validée
              </span>
            )}
          </div>
          {scene.summary && (
            <p className="mt-1 text-[11px] text-foreground/80 leading-relaxed">{scene.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleValidated}
            className={`p-1.5 rounded transition-colors ${
              scene.validated
                ? "text-primary hover:bg-secondary"
                : "text-muted-foreground hover:text-primary hover:bg-secondary"
            }`}
            title={scene.validated ? "Déverrouiller" : "Valider"}
          >
            {scene.validated ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <VariantMenu
            size="sm"
            variant="ghost"
            label={
              busyKey === `regsc-${scene.id}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
            iconOnly
            disabled={busyKey !== null}
            busy={busyKey === `regsc-${scene.id}`}
            onSelect={onRegen}
          />
          <button
            type="button"
            onClick={onDelete}
            disabled={scene.validated}
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
            title={scene.validated ? "Verrouillée" : "Supprimer"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
            title={open ? "Réduire" : "Détails"}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`}
            />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t border-border/40 space-y-2">
          {(scene.characters.length > 0 ||
            scene.locations.length > 0 ||
            scene.objects.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {scene.characters.map((c, i) => (
                <Tag key={`c-${i}`} icon={<Users className="h-2.5 w-2.5" />} text={c} />
              ))}
              {scene.locations.map((l, i) => (
                <Tag key={`l-${i}`} icon={<MapPin className="h-2.5 w-2.5" />} text={l} />
              ))}
              {scene.objects.map((o, i) => (
                <Tag key={`o-${i}`} icon={<Package className="h-2.5 w-2.5" />} text={o} />
              ))}
            </div>
          )}
          {scene.scene_context?.context && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground/80">Contexte : </span>
              {scene.scene_context.context}
            </p>
          )}
          {scene.voice_over_text && (
            <div className="rounded bg-secondary/40 border border-border/40 p-2">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                Voix off
              </div>
              <p className="text-[12px] text-foreground/90 leading-relaxed whitespace-pre-line">
                {scene.voice_over_text}
              </p>
            </div>
          )}
          {scene.transition_to_next && (
            <div className="flex items-start gap-1.5 rounded bg-muted/30 border border-border/40 px-2 py-1.5">
              <ArrowRight className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[11px] text-foreground/80 leading-relaxed">
                <span className="font-semibold text-muted-foreground">Transition : </span>
                {scene.transition_to_next}
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Tag({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
      {icon}
      <span className="truncate max-w-[140px]">{text}</span>
    </span>
  );
}

function VariantMenu({
  label,
  onSelect,
  disabled,
  busy,
  size = "default",
  variant = "default",
  iconOnly = false,
}: {
  label: React.ReactNode;
  onSelect: (variant: Variant) => void;
  disabled?: boolean;
  busy?: boolean;
  size?: "default" | "sm";
  variant?: "default" | "outline" | "ghost";
  iconOnly?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size={size}
          variant={variant}
          disabled={disabled}
          className={iconOnly ? "h-8 w-8 p-0" : undefined}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Style de génération
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(VARIANT_LABELS) as Variant[]).map((key) => {
          const Icon = VARIANT_LABELS[key].icon;
          return (
            <DropdownMenuItem key={key} onSelect={() => onSelect(key)} className="gap-2">
              <Icon className="h-3.5 w-3.5" />
              <span>{VARIANT_LABELS[key].label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}