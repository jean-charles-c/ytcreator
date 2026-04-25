import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import NarrativeWorkflowProgress from "./NarrativeWorkflowProgress";
import SourceManager, { type NarrativeSourceRow } from "./SourceManager";
import NarrativeAnalysisPanel, { type AnalysisPayload } from "./NarrativeAnalysisPanel";
import { supabase } from "@/integrations/supabase/client";

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
export default function NarrativeWorkflowView({ onBack }: NarrativeWorkflowViewProps) {
  const [analysisStatus, setAnalysisStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisPayload | null>(null);
  const [sourcesUsed, setSourcesUsed] = useState<number | undefined>();
  const [lastSources, setLastSources] = useState<NarrativeSourceRow[]>([]);

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
        { body: { source_ids: sources.map((s) => s.id) } },
      );
      if (error) throw error;
      if (!data?.ok) {
        throw new Error(data?.error || "Analyse échouée");
      }
      setAnalysisResult(data.analysis as AnalysisPayload);
      setSourcesUsed(data.sources_used);
      setAnalysisStatus("success");
      toast.success("Analyse narrative terminée");
    } catch (e: any) {
      console.error("analyze error", e);
      const msg = e?.message || "Erreur lors de l'analyse";
      setAnalysisError(msg);
      setAnalysisStatus("error");
      toast.error(msg);
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (lastSources.length > 0) runAnalysis(lastSources);
  }, [lastSources, runAnalysis]);

  const completedSteps = analysisStatus === "success" ? ["sources" as const] : [];
  const currentStep = analysisStatus === "success" ? "analysis" : "sources";

  return (
    <div className="container max-w-6xl py-3 sm:py-4 lg:py-10 px-2 sm:px-4 animate-fade-in">
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
          currentStep={currentStep as any}
          completedSteps={completedSteps as any}
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
          />
        </div>
      )}
    </div>
  );
}