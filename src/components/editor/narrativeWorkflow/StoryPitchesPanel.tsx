import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Wand2,
  RefreshCw,
  Theater,
  Zap,
  Eye,
  Compass,
  Heart,
  Users,
  Clock,
  CheckCircle2,
  ListTree,
  Quote,
  Layers,
  FolderPlus,
  ExternalLink,
  FileBadge2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useStoryPitchBatches, type PitchBatch, type StoryPitch } from "@/hooks/useStoryPitchBatches";
import { cn } from "@/lib/utils";
import {
  createProjectFromPitch,
  useGeneratedProjectsByAnalysis,
  type GeneratedProjectFull,
} from "@/hooks/useGeneratedProjects";
import type { AnalysisPayload } from "./NarrativeAnalysisPanel";
import { useNavigate } from "react-router-dom";

interface StoryPitchesPanelProps {
  analysisId?: string | null;
  formId?: string | null;
  /** Désactive le bouton de génération si le contexte est incomplet. */
  disabled?: boolean;
  /** Force l'ouverture initiale (par ex. après clic depuis l'analyse). */
  autoTrigger?: boolean;
  onAutoTriggerHandled?: () => void;
  /** Analyse complète, requise pour figer une forme narrative au moment de la création de projet. */
  analysisPayload?: AnalysisPayload | null;
}

/**
 * Étape 10 — Affichage et génération des lots de 5 pitchs.
 * Conserve l'historique complet, chaque lot est identifiable (#1, #2…).
 */
export default function StoryPitchesPanel({
  analysisId,
  formId,
  disabled = false,
  autoTrigger = false,
  onAutoTriggerHandled,
  analysisPayload = null,
}: StoryPitchesPanelProps) {
  const { batches, loading, reload } = useStoryPitchBatches({ analysisId, formId });
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();
  const { items: generatedProjects, reload: reloadProjects } =
    useGeneratedProjectsByAnalysis(analysisId ?? null);
  const [creatingPitchId, setCreatingPitchId] = useState<string | null>(null);

  const handleCreateProject = useCallback(
    async (pitch: StoryPitch) => {
      if (!analysisId && !formId) {
        toast.error("Aucune analyse ou forme narrative associée.");
        return;
      }
      setCreatingPitchId(pitch.id);
      try {
        const { project_id } = await createProjectFromPitch({
          pitch,
          analysisId: analysisId ?? null,
          existingFormId: formId ?? null,
          analysis: analysisPayload,
        });
        await reloadProjects();
        toast.success(`Projet « ${pitch.title} » créé`, {
          action: {
            label: "Ouvrir",
            onClick: () => navigate(`/editor/${project_id}`),
          },
        });
      } catch (e: any) {
        console.error("create project from pitch", e);
        toast.error(e?.message || "Erreur lors de la création du projet");
      } finally {
        setCreatingPitchId(null);
      }
    },
    [analysisId, formId, analysisPayload, reloadProjects, navigate],
  );

  const generate = useCallback(async () => {
    if (!analysisId && !formId) {
      toast.error("Aucune analyse ou forme narrative associée.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-story-pitches", {
        body: { analysis_id: analysisId ?? null, form_id: formId ?? null },
      });
      if (error) {
        const msg =
          (error as any)?.context?.body?.error ||
          (error as any)?.message ||
          "Erreur lors de la génération";
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || "Génération échouée");
      toast.success(`Lot #${data.batch?.batch_index ?? "?"} généré (${data.pitches?.length ?? 0} pitchs).`);
      await reload();
    } catch (e: any) {
      console.error("generate pitches", e);
      toast.error(e?.message || "Erreur lors de la génération des pitchs");
    } finally {
      setGenerating(false);
    }
  }, [analysisId, formId, reload]);

  // Auto-trigger from analysis panel CTA (effect to avoid render side-effects)
  useEffect(() => {
    if (autoTrigger && !generating && !loading && batches.length === 0) {
      onAutoTriggerHandled?.();
      void generate();
    }
  }, [autoTrigger, generating, loading, batches.length, generate, onAutoTriggerHandled]);

  const totalPitches = batches.reduce((acc, b) => acc + b.pitches.length, 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary shrink-0" />
            <h4 className="font-display text-sm sm:text-base font-semibold text-foreground">
              Propositions d'histoires
            </h4>
            {batches.length > 0 && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {batches.length} lot{batches.length > 1 ? "s" : ""} · {totalPitches} pitch{totalPitches > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
            Chaque lot contient 5 pitchs détaillés respectant la mécanique narrative.
            Les anciens lots sont conservés.
          </p>
        </div>
        <Button
          type="button"
          variant={batches.length > 0 ? "outline" : "default"}
          size="sm"
          onClick={generate}
          disabled={disabled || generating}
          className="min-h-[40px] sm:min-h-[36px] w-full sm:w-auto justify-center"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Génération…</>
          ) : batches.length === 0 ? (
            <>
              <Wand2 className="h-4 w-4" />
              <span className="sm:hidden">Générer 5 pitchs</span>
              <span className="hidden sm:inline">Générer 5 propositions d'histoires</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              <span className="sm:hidden">5 autres pitchs</span>
              <span className="hidden sm:inline">Générer 5 autres propositions</span>
            </>
          )}
        </Button>
      </div>

      {loading && batches.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement des pitchs…
        </div>
      )}

      {!loading && batches.length === 0 && !generating && (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Aucun pitch pour l'instant. Lance une première génération pour obtenir 5 propositions.
          </p>
        </div>
      )}

      {generatedProjects.length > 0 && (
        <ActiveProjectsBanner items={generatedProjects} onOpen={(id) => navigate(`/editor/${id}`)} />
      )}

      <div className="space-y-3">
        {batches.map((batch) => (
          <BatchBlock
            key={batch.id}
            batch={batch}
            defaultOpen={batch.batch_index === batches.length}
            createdByPitch={new Map(generatedProjects.map((g) => [g.pitch_id ?? "", g]))}
            onCreateProject={handleCreateProject}
            creatingPitchId={creatingPitchId}
          />
        ))}
      </div>
    </div>
  );
}

