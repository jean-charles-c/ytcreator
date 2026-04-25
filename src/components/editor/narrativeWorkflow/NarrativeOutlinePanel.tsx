import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  ListTree,
  Loader2,
  Wand2,
  RefreshCw,
  Sparkles,
  Compass,
  Zap,
  Eye,
  Heart,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileBadge2,
  ChevronDown,
  ChevronRight,
  Film,
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
import { useNarrativeOutline, type NarrativeChapter } from "@/hooks/useNarrativeOutline";

interface NarrativeOutlinePanelProps {
  projectId: string | null;
}

/**
 * Étape 12 — Génération et affichage du sommaire narratif d'un projet.
 * Le sommaire respecte la forme narrative figée du projet (generated_projects → form_id).
 */
export default function NarrativeOutlinePanel({ projectId }: NarrativeOutlinePanelProps) {
  const { data, loading, reload } = useNarrativeOutline(projectId);
  const [generating, setGenerating] = useState(false);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const runGenerate = useCallback(
    async (overwrite: boolean) => {
      if (!projectId) return;
      setGenerating(true);
      try {
        const { data: res, error } = await supabase.functions.invoke(
          "generate-narrative-outline",
          { body: { project_id: projectId, overwrite } },
        );
        if (error) {
          const msg =
            (error as any)?.context?.body?.error ||
            (error as any)?.message ||
            "Erreur lors de la génération du sommaire";
          throw new Error(msg);
        }
        if (!res?.ok) {
          if (res?.error === "outline_exists") {
            setConfirmRegenOpen(true);
            return;
          }
          throw new Error(res?.error || "Génération échouée");
        }
        toast.success(`Sommaire généré (${res.chapter_count} chapitres).`);
        await reload();
      } catch (e: any) {
        console.error("generate outline", e);
        toast.error(e?.message || "Erreur lors de la génération");
      } finally {
        setGenerating(false);
      }
    },
    [projectId, reload],
  );

  if (!projectId) return null;

  const outline = data?.outline ?? null;
  const chapters = data?.chapters ?? [];

  const goToScenes = () => {
    const target = document.getElementById("narrative-scenes-panel");
    if (target) {
      setCollapsed(true);
      // Wait for collapse to complete before scrolling
      setTimeout(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {outline && chapters.length > 0 && (
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label={collapsed ? "Déplier le sommaire" : "Replier le sommaire"}
                title={collapsed ? "Déplier" : "Replier"}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            )}
            <ListTree className="h-4 w-4 text-primary shrink-0" />
            <h4 className="font-display text-sm sm:text-base font-semibold text-foreground">
              Sommaire narratif
            </h4>
            {chapters.length > 0 && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {chapters.length} chapitre{chapters.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
            Structure éditoriale détaillée du projet, dérivée du pitch sélectionné et de la
            forme narrative figée.
          </p>
          {data && (data.formName || data.pitchTitle) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              {data.formName && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <FileBadge2 className="h-3 w-3" /> Forme : {data.formName}
                </span>
              )}
              {data.pitchTitle && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                  <Sparkles className="h-3 w-3" /> Pitch : {data.pitchTitle}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {outline && chapters.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={goToScenes}
              className="min-h-[40px] sm:min-h-[36px] justify-center"
              title="Passer à la génération des scènes"
            >
              <Film className="h-4 w-4" />
              <span className="sm:hidden">Aux scènes</span>
              <span className="hidden sm:inline">Aller aux scènes</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={outline ? "outline" : "default"}
            onClick={() => (outline ? setConfirmRegenOpen(true) : runGenerate(false))}
            disabled={generating || loading}
            className="min-h-[40px] sm:min-h-[36px] justify-center"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Génération…</>
            ) : outline ? (
              <>
                <RefreshCw className="h-4 w-4" />
                <span className="sm:hidden">Régénérer</span>
                <span className="hidden sm:inline">Régénérer le sommaire</span>
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                <span className="sm:hidden">Générer</span>
                <span className="hidden sm:inline">Générer le sommaire</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {loading && !outline && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
        </div>
      )}

      {!loading && !outline && !generating && (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Aucun sommaire pour ce projet. Génère le sommaire narratif pour démarrer la phase
            d'écriture.
          </p>
        </div>
      )}

      {outline && !collapsed && (
        <OutlineHeader
          title={outline.title}
          intention={outline.intention}
          targetDuration={outline.target_duration_seconds}
        />
      )}

      {outline && chapters.length > 0 && !collapsed && (
        <ol className="space-y-3">
          {chapters.map((ch) => (
            <ChapterCard key={ch.id} chapter={ch} />
          ))}
        </ol>
      )}

      {outline && chapters.length > 0 && collapsed && (
        <div className="rounded-md border border-dashed border-border/40 bg-muted/10 p-2.5 text-center">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Afficher les {chapters.length} chapitre{chapters.length > 1 ? "s" : ""} du sommaire
          </button>
        </div>
      )}

      <AlertDialog open={confirmRegenOpen} onOpenChange={setConfirmRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Régénérer le sommaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action remplace le sommaire actuel et ses chapitres. Les scènes et scripts
              déjà générés ne sont pas affectés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRegenOpen(false);
                void runGenerate(true);
              }}
            >
              Remplacer le sommaire
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OutlineHeader({
  title,
  intention,
  targetDuration,
}: {
  title: string | null;
  intention: string | null;
  targetDuration: number | null;
}) {
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          {title && (
            <h5 className="font-display text-sm font-semibold text-foreground">{title}</h5>
          )}
          {intention && (
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {intention}
            </p>
          )}
          {typeof targetDuration === "number" && targetDuration > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" /> Durée cible ≈ {Math.round(targetDuration / 60)} min
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterCard({ chapter }: { chapter: NarrativeChapter }) {
  const role = chapter.structural_role?.trim();
  const missingIntention = !chapter.intention || chapter.intention.trim().length === 0;

  return (
    <li className="rounded-md border border-border/70 bg-background/40 p-3 sm:p-4 space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold shrink-0">
          {chapter.chapter_order}
        </span>
        <div className="min-w-0 flex-1">
          <h5 className="font-display text-sm sm:text-base font-semibold text-foreground">
            {chapter.title}
          </h5>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {role && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-foreground/80 border border-border">
                <Compass className="h-3 w-3" /> {role}
              </span>
            )}
            {chapter.estimated_duration_seconds && chapter.estimated_duration_seconds > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                <Clock className="h-3 w-3" /> ≈ {Math.round(chapter.estimated_duration_seconds / 60) || 1} min
              </span>
            )}
          </div>
        </div>
      </div>

      {chapter.summary && (
        <p className="text-[12px] sm:text-sm text-foreground/90 leading-relaxed">
          {chapter.summary}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-1 border-t border-border/40">
        <Field icon={<Sparkles className="h-3.5 w-3.5" />} label="Intention narrative">
          {chapter.intention || (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" /> non renseignée
            </span>
          )}
        </Field>
        {chapter.main_event && (
          <Field icon={<Eye className="h-3.5 w-3.5" />} label="Événement principal">
            {chapter.main_event}
          </Field>
        )}
        {chapter.dramatic_tension && (
          <Field icon={<Zap className="h-3.5 w-3.5" />} label="Tension dramatique">
            {chapter.dramatic_tension}
          </Field>
        )}
        {chapter.revelation && (
          <Field icon={<Sparkles className="h-3.5 w-3.5" />} label="Révélation">
            {chapter.revelation}
          </Field>
        )}
        {chapter.emotional_progression && (
          <Field icon={<Heart className="h-3.5 w-3.5" />} label="Progression émotionnelle">
            {chapter.emotional_progression}
          </Field>
        )}
      </div>

      {chapter.transition_to_next && (
        <div className="flex items-start gap-1.5 rounded-md bg-muted/30 border border-border/40 px-2.5 py-1.5">
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            <span className="font-semibold text-muted-foreground">Transition : </span>
            {chapter.transition_to_next}
          </p>
        </div>
      )}

      {missingIntention && (
        <p className="sr-only">Chapitre sans intention narrative — à compléter.</p>
      )}
    </li>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-[12px] text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}