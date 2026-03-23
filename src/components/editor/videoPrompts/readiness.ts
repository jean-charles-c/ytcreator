/**
 * Readiness — Validation warnings and readiness statuses for VideoPrompts.
 */

import type { VideoPrompt } from "./types";

export type ReadinessLevel =
  | "empty"        // prompt vide
  | "incomplete"   // champs critiques manquants
  | "generated"    // importé/généré, non modifié
  | "edited"       // modifié manuellement
  | "ready"        // marqué prêt
  | "sent";        // envoyé au pipeline

export function getPromptWarnings(prompt: VideoPrompt): string[] {
  const warnings: string[] = [];
  if (!prompt.prompt || prompt.prompt.trim().length === 0) {
    warnings.push("Prompt vide");
  }
  if (!prompt.durationSec || prompt.durationSec <= 0) {
    warnings.push("Durée absente ou invalide");
  }
  if (!prompt.aspectRatio) {
    warnings.push("Ratio absent");
  }
  if (!prompt.style || prompt.style.trim().length === 0) {
    warnings.push("Style visuel non défini");
  }
  return warnings;
}

export function getReadinessLevel(prompt: VideoPrompt): ReadinessLevel {
  // Sent to pipeline
  if (prompt.status === "queued" || prompt.status === "rendering" || prompt.status === "done") {
    return "sent";
  }
  // Marked ready
  if (prompt.status === "ready") {
    return "ready";
  }
  // Empty prompt
  if (!prompt.prompt || prompt.prompt.trim().length === 0) {
    return "empty";
  }
  // Incomplete
  if (getPromptWarnings(prompt).length > 0) {
    return "incomplete";
  }
  // Manually edited
  if (prompt.isManuallyEdited) {
    return "edited";
  }
  return "generated";
}

export function getReadinessLabel(prompt: VideoPrompt): string {
  const level = getReadinessLevel(prompt);
  const labels: Record<ReadinessLevel, string> = {
    empty: "Vide",
    incomplete: "Incomplet",
    generated: "Généré",
    edited: "Modifié",
    ready: "Prêt",
    sent: "Envoyé",
  };
  return labels[level];
}

export function getReadinessColor(prompt: VideoPrompt): string {
  const level = getReadinessLevel(prompt);
  const colors: Record<ReadinessLevel, string> = {
    empty: "bg-muted text-muted-foreground",
    incomplete: "bg-destructive/10 text-destructive",
    generated: "bg-secondary text-secondary-foreground",
    edited: "bg-primary/10 text-primary",
    ready: "bg-primary/20 text-primary",
    sent: "bg-accent text-accent-foreground",
  };
  return colors[level];
}
