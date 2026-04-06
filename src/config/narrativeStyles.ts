export interface NarrativeStyle {
  id: string;
  label: string;
  description: string;
}

export const NARRATIVE_STYLES: NarrativeStyle[] = [
  { id: "storytelling", label: "Storytelling", description: "Récit captivant avec arc narratif classique" },
  { id: "pedagogical", label: "Pédagogique / explicatif", description: "Clair, structuré, orienté compréhension" },
  { id: "conversational", label: "Conversationnel", description: "Ton naturel, comme une discussion entre amis" },
  { id: "dramatic", label: "Dramatique / suspense", description: "Tension narrative, révélations progressives" },
  { id: "punchy", label: "Rapide / punchy", description: "Phrases courtes, rythme soutenu, impact direct" },
  { id: "humorous", label: "Humoristique", description: "Ton léger, analogies décalées, touches d'humour" },
  { id: "documentary", label: "Documentaire / immersif", description: "Style cinématique, descriptions visuelles riches" },
  { id: "journalistic", label: "Journalistique / factuel", description: "Factuel, précis, style reportage" },
  { id: "motivational", label: "Motivationnel / inspirant", description: "Énergie positive, appel à l'action, inspiration" },
  { id: "analytical", label: "Analytique / critique", description: "Analyse en profondeur, argumentation structurée" },
  { id: "tutorial", label: "Tutoriel / pratique", description: "Guide actionnable, étapes concrètes, résolution de problème" },
  { id: "opinion", label: "Opinion / essai", description: "Thèse affirmée, argumentation rigoureuse, prise de position" },
  { id: "interview", label: "Interview / dialogue", description: "Collision de perspectives, voix multiples, friction productive" },
  { id: "shock", label: "Choc / provocation", description: "Vérités inconfortables, preuves accumulées, confrontation directe" },
  { id: "philo", label: "Philo / grand public", description: "Philosophie accessible, questions profondes, langage quotidien" },
];

export const DEFAULT_NARRATIVE_STYLE_ID = "documentary";

export function getNarrativeStyleById(id: string): NarrativeStyle | undefined {
  return NARRATIVE_STYLES.find((s) => s.id === id);
}

export function getDefaultNarrativeStyle(): NarrativeStyle {
  return NARRATIVE_STYLES.find((s) => s.id === DEFAULT_NARRATIVE_STYLE_ID)!;
}
