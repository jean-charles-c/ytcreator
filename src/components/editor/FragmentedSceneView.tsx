import { useMemo } from "react";
import type { NormalisedScene, Fragment as ManifestFragment } from "./visualPromptTypes";
import type { Tables } from "@/integrations/supabase/types";

type Shot = Tables<"shots">;

interface FragmentedSceneViewProps {
  normalisedScene: NormalisedScene;
  /** Raw DB shots for this scene (used by ShotCard) */
  dbShots: Shot[];
  /** Render function for a single shot card */
  renderShot: (shot: Shot, globalIndex: number, isLast: boolean) => React.ReactNode;
  /** First global shot index for this scene */
  startGlobalIndex: number;
}

/**
 * Renders fragments and their linked shots for a single scene.
 */
export default function FragmentedSceneView({
  normalisedScene,
  dbShots,
  renderShot,
  startGlobalIndex,
}: FragmentedSceneViewProps) {
  const shotMap = useMemo(() => {
    const map = new Map<string, Shot>();
    for (const s of dbShots) map.set(s.id, s);
    return map;
  }, [dbShots]);

  const isSingle = normalisedScene.shots.length <= 1;

  return (
    <div className="space-y-2 sm:space-y-3">
      {/* Fragment mapping header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {isSingle ? "1 fragment" : `${normalisedScene.fragments.length} fragments`}
        </span>
        <span className="text-[10px] text-muted-foreground">→</span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {normalisedScene.shots.filter((s) => s.status === "active").length} shot{normalisedScene.shots.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Fragments with linked shots */}
      {normalisedScene.fragments.map((frag, fragIdx) => {
        const normShot = normalisedScene.shots.find((s) =>
          s.fragmentIds.includes(frag.fragmentId) && s.status === "active"
        );
        const dbShot = normShot ? shotMap.get(normShot.shotId) : undefined;
        const globalIdx = normShot ? startGlobalIndex + normalisedScene.shots.filter((s) => s.status === "active").indexOf(normShot) : startGlobalIndex + fragIdx;
        const isLastActive = normShot
          ? normalisedScene.shots.filter((s) => s.status === "active").indexOf(normShot) === normalisedScene.shots.filter((s) => s.status === "active").length - 1
          : true;

        return (
          <div key={frag.fragmentId} className="rounded border border-border/50 bg-secondary/20 p-2 sm:p-3 space-y-2">
            {/* Fragment text */}
            <div className="flex items-start gap-2">
              <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold text-emerald-500">
                {globalIdx}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground leading-relaxed italic break-words">"{frag.text}"</p>
                {dbShot?.source_sentence_fr && (
                  <p className="text-xs text-muted-foreground leading-relaxed italic break-words mt-0.5">🇫🇷 "{dbShot.source_sentence_fr}"</p>
                )}
                <span className="text-[9px] text-muted-foreground mt-0.5 block">
                  Fragment {frag.order + 1} • {normShot?.kind === "merged" ? "Merged" : normShot?.kind === "single" ? "Single" : "Split"}
                </span>
              </div>
            </div>

            {/* Linked shot */}
            {dbShot ? (
              <div className="sm:pl-7">
                {renderShot(dbShot, globalIdx, isLastActive)}
              </div>
            ) : (
              <div className="sm:pl-7 rounded border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-[10px] text-destructive">⚠ Aucun shot lié à ce fragment</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
