import { ArrowLeft, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import NarrativeWorkflowProgress from "./NarrativeWorkflowProgress";
import { NARRATIVE_WORKFLOW_STEPS } from "./NarrativeWorkflowSteps";

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
        <NarrativeWorkflowProgress currentStep="sources" completedSteps={[]} />
      </div>

      {/* Placeholder pour la suite du workflow */}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 sm:p-10 text-center">
        <Sparkles className="h-6 w-6 mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm sm:text-base font-medium text-foreground mb-1">
          Étape 1 : {NARRATIVE_WORKFLOW_STEPS[0].label}
        </h3>
        <p className="text-[11px] sm:text-xs lg:text-sm text-muted-foreground max-w-md mx-auto">
          La gestion détaillée des sources (1 à 4) sera disponible à l'étape suivante du build.
        </p>
      </div>
    </div>
  );
}