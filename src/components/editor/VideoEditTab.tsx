import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Film,
  Layers,
  Clapperboard,
  ImageIcon,
  Volume2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Scene = Tables<"scenes">;
type Shot = Tables<"shots">;

interface AssetCheck {
  label: string;
  icon: React.ElementType;
  status: "valid" | "missing" | "warning" | "loading";
  detail: string;
  count?: number;
  total?: number;
}

interface VideoEditTabProps {
  projectId: string | null;
  scenes: Scene[];
  shots: Shot[];
}

const STATUS_CONFIG = {
  valid: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    label: "OK",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    label: "Partiel",
  },
  missing: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
    label: "Manquant",
  },
  loading: {
    icon: Loader2,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-border",
    label: "Chargement…",
  },
};

export default function VideoEditTab({ projectId, scenes, shots }: VideoEditTabProps) {
  const [audioFiles, setAudioFiles] = useState<Tables<"vo_audio_history">[]>([]);
  const [loadingAudio, setLoadingAudio] = useState(true);

  // Fetch available audio files for this project
  useEffect(() => {
    if (!projectId) {
      setLoadingAudio(false);
      return;
    }

    const fetchAudio = async () => {
      setLoadingAudio(true);
      const { data } = await supabase
        .from("vo_audio_history")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      setAudioFiles(data ?? []);
      setLoadingAudio(false);
    };

    fetchAudio();
  }, [projectId]);

  // Compute asset checks
  const shotsWithImage = shots.filter((s) => s.image_url);
  const shotsWithSentence = shots.filter((s) => s.source_sentence || s.source_sentence_fr);

  const checks: AssetCheck[] = [
    {
      label: "Segmentation narrative",
      icon: Layers,
      status: scenes.length > 0 ? "valid" : "missing",
      detail:
        scenes.length > 0
          ? `${scenes.length} scène${scenes.length > 1 ? "s" : ""} détectée${scenes.length > 1 ? "s" : ""}`
          : "Aucune scène segmentée",
      count: scenes.length,
    },
    {
      label: "Liste des shots",
      icon: Clapperboard,
      status: shots.length > 0 ? "valid" : "missing",
      detail:
        shots.length > 0
          ? `${shots.length} shot${shots.length > 1 ? "s" : ""} généré${shots.length > 1 ? "s" : ""}`
          : "Aucun shot généré",
      count: shots.length,
    },
    {
      label: "Phrase associée par shot",
      icon: Film,
      status:
        shots.length === 0
          ? "missing"
          : shotsWithSentence.length === shots.length
          ? "valid"
          : shotsWithSentence.length > 0
          ? "warning"
          : "missing",
      detail:
        shots.length === 0
          ? "Aucun shot disponible"
          : `${shotsWithSentence.length}/${shots.length} shots avec phrase associée`,
      count: shotsWithSentence.length,
      total: shots.length,
    },
    {
      label: "Visuel par shot",
      icon: ImageIcon,
      status:
        shots.length === 0
          ? "missing"
          : shotsWithImage.length === shots.length
          ? "valid"
          : shotsWithImage.length > 0
          ? "warning"
          : "missing",
      detail:
        shots.length === 0
          ? "Aucun shot disponible"
          : `${shotsWithImage.length}/${shots.length} shots avec visuel`,
      count: shotsWithImage.length,
      total: shots.length,
    },
    {
      label: "Audio narration",
      icon: Volume2,
      status: loadingAudio ? "loading" : audioFiles.length > 0 ? "valid" : "missing",
      detail: loadingAudio
        ? "Vérification…"
        : audioFiles.length > 0
        ? `${audioFiles.length} fichier${audioFiles.length > 1 ? "s" : ""} audio disponible${audioFiles.length > 1 ? "s" : ""}`
        : "Aucun audio généré",
      count: audioFiles.length,
    },
  ];

  const allValid = checks.every((c) => c.status === "valid");
  const hasBlocking = checks.some((c) => c.status === "missing");
  const validCount = checks.filter((c) => c.status === "valid").length;

  return (
    <div className="container max-w-4xl py-4 sm:py-6 lg:py-10 px-3 sm:px-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Film className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg sm:text-xl lg:text-2xl font-semibold text-foreground">
          VidéoEdit
        </h2>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground mb-6 sm:mb-8">
        Assemblez vos assets en pré-montage vidéo. Vérifiez la complétude avant de générer la timeline.
      </p>

      {/* Global status summary */}
      <div
        className={`rounded-lg border p-4 mb-6 flex items-center gap-3 ${
          allValid
            ? "border-emerald-400/30 bg-emerald-400/5"
            : hasBlocking
            ? "border-red-400/30 bg-red-400/5"
            : "border-amber-400/30 bg-amber-400/5"
        }`}
      >
        {allValid ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
        ) : hasBlocking ? (
          <XCircle className="h-5 w-5 text-red-400 shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
        )}
        <div>
          <p className="text-sm font-medium text-foreground">
            {allValid
              ? "Tous les assets sont prêts"
              : hasBlocking
              ? "Des assets sont manquants"
              : "Certains assets sont incomplets"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {validCount}/{checks.length} vérifications passées
          </p>
        </div>
      </div>

      {/* AssetStatusPanel */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          AssetStatusPanel
        </h3>
        {checks.map((check, i) => {
          const cfg = STATUS_CONFIG[check.status];
          const StatusIcon = cfg.icon;

          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border p-3 sm:p-4 transition-colors ${cfg.border} ${cfg.bg}`}
            >
              <div className={`flex items-center justify-center h-9 w-9 rounded-md ${cfg.bg} shrink-0`}>
                <check.icon className={`h-4 w-4 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{check.label}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}
                  >
                    <StatusIcon className={`h-2.5 w-2.5 ${check.status === "loading" ? "animate-spin" : ""}`} />
                    {cfg.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{check.detail}</p>
              </div>

              {/* Progress bar for partial checks */}
              {check.total !== undefined && check.total > 0 && (
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        check.status === "valid"
                          ? "bg-emerald-400"
                          : check.status === "warning"
                          ? "bg-amber-400"
                          : "bg-red-400"
                      }`}
                      style={{ width: `${(check.count! / check.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                    {check.count}/{check.total}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Placeholder for future timeline assembly */}
      {allValid && (
        <div className="mt-8 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-6 flex flex-col items-center gap-3">
          <Film className="h-8 w-8 text-primary/40" />
          <p className="text-sm text-muted-foreground text-center">
            Tous les assets sont prêts. La génération de timeline sera disponible à l'étape suivante.
          </p>
        </div>
      )}
    </div>
  );
}
