/**
 * BatchActionBar — Floating bar for multi-select operations.
 */

import {
  Trash2,
  Download,
  User,
  X,
  CheckSquare,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SettingsProfile } from "./types";

interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  profiles: SettingsProfile[];
  onApplyProfile: (profileId: string) => void;
  onDeleteSelected: () => void;
  onExportSelected: () => void;
  onRenderSelected: () => void;
  renderSubmitting: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export default function BatchActionBar({
  selectedCount,
  totalCount,
  profiles,
  onApplyProfile,
  onDeleteSelected,
  onExportSelected,
  onRenderSelected,
  renderSubmitting,
  onSelectAll,
  onClearSelection,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 mx-auto w-fit z-20 animate-fade-in">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card shadow-lg px-3 py-2">
        {/* Count */}
        <span className="flex items-center gap-1 text-xs font-medium text-foreground">
          <CheckSquare className="h-3.5 w-3.5 text-primary" />
          {selectedCount}/{totalCount}
        </span>

        <div className="w-px h-5 bg-border" />

        {/* Select all */}
        {selectedCount < totalCount && (
          <Button variant="ghost" size="sm" onClick={onSelectAll} className="h-7 text-[11px] px-2">
            Tout
          </Button>
        )}

        {/* Apply profile */}
        {profiles.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onApplyProfile(profiles[0].id)}
            className="h-7 text-[11px] px-2"
          >
            <User className="h-3 w-3" />
            Profil
          </Button>
        )}

        {/* Export */}
        <Button variant="outline" size="sm" onClick={onExportSelected} className="h-7 text-[11px] px-2">
          <Download className="h-3 w-3" />
          Export
        </Button>

        {/* Delete */}
        <Button
          variant="outline"
          size="sm"
          onClick={onDeleteSelected}
          className="h-7 text-[11px] px-2 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
          Supprimer
        </Button>

        <div className="w-px h-5 bg-border" />

        {/* Clear */}
        <Button variant="ghost" size="sm" onClick={onClearSelection} className="h-7 text-[11px] px-1.5">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
