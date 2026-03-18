import type { Tables } from "@/integrations/supabase/types";

type AudioFile = Tables<"vo_audio_history">;

interface ResolveSelectedAudioIdParams {
  currentSelectedAudioId: string | null;
  previousAudioFiles: AudioFile[];
  nextAudioFiles: AudioFile[];
}

export function resolveSelectedAudioId({
  currentSelectedAudioId,
  previousAudioFiles,
  nextAudioFiles,
}: ResolveSelectedAudioIdParams): string | null {
  const latestNextId = nextAudioFiles[0]?.id ?? null;

  if (!latestNextId) return null;
  if (!currentSelectedAudioId) return latestNextId;

  const selectionStillExists = nextAudioFiles.some((file) => file.id === currentSelectedAudioId);
  if (!selectionStillExists) return latestNextId;

  const previousLatestId = previousAudioFiles[0]?.id ?? null;
  const userWasFollowingLatest = previousLatestId !== null && currentSelectedAudioId === previousLatestId;

  return userWasFollowingLatest ? latestNextId : currentSelectedAudioId;
}
