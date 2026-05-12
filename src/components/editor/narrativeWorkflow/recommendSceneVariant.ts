/**
 * Heuristique : recommande un variant stylistique de génération de scènes
 * (`default | shorter | more_dramatic | more_rhythmic | more_detailed`)
 * à partir des patterns / tone / rhythm détectés par l'analyse NFG.
 *
 * Renvoie également la raison textuelle pour affichage à l'utilisateur.
 */
export type SceneVariant =
  | "default"
  | "shorter"
  | "more_dramatic"
  | "more_rhythmic"
  | "more_detailed";

const VARIANT_LABEL: Record<SceneVariant, string> = {
  default: "Standard",
  shorter: "Plus court",
  more_dramatic: "Plus dramatique",
  more_rhythmic: "Plus rythmé",
  more_detailed: "Plus détaillé",
};

export function variantLabel(v: SceneVariant): string {
  return VARIANT_LABEL[v];
}

export function recommendSceneVariant(analysis: any | null | undefined): {
  variant: SceneVariant;
  reason: string;
} {
  if (!analysis) return { variant: "default", reason: "Aucune analyse — style équilibré." };
  const corpus = JSON.stringify({
    tone: analysis.tone ?? null,
    rhythm: analysis.rhythm ?? null,
    patterns: analysis.patterns ?? null,
    writing_rules: analysis.writing_rules ?? null,
  }).toLowerCase();

  if (/dramat|tendu|tens(e|ion)|enjeu|conflit|choc|haletant|suspense/.test(corpus)) {
    return {
      variant: "more_dramatic",
      reason: "Tension dramatique dominante détectée dans l'analyse.",
    };
  }
  if (/rythm|rapide|nerveux|brèv|punch|saccad|cut|montage serré|tempo/.test(corpus)) {
    return {
      variant: "more_rhythmic",
      reason: "Rythme soutenu / phrasé court détecté.",
    };
  }
  if (/dense|détaill|approfond|exhaust|riche|complet|immersif|long/.test(corpus)) {
    return {
      variant: "more_detailed",
      reason: "Style descriptif et approfondi détecté.",
    };
  }
  if (/concis|épur|minimal|sobre|économe|lent/.test(corpus)) {
    return {
      variant: "shorter",
      reason: "Écriture concise / épurée détectée.",
    };
  }
  return { variant: "default", reason: "Style équilibré recommandé." };
}