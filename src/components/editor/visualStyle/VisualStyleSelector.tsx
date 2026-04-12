/**
 * VisualStyleSelector — Dropdown to pick a visual style.
 * No inheritance labels — just shows the effective style applied.
 */

import { VISUAL_STYLES, getVisualStyleById, type VisualStyleValue, computeEffective, DEFAULT_VISUAL_STYLE_ID } from "./types";
import { Palette } from "lucide-react";

interface VisualStyleSelectorProps {
  value: VisualStyleValue;
  onChange: (styleId: string | null) => void;
  scopeLabel: string;
  parentLabel?: string;
  compact?: boolean;
}

export default function VisualStyleSelector({
  value,
  onChange,
  scopeLabel,
  parentLabel,
  compact = false,
}: VisualStyleSelectorProps) {
  const { effectiveStyleId } = computeEffective(value);
  const effectiveStyle = effectiveStyleId ? getVisualStyleById(effectiveStyleId) : null;

  return (
    <div className={compact ? "flex items-center gap-1.5" : "space-y-1.5"}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {!compact && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Palette className="h-3 w-3" />
            Style visuel — {scopeLabel}
          </span>
        )}
        <select
          value={value.localStyleId ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[220px]"
        >
          <option value="">
            {value.inheritedStyleId && value.inheritedStyleId !== DEFAULT_VISUAL_STYLE_ID
              ? `↑ ${getVisualStyleById(value.inheritedStyleId)?.label || "Hérité"}`
              : "Aucun style imposé"}
          </option>
          {VISUAL_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {!compact && value.localStyleId != null && effectiveStyle && (
        <p className="text-[10px] text-muted-foreground pl-0.5">
          ✏️ Style imposé : {effectiveStyle.label}
        </p>
      )}
    </div>
  );
}
