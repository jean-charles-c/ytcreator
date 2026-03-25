/**
 * InheritanceStateBadge — Shows the inheritance state of a sensitive mode value.
 *
 * States:
 *   - "none"       → No constraint applied
 *   - "inherited"  → Inheriting from parent scope
 *   - "overridden" → Local override active
 */

import { cn } from "@/lib/utils";
import type { InheritanceState } from "./types";

interface InheritanceStateBadgeProps {
  state: InheritanceState;
  /** Parent scope label (e.g. "Global", "Scène 3") */
  parentLabel?: string;
  className?: string;
}

const STATE_CONFIG: Record<InheritanceState, { label: string; dotColor: string; bgColor: string; textColor: string }> = {
  none: {
    label: "Aucune contrainte",
    dotColor: "bg-muted-foreground/40",
    bgColor: "bg-secondary/50",
    textColor: "text-muted-foreground",
  },
  inherited: {
    label: "Hérité",
    dotColor: "bg-primary",
    bgColor: "bg-primary/10",
    textColor: "text-primary",
  },
  overridden: {
    label: "Surcharge locale",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-600",
  },
};

export default function InheritanceStateBadge({
  state,
  parentLabel,
  className,
}: InheritanceStateBadgeProps) {
  const config = STATE_CONFIG[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        config.bgColor,
        config.textColor,
        state === "none" ? "border-border" : state === "inherited" ? "border-primary/20" : "border-amber-500/20",
        className,
      )}
      role="status"
      aria-label={`État : ${config.label}${parentLabel ? ` de ${parentLabel}` : ""}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dotColor)} />
      <span>{config.label}</span>
      {state === "inherited" && parentLabel && (
        <span className="opacity-70">← {parentLabel}</span>
      )}
    </span>
  );
}
