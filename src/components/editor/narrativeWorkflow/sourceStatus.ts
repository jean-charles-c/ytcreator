/**
 * Étape 6 — Statuts sémantiques d'une `narrative_source`.
 *
 * La table `narrative_sources` stocke un champ `status` libre (text). Pour
 * éviter une migration intrusive et garder la compatibilité avec l'étape 5,
 * on calcule ici un statut sémantique dérivé à partir des champs métier
 * (`youtube_url`, `transcript`, `fetch_status`).
 *
 * `fetch_status` (déjà présent en base) sert à mémoriser le résultat de la
 * tentative d'extraction automatique :
 *   - `pending`         : pas encore tenté
 *   - `fetching`        : extraction en cours
 *   - `auto_fetched`    : extraction réussie (transcription présente)
 *   - `failed`          : extraction échouée (manuel requis)
 *   - `manual_required` : alias explicite pour fallback manuel
 *   - `ready`           : transcription validée (manuelle ou auto)
 */

export type SourceSemanticStatus =
  | "empty"
  | "url_added"
  | "fetching_transcript"
  | "transcript_auto_fetched"
  | "fetch_failed"
  | "manual_transcript_required"
  | "manual_transcript_added"
  | "ready_for_analysis";

export interface SourceLike {
  youtube_url: string | null;
  transcript: string | null;
  fetch_status: string | null;
  transcript_source?: string | null;
}

/** Calcule le statut sémantique d'une source. */
export function getSourceSemanticStatus(s: SourceLike): SourceSemanticStatus {
  const hasUrl = !!s.youtube_url?.trim();
  const hasTranscript = !!s.transcript && s.transcript.trim().length >= 50;
  const fs = (s.fetch_status ?? "pending").toLowerCase();

  if (hasTranscript) {
    if (fs === "auto_fetched" && s.transcript_source !== "manual") {
      return "transcript_auto_fetched";
    }
    if (s.transcript_source === "manual") return "manual_transcript_added";
    return "ready_for_analysis";
  }

  if (fs === "fetching") return "fetching_transcript";
  if (fs === "failed" || fs === "manual_required") {
    return hasUrl ? "fetch_failed" : "manual_transcript_required";
  }
  if (hasUrl) return "url_added";
  return "empty";
}

/** Une source est-elle prête pour l'analyse narrative ? */
export function isSourceAnalyzable(s: SourceLike): boolean {
  return !!s.transcript && s.transcript.trim().length >= 50;
}

export const STATUS_LABELS: Record<
  SourceSemanticStatus,
  { label: string; tone: "ok" | "warn" | "error" | "muted" | "info" }
> = {
  empty: { label: "Source vide", tone: "muted" },
  url_added: { label: "URL ajoutée — transcription requise", tone: "warn" },
  fetching_transcript: { label: "Extraction en cours…", tone: "info" },
  transcript_auto_fetched: { label: "Transcription extraite", tone: "ok" },
  fetch_failed: { label: "Extraction échouée — collez la transcription", tone: "error" },
  manual_transcript_required: { label: "Transcription manuelle requise", tone: "warn" },
  manual_transcript_added: { label: "Transcription manuelle prête", tone: "ok" },
  ready_for_analysis: { label: "Prête pour l'analyse", tone: "ok" },
};