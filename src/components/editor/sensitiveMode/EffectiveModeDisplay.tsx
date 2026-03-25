/**
 * EffectiveModeDisplay — Shows the effectively applied sensitive mode level.
 * Clearly displays the resolved value after inheritance computation.
 */

import { cn } from "@/lib/utils";
import { type SensitiveLevel, SENSITIVE_LEVEL_META } from "./types";

interface EffectiveModeDisplayProps {
  /** The resolved effective level (null = no constraint) */
  effectiveLevel: SensitiveLevel | null;
  /** Compact inline display */
  compact?: boolean;
  className?: string;
}

export default function EffectiveModeDisplay({
  effectiveLevel,
  compact = false,
  className,
}: EffectiveModeDisplayProps) {
  if (effectiveLevel == null) {
    return compact ? null : (
      <span className={cn("text-[10px] text-muted-foreground italic", className)}>
        Pas de contrainte sensible
      </span>
    );
  }

  const meta = SENSITIVE_LEVEL_META[effectiveLevel];

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium text-foreground/80",
          className,
        )}
        title={`Mode effectif : ${meta.label} — ${meta.description}`}
      >
        <span>{meta.icon}</span>
        <span>N{effectiveLevel}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded border border-primary/20 bg-primary/5 px-2.5 py-1.5",
        className,
      )}
      role="status"
      aria-label={`Mode effectif : ${meta.label}`}
    >
      <span className="text-base">{meta.icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground">
          Niveau {effectiveLevel} — {meta.label}
        </p>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {meta.description}
        </p>
      </div>
    </div>
  );
}