function BatchBlock({
  batch,
  defaultOpen,
  createdByPitch,
  onCreateProject,
  creatingPitchId,
}: {
  batch: PitchBatch;
  defaultOpen?: boolean;
  createdByPitch: Map<string, GeneratedProjectFull>;
  onCreateProject: (pitch: StoryPitch) => void;
  creatingPitchId: string | null;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const date = new Date(batch.created_at);
  const formattedDate = date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border/70 bg-background/40">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-3 py-3 sm:py-2 min-h-[44px] text-left hover:bg-secondary/30 rounded-t-lg"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold shrink-0">
                #{batch.batch_index}
              </span>
              <span className="text-sm font-medium text-foreground">
                Lot de pitchs
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                · {batch.pitches.length} pitch{batch.pitches.length > 1 ? "s" : ""}
              </span>
              <span className="text-[10px] text-muted-foreground">· {formattedDate}</span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 space-y-3">
            {batch.pitches.map((p) => (
              <PitchCard
                key={p.id}
                pitch={p}
                projectsForPitch={
                  // Plusieurs projets peuvent exister pour un même pitch (recréation manuelle)
                  Array.from(createdByPitch.values()).filter((g) => g.pitch_id === p.id)
                }
                onCreateProject={() => onCreateProject(p)}
                creating={creatingPitchId === p.id}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function PitchCard({
  pitch,
  projectsForPitch,
  onCreateProject,
  creating,
}: {
  pitch: StoryPitch;
  projectsForPitch: GeneratedProjectFull[];
  onCreateProject: () => void;
  creating: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="rounded-md border border-border/70 bg-card p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-secondary text-foreground text-[11px] font-semibold shrink-0">
          {pitch.pitch_order}
        </span>
        <div className="min-w-0 flex-1">
          <h5 className="font-display text-sm sm:text-base font-semibold text-foreground">
            {pitch.title}
          </h5>
          {pitch.theme && (
            <p className="text-[11px] text-muted-foreground italic mt-0.5">{pitch.theme}</p>
          )}
        </div>
      </div>

      {pitch.concept && (
        <Field icon={<Layers className="h-3.5 w-3.5" />} label="Concept">
          {pitch.concept}
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
        {pitch.angle && (
          <Field icon={<Compass className="h-3.5 w-3.5" />} label="Angle narratif">
            {pitch.angle}
          </Field>
        )}
        {pitch.point_of_view && (
          <Field icon={<Eye className="h-3.5 w-3.5" />} label="Point de vue">
            {pitch.point_of_view}
          </Field>
        )}
        {pitch.central_tension && (
          <Field icon={<Zap className="h-3.5 w-3.5" />} label="Tension centrale">
            {pitch.central_tension}
          </Field>
        )}
        {pitch.narrative_promise && (
          <Field icon={<Sparkles className="h-3.5 w-3.5" />} label="Promesse narrative">
            {pitch.narrative_promise}
          </Field>
        )}
      </div>

      {pitch.progression && (
        <Field icon={<ListTree className="h-3.5 w-3.5" />} label="Progression">
          {pitch.progression}
        </Field>
      )}

      {pitch.twists && pitch.twists.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <Theater className="h-3.5 w-3.5" /> Rebondissements possibles
          </div>
          <ul className="space-y-0.5 pl-4 list-disc text-xs text-foreground/90">
            {pitch.twists.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 pt-1 border-t border-border/40">
        {pitch.dominant_emotion && (
          <Field icon={<Heart className="h-3.5 w-3.5" />} label="Émotion dominante" tight>
            {pitch.dominant_emotion}
          </Field>
        )}
        {pitch.tone && (
          <Field icon={<Quote className="h-3.5 w-3.5" />} label="Ton" tight>
            {pitch.tone}
          </Field>
        )}
        {pitch.target_audience && (
          <Field icon={<Users className="h-3.5 w-3.5" />} label="Public cible" tight>
            {pitch.target_audience}
          </Field>
        )}
        {pitch.estimated_format && (
          <Field icon={<Clock className="h-3.5 w-3.5" />} label="Format estimé" tight>
            {pitch.estimated_format}
          </Field>
        )}
      </div>

      {pitch.form_compliance_justification && (
        <div className="rounded-md bg-primary/5 border border-primary/20 p-2.5 flex items-start gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <div className="text-[11px] text-foreground/90 leading-relaxed">
            <span className="font-semibold text-primary">Respect de la forme : </span>
            {pitch.form_compliance_justification}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 pt-2 border-t border-border/40">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {projectsForPitch.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">
              Aucun projet créé depuis ce pitch
            </span>
          ) : (
            projectsForPitch.map((gp) => (
              <button
                key={gp.id}
                type="button"
                onClick={() => navigate(`/editor/${gp.project_id}`)}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-emerald-700 dark:text-emerald-400 text-[10px] px-2 py-1 border border-emerald-500/30 max-w-full"
                title={`Ouvrir le projet « ${gp.project_title ?? "?"} »`}
              >
                <FileBadge2 className="h-3 w-3" />
                <span className="truncate max-w-[160px]">{gp.project_title || "Projet"}</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-70" />
              </button>
            ))
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={projectsForPitch.length > 0 ? "outline" : "default"}
          onClick={onCreateProject}
          disabled={creating}
          className="min-h-[40px] sm:min-h-[32px] text-xs w-full sm:w-auto justify-center"
        >
          {creating ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Création…</>
          ) : projectsForPitch.length > 0 ? (
            <><FolderPlus className="h-3.5 w-3.5" /> Créer un autre projet</>
          ) : (
            <>
              <FolderPlus className="h-3.5 w-3.5" />
              <span className="sm:hidden">Créer un projet</span>
              <span className="hidden sm:inline">Créer un projet avec cette proposition</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ActiveProjectsBanner({
  items,
  onOpen,
}: {
  items: GeneratedProjectFull[];
  onOpen: (projectId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <FileBadge2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <h5 className="text-xs font-semibold text-foreground">
          Projets créés depuis ces pitchs
          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
            ({items.length})
          </span>
        </h5>
      </div>
      <ul className="space-y-1.5">
        {items.map((gp) => (
          <li
            key={gp.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background/60 border border-border/50 px-2.5 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-foreground truncate">
                {gp.project_title || "Projet sans titre"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Pitch : {gp.pitch_title || "—"}
                {gp.form_name ? (
                  <> · Forme : <span className="text-foreground/80">{gp.form_name}</span></>
                ) : null}
                <> · Statut : <span className="text-foreground/80">{gp.status}</span></>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onOpen(gp.project_id)}
              className="h-7 text-[11px]"
            >
              <ExternalLink className="h-3 w-3" /> Ouvrir
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
  tight = false,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  tight?: boolean;
}) {
  return (
    <div className={cn("space-y-0.5", tight ? "" : "")}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line">{children}</p>
    </div>
  );
}
