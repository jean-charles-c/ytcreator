import type { AnalysisPayload } from "./NarrativeAnalysisPanel";

/**
 * Étape 9 — Construit un system_prompt prêt à l'emploi pour ScriptCreator v2
 * à partir d'une analyse narrative validée.
 *
 * Le format imite l'esprit des prompts natifs (Enquête, Essai…) : injonction
 * claire au modèle + règles + anti-patterns.
 */
export function buildCustomFormPrompt(
  analysis: AnalysisPayload,
  userNotes?: string,
): string {
  const lines: string[] = [];

  const title = (analysis.title || "FORME PERSONNALISÉE").trim();
  lines.push(
    `Tu écris dans la forme « ${title} ». Cette forme a été extraite par analyse de sources de référence — respecte sa mécanique sans copier les sources.`,
  );
  lines.push("");

  if (analysis.summary) {
    lines.push("L'énergie de cette forme :");
    lines.push(analysis.summary.trim());
    lines.push("");
  }

  if (analysis.structure) {
    const s = analysis.structure;
    lines.push("Structure narrative :");
    if (s.archetype) lines.push(`- Archétype : ${s.archetype}`);
    if (s.opening_strategy) lines.push(`- Ouverture : ${s.opening_strategy}`);
    if (s.closing_strategy) lines.push(`- Clôture : ${s.closing_strategy}`);
    if (s.beats && s.beats.length > 0) {
      lines.push("- Respiration (beats) :");
      s.beats.forEach((b, i) => {
        const placement = typeof b.placement_pct === "number" ? ` (~${Math.round(b.placement_pct)}%)` : "";
        lines.push(`  ${String(i + 1).padStart(2, "0")}. ${b.name}${placement} — ${b.role}`);
      });
    }
    lines.push("");
  }

  if (analysis.patterns && analysis.patterns.length > 0) {
    lines.push("Patterns transférables à appliquer :");
    analysis.patterns.forEach((p) => {
      lines.push(`- ${p.name} : ${p.description}`);
    });
    lines.push("");
  }

  if (analysis.tone) {
    lines.push("Ton :");
    if (analysis.tone.register) lines.push(`- Registre : ${analysis.tone.register}`);
    if (analysis.tone.narrator_posture) lines.push(`- Posture du narrateur : ${analysis.tone.narrator_posture}`);
    if (analysis.tone.emotional_palette && analysis.tone.emotional_palette.length > 0) {
      lines.push(`- Palette émotionnelle : ${analysis.tone.emotional_palette.join(", ")}`);
    }
    lines.push("");
  }

  if (analysis.rhythm) {
    lines.push("Rythme :");
    if (analysis.rhythm.pacing) lines.push(`- Cadence : ${analysis.rhythm.pacing}`);
    if (analysis.rhythm.sentence_length) lines.push(`- Phrases : ${analysis.rhythm.sentence_length}`);
    if (analysis.rhythm.variations) lines.push(`- Variations : ${analysis.rhythm.variations}`);
    lines.push("");
  }

  if (analysis.writing_rules && analysis.writing_rules.length > 0) {
    lines.push("Règles d'écriture implicites :");
    analysis.writing_rules.forEach((r) => {
      lines.push(`- ${r.rule}${r.rationale ? ` — ${r.rationale}` : ""}`);
    });
    lines.push("");
  }

  if (analysis.recommendations) {
    if (analysis.recommendations.do && analysis.recommendations.do.length > 0) {
      lines.push("À faire :");
      analysis.recommendations.do.forEach((d) => lines.push(`- ${d}`));
      lines.push("");
    }
    if (analysis.recommendations.avoid && analysis.recommendations.avoid.length > 0) {
      lines.push("Anti-patterns à fuir :");
      analysis.recommendations.avoid.forEach((a) => lines.push(`- ${a}`));
      lines.push("");
    }
  }

  if (userNotes && userNotes.trim()) {
    lines.push("Notes spécifiques de l'auteur (priorité absolue) :");
    lines.push(userNotes.trim());
    lines.push("");
  }

  lines.push(
    "Important : tu transfères cette mécanique à un sujet ENTIÈREMENT NOUVEAU. Ne reproduis jamais les exemples ou contenus des sources d'origine.",
  );

  return lines.join("\n").trim();
}

/**
 * Construit la "narrative_signature" persistée pour pouvoir reconstruire
 * un prompt ultérieurement si l'analyse source est supprimée.
 */
export function buildNarrativeSignature(analysis: AnalysisPayload, userNotes?: string) {
  return {
    title: analysis.title ?? null,
    summary: analysis.summary ?? null,
    confidence_level: analysis.confidence_level ?? null,
    structure: analysis.structure ?? null,
    patterns: analysis.patterns ?? null,
    tone: analysis.tone ?? null,
    rhythm: analysis.rhythm ?? null,
    writing_rules: analysis.writing_rules ?? null,
    recommendations: analysis.recommendations ?? null,
    variations: analysis.variations ?? null,
    user_notes: userNotes ?? null,
  };
}
