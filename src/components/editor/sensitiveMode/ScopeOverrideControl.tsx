/**
 * ScopeOverrideControl — Composite control combining:
 *   - SensitiveModeSelector
 *   - InheritanceStateBadge
 *   - EffectiveModeDisplay
 *   - Reset to inherited button
 *
 * Used at each hierarchy level (global, scene, shot).
 */

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SensitiveLevel, SensitiveModeValue } from "./types";
import { computeEffective } from "./types";
import SensitiveModeSelector from "./SensitiveModeSelector";
import InheritanceStateBadge from "./InheritanceStateBadge";
import EffectiveModeDisplay from "./EffectiveModeDisplay";

interface ScopeOverrideControlProps {
  /** Current value at this scope */
  value: SensitiveModeValue;
  /** Called when user changes the local level */
  onChangeLocal: (level: SensitiveLevel | null) => void;
  /** Label of the parent scope for inheritance display */
  parentLabel?: string;
  /** Scope label for ARIA */
  scopeLabel: string;
  /** Compact display for shot-level */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function ScopeOverrideControl({
  value,
  onChangeLocal,
  parentLabel,
  scopeLabel,
  compact = false,
  disabled = false,
  className,
}: ScopeOverrideControlProps) {
  const { effectiveLevel, state } = computeEffective(value);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 flex-wrap", className)} aria-label={`Mode sensible — ${scopeLabel}`}>
        <SensitiveModeSelector value={value.localLevel} onChange={onChangeLocal} compact disabled={disabled} />
        <InheritanceStateBadge state={state} parentLabel={parentLabel} />
        <EffectiveModeDisplay effectiveLevel={effectiveLevel} compact />
        {value.localLevel != null && (
          <button
            onClick={() => onChangeLocal(null)}
            disabled={disabled}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Réinitialiser à l'héritage"
            aria-label="Réinitialiser à l'héritage"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)} aria-label={`Mode sensible — ${scopeLabel}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Mode sensible
        </span>
        <InheritanceStateBadge state={state} parentLabel={parentLabel} />
        {value.localLevel != null && (
          <button
            onClick={() => onChangeLocal(null)}
            disabled={disabled}
            className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title="Réinitialiser à l'héritage"
          >
            <X className="h-3 w-3" />
            <span className="hidden sm:inline">Réinitialiser</span>
          </button>
        )}
      </div>
      <SensitiveModeSelector value={value.localLevel} onChange={onChangeLocal} disabled={disabled} />
      <EffectiveModeDisplay effectiveLevel={effectiveLevel} />
    </div>
  );
}
