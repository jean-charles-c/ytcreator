/**
 * SensitiveModeSelector — Selects a sensitivity level (1–4) or "none".
 * Used at global, scene, and shot levels.
 */

import { cn } from "@/lib/utils";
import {
  type SensitiveLevel,
  SENSITIVE_LEVEL_META,
} from "./types";

interface SensitiveModeSelectorProps {
  /** Currently selected local level (null = no constraint / inheriting) */
  value: SensitiveLevel | null;
  /** Called when user picks a level or clears */
  onChange: (level: SensitiveLevel | null) => void;
  /** Compact mode for shot-level inline display */
  compact?: boolean;
  /** Disable interactions */
  disabled?: boolean;
}

const LEVELS: (SensitiveLevel | null)[] = [null, 1, 2, 3, 4];

export default function SensitiveModeSelector({
  value,
  onChange,
  compact = false,
  disabled = false,
}: SensitiveModeSelectorProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {LEVELS.map((lvl) => {
          const isActive = value === lvl;
          const meta = lvl != null ? SENSITIVE_LEVEL_META[lvl] : null;
          return (
            <button
              key={lvl ?? "none"}
              onClick={() => !disabled && onChange(lvl)}
              disabled={disabled}
              title={meta ? `${meta.label} — ${meta.description}` : "Aucune contrainte"}
              className={cn(
                "h-6 px-1.5 rounded text-[10px] font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              {lvl != null ? meta!.icon : "∅"}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        {LEVELS.map((lvl) => {
          const isActive = value === lvl;
          const meta = lvl != null ? SENSITIVE_LEVEL_META[lvl] : null;
          return (
            <button
              key={lvl ?? "none"}
              onClick={() => !disabled && onChange(lvl)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded border text-xs font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-primary/30",
                disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              <span>{lvl != null ? meta!.icon : "∅"}</span>
              <span className="hidden sm:inline">{lvl != null ? meta!.label : "Aucun"}</span>
            </button>
          );
        })}
      </div>
      {value != null && (
        <p className="text-[10px] text-muted-foreground leading-relaxed pl-0.5">
          {SENSITIVE_LEVEL_META[value].description}
        </p>
      )}
    </div>
  );
}
