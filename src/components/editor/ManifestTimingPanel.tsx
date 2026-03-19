import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import type { VisualPromptManifest } from "./visualPromptTypes";
import type { ShotTimepoint } from "./timelineAssembly";
import { buildManifestTiming } from "./manifestTiming";
import ManifestTimingTable from "./ManifestTimingTable";

interface ManifestTimingPanelProps {
  projectId: string;
  manifest: VisualPromptManifest;
}

/**
 * Loads the latest VO audio for the project and displays the manifest timing table.
 */
export default function ManifestTimingPanel({ projectId, manifest }: ManifestTimingPanelProps) {
  const [loading, setLoading] = useState(true);
  const [timing, setTiming] = useState<ReturnType<typeof buildManifestTiming> | null>(null);
  const [audioLabel, setAudioLabel] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      // Fetch the latest VO audio for this project
      const { data: audioFiles } = await supabase
        .from("vo_audio_history")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled) return;

      if (!audioFiles || audioFiles.length === 0) {
        setTiming(null);
        setAudioLabel("");
        setLoading(false);
        return;
      }

      const audio = audioFiles[0];
      const timepoints = (audio.shot_timepoints as unknown as ShotTimepoint[] | null) ?? null;
      const duration = audio.duration_estimate ?? 0;

      const result = buildManifestTiming(manifest, timepoints, duration);
      setTiming(result);
      setAudioLabel(`${audio.file_name} — ${duration.toFixed(1)}s`);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [projectId, manifest]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Chargement des données audio…</span>
      </div>
    );
  }

  if (!timing) {
    return (
      <p className="text-xs text-muted-foreground italic py-4">
        Aucun fichier audio VO trouvé pour ce projet. Générez une voix off d'abord.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {audioLabel && (
        <p className="text-[10px] text-muted-foreground">
          Audio : <span className="font-medium text-foreground">{audioLabel}</span>
        </p>
      )}
      <ManifestTimingTable timing={timing} />
    </div>
  );
}
