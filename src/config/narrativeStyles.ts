export interface NarrativeStyle {
  id: string;
  label: string;
  description: string;
  /** Voice description for ScriptCreator v2 (4 axes: registre, cadence, présence narrateur, figures) */
  voice?: string;
}

export const NARRATIVE_STYLES: NarrativeStyle[] = [
  {
    id: "storytelling",
    label: "Storytelling",
    description: "Récit captivant avec arc narratif classique",
    voice: `Registre courant, jamais populaire. Le narrateur est présent mais invisible — il disparaît derrière les scènes.

Cadence : phrases moyennes à longues pour les scènes d'immersion, courtes pour les moments de tension. On sent le rythme de la respiration humaine.

Présence du narrateur : discrète. Le "je" est absent sauf si une voix-off explicite l'exige. On montre, on ne commente pas.

Figures et images : concrètes et précises. Une métaphore rare vaut mieux que dix images floues. Privilégier les détails sensoriels réels plutôt que les comparaisons inventées.

À bannir : ton lyrique désincarné, abstractions sur l'humanité ou le destin, phrases de clôture aphoristiques.`,
  },
  {
    id: "pedagogical",
    label: "Pédagogique / explicatif",
    description: "Clair, structuré, orienté compréhension",
    voice: `Registre courant et précis. Le narrateur est un guide patient qui sait où il va.

Cadence : régulière, prévisible dans le bon sens — on suit le fil sans effort. Phrases de longueur modérée. Une idée par phrase.

Présence du narrateur : discret mais présent. Il peut anticiper les questions du spectateur ("on pourrait croire que...", "la question c'est...").

Figures et images : analogies concrètes tirées du quotidien ou du domaine traité. Jamais de métaphores gratuites.

À bannir : jargon sans explication, ellipses abruptes, figures rhétoriques ostentatoires.`,
  },
  {
    id: "conversational",
    label: "Conversationnel",
    description: "Ton naturel, comme une discussion entre amis",
    voice: `Registre familier mais soigné. On parle à quelqu'un d'intelligent, pas à une audience.

Cadence : libre, proche de la parole spontanée. Phrases courtes qui s'enchaînent. Les digressions sont permises si elles servent le propos.

Présence du narrateur : assumée, chaleureuse. Le "je" ou le "on" sont naturels ici. Le narrateur peut exprimer ses doutes, ses surprises, son enthousiasme.

Figures et images : références du quotidien, humour léger bienvenu. On évite le vocabulaire guindé.

À bannir : ton de conférence, formules académiques, distance froide.`,
  },
  {
    id: "dramatic",
    label: "Dramatique / suspense",
    description: "Tension narrative, révélations progressives",
    voice: `Registre soutenu, tendu. Chaque phrase avance vers quelque chose.

Cadence : alternance entre phrases courtes et percutantes (tension) et phrases plus longues (accumulation). Le silence entre les idées est aussi une technique.

Présence du narrateur : effacée. La tension vient des faits, pas du commentaire. On ne dit jamais "c'est troublant" — on montre ce qui est troublant.

Figures et images : économie de moyens. Une image forte, choisie, plutôt que plusieurs. Les répétitions sont tolérées si elles construisent un effet.

À bannir : fausse tension ("et pourtant..."), dramatisation vide, révélations téléphonées.`,
  },
  {
    id: "punchy",
    label: "Rapide / punchy",
    description: "Phrases courtes, rythme soutenu, impact direct",
    voice: `Registre courant, direct, sans ornement.

Cadence : courte. Très courte. Une idée par phrase. Les transitions sont des coupes, pas des soudures.

Présence du narrateur : minimale. Chaque mot doit être utile. Pas de digressions, pas de parenthèses.

Figures et images : rares et précises. Un détail concret vaut mieux qu'une métaphore.

À bannir : phrases composées, subordonnées empilées, vocabulaire latent ou livresque.`,
  },
  {
    id: "humorous",
    label: "Humoristique",
    description: "Ton léger, analogies décalées, touches d'humour",
    voice: `Registre courant à familier. L'humour vient du décalage, pas de la blague.

Cadence : variée, avec des ruptures de ton calculées. La phrase courte après un long développement peut faire l'effet comique.

Présence du narrateur : très assumée. Il a un point de vue, il le défend avec légèreté. L'auto-dérision est permise.

Figures et images : analogies inattendues, comparaisons décalées, références culturelles légères. On évite le calembour facile et l'humour forcé.

À bannir : blagues explicites, ton condescendant, humour qui détruit la crédibilité factuelle.`,
  },
  {
    id: "documentary",
    label: "Documentaire / immersif",
    description: "Style cinématique, descriptions visuelles riches",
    voice: `Registre soutenu mais accessible. Le narrateur a du souffle.

Cadence : ample. Les phrases peuvent être longues quand elles portent une image. Les coupes sèches arrivent pour marquer un basculement.

Présence du narrateur : effacée. Il est la caméra. Il montre, il cadre, il ne commente pas.

Figures et images : visuelles, précises, liées au réel. "La salle est vide" plutôt que "le silence régnait". On décrit ce qu'une caméra pourrait filmer.

À bannir : commentaire éditorial explicite, vocabulaire abstrait non ancré, métaphores trop littéraires.`,
  },
  {
    id: "journalistic",
    label: "Journalistique / factuel",
    description: "Factuel, précis, style reportage",
    voice: `Registre neutre, sobre, rigoureux.

Cadence : efficace. Chaque phrase apporte une information. Pas de fioritures.

Présence du narrateur : effacée. Les faits parlent. Le narrateur ne trahit aucun jugement dans la formulation.

Figures et images : quasi-absentes sauf quand elles servent la clarté. Les chiffres et les citations directes sont préférés aux paraphrases.

À bannir : adjectifs superlatifs, jugements de valeur non sourcés, dramatisation.`,
  },
  {
    id: "motivational",
    label: "Motivationnel / inspirant",
    description: "Énergie positive, appel à l'action, inspiration",
    voice: `Registre courant, énergique, ancré dans le possible.

Cadence : dynamique. Phrases courtes à moyennes. Rythme ternaire parfois. Élan vers l'avant.

Présence du narrateur : assumée, engagée. Il s'adresse directement au spectateur. Le "vous" est permis.

Figures et images : images de mouvement, de transformation, de progression. On évite les clichés inspirationnels ("chaque jour est une chance...").

À bannir : langue de coach générique, superlatifs vides, promesses sans preuve.`,
  },
  {
    id: "analytical",
    label: "Analytique / critique",
    description: "Analyse en profondeur, argumentation structurée",
    voice: `Registre soutenu, rigoureux, sans être académique.

Cadence : progressive, construite. Chaque phrase prépare la suivante. Les phrases longues sont permises si elles portent une distinction importante.

Présence du narrateur : discret mais intellectuellement présent. Il peut nuancer, concéder, reformuler.

Figures et images : sobres, au service de la précision. Les analogies doivent être exactes, pas approximatives.

À bannir : jargon opaque, conclusions non démontrées, autorité sans argument.`,
  },
  {
    id: "tutorial",
    label: "Tutoriel / pratique",
    description: "Guide actionnable, étapes concrètes, résolution de problème",
    voice: `Registre courant, actionnable, direct.

Cadence : séquentielle. On avance étape par étape. Pas de digressions.

Présence du narrateur : guide patient. Il anticipe les blocages et les évite. Le "vous" ou le "on" inclusif fonctionnent bien.

Figures et images : exemples concrets du monde réel, captures de situation. On évite les métaphores — on montre.

À bannir : ambiguïté sur les actions à faire, vocabulaire flou, généralités non actionnables.`,
  },
  {
    id: "opinion",
    label: "Opinion / essai",
    description: "Thèse affirmée, argumentation rigoureuse, prise de position",
    voice: `Registre soutenu à courant, affirmé. Le narrateur a une thèse et la défend.

Cadence : argumentative. Les phrases construisent une logique. Ni trop courtes (superficielles) ni trop longues (perdantes).

Présence du narrateur : très assumée. Le "je" est possible et bienvenu. Il assume, il concède, il contre-argumente.

Figures et images : exemples comme preuves. Les métaphores peuvent servir l'argumentation si elles sont exactes.

À bannir : fausse neutralité, refus de conclure, langue molle qui élude la prise de position.`,
  },
  {
    id: "interview",
    label: "Interview / dialogue",
    description: "Collision de perspectives, voix multiples, friction productive",
    voice: `Registre variable selon les voix représentées. La friction entre perspectives est la matière première.

Cadence : alternée. Courte pour les réponses directes, plus longue pour les développements.

Présence du narrateur : interlocuteur. Il pose les questions, il cadre, il laisse l'autre parler.

Figures et images : celles des personnes citées, préservées. On ne rhabille pas les citations.

À bannir : voix plates qui disent toutes la même chose, citations arrangées pour aller dans un sens unique.`,
  },
  {
    id: "shock",
    label: "Choc / provocation",
    description: "Vérités inconfortables, preuves accumulées, confrontation directe",
    voice: `Registre direct, sans anesthésie. La langue est tranchante mais pas vulgaire.

Cadence : rythmée, percutante. Les preuves s'accumulent avec une cadence délibérée. Les pauses sont des silences chargés.

Présence du narrateur : frontale. Il assume la confrontation. Il ne s'excuse pas.

Figures et images : chiffres et faits bruts préférés aux métaphores. Les images qui dérangent restent ancrées dans le réel.

À bannir : indignation performative, provocations sans substance, manque de rigueur factuelle.`,
  },
  {
    id: "philo",
    label: "Philo / grand public",
    description: "Philosophie accessible, questions profondes, langage quotidien",
    voice: `Registre soutenu mais jamais pédant. Le narrateur est un essayiste qui pense en direct.

Cadence : phrases longues permises quand la pensée le demande, alternées avec des coupes sèches qui redonnent du relief. Pas de rythme uniforme.

Présence du narrateur : assumée. Tu peux dire "je crois que", "il me semble", "je ne sais pas si". Tu doutes en écrivant.

Figures et images : précises, pas décoratives. Une métaphore doit servir la pensée, pas l'embellir.

Lexique : pas de jargon sans explication. Les concepts sont introduits par leur usage, pas par définition dictionnaire.

À bannir : formules grandiloquentes, ton sentencieux, aphorismes clôturants, mots comme "fascinant", "vertigineux", "abyssal".`,
  },
];

export const DEFAULT_NARRATIVE_STYLE_ID = "documentary";

export function getNarrativeStyleById(id: string): NarrativeStyle | undefined {
  return NARRATIVE_STYLES.find((s) => s.id === id);
}

export function getDefaultNarrativeStyle(): NarrativeStyle {
  return NARRATIVE_STYLES.find((s) => s.id === DEFAULT_NARRATIVE_STYLE_ID)!;
}
