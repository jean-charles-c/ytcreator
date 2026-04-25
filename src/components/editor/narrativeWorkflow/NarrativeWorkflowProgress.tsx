import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NARRATIVE_WORKFLOW_STEPS,
  type NarrativeWorkflowStepId,
} from "./NarrativeWorkflowSteps";

interface NarrativeWorkflowProgressProps {
  /** Étape actuellement active. */
  currentStep: NarrativeWorkflowStepId;
  /** Étapes déjà validées. */
  completedSteps?: NarrativeWorkflowStepId[];
}

/**
 * Bandeau horizontal de progression du workflow Narrative Form Generator.
 * Style éditorial : numéros, ligne de liaison, état explicite (à venir / actif / fait).
 */
export default function NarrativeWorkflowProgress({
  currentStep,
  completedSteps = [],
}: NarrativeWorkflowProgressProps) {
  const currentIndex = NARRATIVE_WORKFLOW_STEPS.findIndex((s) => s.id === currentStep);

  return (
    <ol className="flex flex-wrap items-start gap-y-3 gap-x-1 sm:gap-x-2">
      {NARRATIVE_WORKFLOW_STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id) || index < currentIndex;
        const isActive = step.id === currentStep;
        const isPending = !isCompleted && !isActive;

        return (
          <li
            key={step.id}
            className="flex items-center gap-1 sm:gap-2 min-w-0"
            aria-current={isActive ? "step" : undefined}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                  isCompleted && "bg-primary text-primary-foreground",
                  isActive && "bg-primary/15 text-primary ring-2 ring-primary",
                  isPending && "bg-muted text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-[11px] sm:text-xs font-medium truncate max-w-[110px]",
                  isActive && "text-foreground",
                  isCompleted && "text-foreground",
                  isPending && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < NARRATIVE_WORKFLOW_STEPS.length - 1 && (
              <span
                className={cn(
                  "hidden sm:inline-block h-px w-4 sm:w-6 lg:w-8 shrink-0 transition-colors",
                  isCompleted ? "bg-primary" : "bg-border",
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}