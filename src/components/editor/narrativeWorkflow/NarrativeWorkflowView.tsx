import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import NarrativeWorkflowProgress from "./NarrativeWorkflowProgress";
import SourceManager, { type NarrativeSourceRow } from "./SourceManager";
import NarrativeAnalysisPanel, { type AnalysisPayload } from "./NarrativeAnalysisPanel";
import { supabase } from "@/integrations/supabase/client";
import SaveNarrativeFormDialog from "./SaveNarrativeFormDialog";
import { buildCustomFormPrompt, buildNarrativeSignature } from "./buildCustomFormPrompt";
import { useCustomNarrativeForms } from "@/hooks/useCustomNarrativeForms";
import StoryPitchesPanel from "./StoryPitchesPanel";

interface NarrativeWorkflowViewProps {
  projectId: string | null;
  onBack: () => void;
}

/**
 * Vue guidée du Narrative Form Generator.
 *
 * Étape 4 (MVP) : structure visible du workflow + message d'introduction.
 * Le détail des sources, de l'analyse et des étapes suivantes sera ajouté
 * dans les prompts dédiés (étapes 5+).
 */
export default function NarrativeWorkflowView({ projectId, onBack }: NarrativeWorkflowViewProps) {
  const [analysisStatus, setAnalysisStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisPayload | null>(null);
  const [sourcesUsed, setSourcesUsed] = useState<number | undefined>();
  const [lastSources, setLastSources] = useState<NarrativeSourceRow[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pitchesAutoTrigger, setPitchesAutoTrigger] = useState(false);
  const [pitchesVisible, setPitchesVisible] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const { createForm } = useCustomNarrativeForms();

  // Hydrate la dernière analyse complétée de l'utilisateur au montage,
  // pour ne pas perdre l'analyse / pitchs / forme déjà générés en
  // changeant d'onglet ou en rafraîchissant la page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        // Restaure en priorité l'analyse rattachée au projet courant.
        // À défaut, retombe sur la dernière analyse complétée de l'utilisateur
        // (compatibilité historique : avant l'ajout de project_id).
        let { data, error } = await supabase
          .from("narrative_analyses")
          .select(
            "id, title, summary, structure, patterns, tone, rhythm, writing_rules, recommendations, source_ids, status",
          )
          .eq("user_id", uid)
          .eq("project_id", projectId ?? "")
          .eq("status", "analysis_completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if ((!data || error) && !projectId) {
          const fallback = await supabase
            .from("narrative_analyses")
            .select(
              "id, title, summary, structure, patterns, tone, rhythm, writing_rules, recommendations, source_ids, status",
            )
            .eq("user_id", uid)
            .eq("status", "analysis_completed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          data = fallback.data;
          error = fallback.error;
        }
        if (cancelled || error || !data) return;
        const payload: AnalysisPayload = {
          title: data.title ?? undefined,
          summary: data.summary ?? undefined,
          structure: (data.structure as any) ?? undefined,
          patterns: (data.patterns as any) ?? undefined,
          tone: (data.tone as any) ?? undefined,
          rhythm: (data.rhythm as any) ?? undefined,
          writing_rules: (data.writing_rules as any) ?? undefined,
          recommendations: (data.recommendations as any) ?? undefined,
        };
        setAnalysisResult(payload);
        setAnalysisId(data.id);
        setSourcesUsed(Array.isArray(data.source_ids) ? data.source_ids.length : undefined);
        setAnalysisStatus("success");
        setPitchesVisible(true);
      } catch (e) {
        console.error("[NarrativeWorkflowView] hydrate", e);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const runAnalysis = useCallback(async (sources: NarrativeSourceRow[]) => {
    if (sources.length === 0) {
      toast.error("Au moins une transcription valide est requise.");
      return;
    }
    setLastSources(sources);
    setAnalysisStatus("running");
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "analyze-narrative-sources",
        { body: { source_ids: sources.map((s) => s.id), project_id: projectId } },
      );
      if (error) throw error;
      if (!data?.ok) {
        throw new Error(data?.error || "Analyse échouée");
      }
      setAnalysisResult(data.analysis as AnalysisPayload);
      setSourcesUsed(data.sources_used);
      setAnalysisId(data.analysis_id ?? null);
      // Rattache l'analyse au projet courant (idempotent).
      if (data.analysis_id && projectId) {
        try {
          await supabase
            .from("narrative_analyses")
            .update({ project_id: projectId })
            .eq("id", data.analysis_id);
        } catch (e) {
          console.warn("[NarrativeWorkflowView] attach project_id", e);
        }
      }
      setAnalysisStatus("success");
      toast.success("Analyse narrative terminée");
    } catch (e: any) {
      console.error("analyze error", e);
      const msg = e?.message || "Erreur lors de l'analyse";
      setAnalysisError(msg);
      setAnalysisStatus("error");
      toast.error(msg);
    }
  }, [projectId]);

  const handleRetry = useCallback(() => {
    if (lastSources.length > 0) runAnalysis(lastSources);
  }, [lastSources, runAnalysis]);

  const handleSaveAsForm = useCallback(() => {
    if (!analysisResult) {
      toast.error("Aucune analyse à sauvegarder.");
      return;
    }
    setSaveOpen(true);
  }, [analysisResult]);

  const handleConfirmSave = useCallback(
    async ({ name, description, userNotes }: { name: string; description: string; userNotes: string }) => {
      if (!analysisResult) return;
      setSaving(true);
      try {
        const system_prompt = buildCustomFormPrompt(analysisResult, userNotes);
        const narrative_signature = buildNarrativeSignature(analysisResult, userNotes);
        await createForm({
          name,
          description,
          system_prompt,
          analysis_id: analysisId,
          narrative_signature,
        });
        setSaveOpen(false);
        toast.success(
          `« ${name} » est disponible dans ScriptCreator v2 (badge Personnalisée).`,
        );
      } catch (e: any) {
        console.error("save form", e);
        toast.error(e?.message || "Erreur lors de la sauvegarde");
      } finally {
        setSaving(false);
      }
    },
    [analysisResult, analysisId, createForm],
  );

  const handleGeneratePitches = useCallback(() => {
    if (!analysisId) {
      toast.error("L'analyse doit être enregistrée avant de générer des pitchs.");
      return;
    }
    setPitchesVisible(true);
    setPitchesAutoTrigger(true);
    // Smooth scroll to pitches once mounted
    setTimeout(() => {
      document.getElementById("story-pitches-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [analysisId]);

  const completedSteps: ("sources" | "analysis")[] =
    analysisStatus === "success" ? ["sources"] : [];
  const currentStep: "sources" | "analysis" =
    analysisStatus === "success" ? "analysis" : "sources";

  return (
    <div className="container max-w-6xl py-3 sm:py-4 lg:py-10 px-2 sm:px-4 animate-fade-in">
      {hydrating && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Restauration de votre dernière analyse…
        </div>
      )}
      {/* Header */}
      <div className="mb-4 sm:mb-6 flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="shrink-0 -ml-2"
          aria-label="Retour à RsearchEngine"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Retour</span>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <h2 className="font-display text-base sm:text-lg lg:text-2xl font-semibold text-foreground">
              Narrative Form Generator
            </h2>
          </div>
          <p className="text-[11px] sm:text-xs lg:text-sm text-muted-foreground">
            Transformez 1 à 4 vidéos YouTube ou transcriptions en une forme narrative réutilisable,
            puis générez des histoires originales jusqu'au script voix off.
          </p>
        </div>
      </div>

      {/* Bandeau d'introduction */}
      <div className="mb-4 sm:mb-6 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1.5 text-[11px] sm:text-xs lg:text-sm">
            <p className="font-medium text-foreground">
              Ce workflow extrait une <span className="text-primary">mécanique narrative transférable</span>,
              il ne copie jamais les vidéos sources.
            </p>
            <p className="text-muted-foreground">
              L'analyse identifie la structure, les patterns, le ton, le rythme et les règles d'écriture
              implicites de vos sources, pour les réutiliser sur des sujets entièrement nouveaux.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Important :</span> les transcriptions sont la
              donnée principale. Les URLs YouTube ne servent qu'à tenter une récupération automatique —
              vous pourrez toujours coller une transcription manuellement. <span className="text-foreground">3 sources
              sont recommandées pour un résultat optimal</span> (1 minimum, 4 maximum).
            </p>
          </div>
        </div>
      </div>

      {/* Progression du workflow */}
      <div className="mb-6 sm:mb-8 rounded-lg border border-border bg-card p-3 sm:p-4 lg:p-5">
        <h3 className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 sm:mb-4">
          Étapes du workflow
        </h3>
        <NarrativeWorkflowProgress
          currentStep={currentStep}
          completedSteps={completedSteps}
        />
      </div>

      {/* Étape 1 : gestion des sources (1 à 4) */}
      <div className="rounded-lg border border-border bg-card p-3 sm:p-4 lg:p-5">
        <SourceManager onAnalyze={runAnalysis} />
      </div>

      {/* Étape 2 : analyse narrative IA */}
      {analysisStatus !== "idle" && (
        <div className="mt-4 sm:mt-5">
          <NarrativeAnalysisPanel
            status={analysisStatus}
            errorMessage={analysisError}
            result={analysisResult}
            sourcesUsed={sourcesUsed}
            onRetry={handleRetry}
            onSaveAsForm={handleSaveAsForm}
            onGeneratePitches={handleGeneratePitches}
            saving={saving}
          />
        </div>
      )}

      {/* Étape 3 : lots de pitchs */}
      {(pitchesVisible || (analysisStatus === "success" && analysisId)) && (
        <div id="story-pitches-panel" className="mt-4 sm:mt-5">
          <StoryPitchesPanel
            analysisId={analysisId}
            disabled={!analysisId}
            autoTrigger={pitchesAutoTrigger}
            onAutoTriggerHandled={() => setPitchesAutoTrigger(false)}
            analysisPayload={analysisResult}
          />
        </div>
      )}

      {/* Dialog de sauvegarde — Étape 9 */}
      <SaveNarrativeFormDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultName={analysisResult?.title || ""}
        defaultDescription={
          analysisResult?.summary
            ? analysisResult.summary.split("\n")[0].slice(0, 140)
            : ""
        }
        saving={saving}
        onSave={handleConfirmSave}
      />
    </div>
  );
}