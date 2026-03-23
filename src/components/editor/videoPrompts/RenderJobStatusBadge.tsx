/**
 * RenderJobStatusBadge — Displays the current status of a render job inline.
 */

import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RenderJob } from "./renderPipelineClient";

interface RenderJobStatusBadgeProps {
  job: RenderJob | null;
}

const STATUS_CONFIG: Record<string, { icon: any; label: string; className: string }> = {
  queued: {
    icon: Clock,
    label: "En file",
    className: "bg-secondary text-muted-foreground",
  },
  processing: {
    icon: Loader2,
    label: "Rendu en cours…",
    className: "bg-primary/10 text-primary",
  },
  completed: {
    icon: CheckCircle2,
    label: "Terminé",
    className: "bg-green-500/10 text-green-600",
  },
  failed: {
    icon: XCircle,
    label: "Échoué",
    className: "bg-destructive/10 text-destructive",
  },
};

export default function RenderJobStatusBadge({ job }: RenderJobStatusBadgeProps) {
  if (!job) return null;

  const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
  const Icon = config.icon;
  const isSpinning = job.status === "processing";

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${config.className}`}
      >
        <Icon className={`h-3 w-3 ${isSpinning ? "animate-spin" : ""}`} />
        {config.label}
      </span>

      {job.status === "failed" && job.errorMessage && (
        <span className="text-[9px] text-destructive/70 truncate max-w-[150px]" title={job.errorMessage}>
          {job.errorMessage}
        </span>
      )}

      {job.status === "completed" && job.resultUrl && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[10px] px-1.5 text-primary"
          onClick={() => window.open(job.resultUrl!, "_blank")}
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Voir
        </Button>
      )}
    </div>
  );
}
