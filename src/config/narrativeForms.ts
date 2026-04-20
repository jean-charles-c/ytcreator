export interface NarrativeForm {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

export const NARRATIVE_FORMS: NarrativeForm[] = [
  {
    id: "enquete",
    label: "Enquête",
    description: "Un fait anormal à élucider — mystère, scandale, contradiction.",
    prompt: `Tu écris une ENQUÊTE. Un fait ne colle pas. Tu suis les pistes, tu révèles ce qui était caché, tu reconstitues.

L'énergie d'une enquête :
- Tension mystère → vérité. Le spectateur doit vouloir savoir ce qui vient ensuite.
- Chronologique dans les grandes lignes. Les flashbacks sont permis quand ils servent la révélation.
- Tu parles au spectateur. Tu construis le suspens avec lui, tu doutes avec lui.
- Le climax est une VRAIE révélation — pas un récapitulatif déguisé.
- La fin referme la boucle, mais peut ouvrir sur un écho (ce qui reste troublant).

Ce qui compte :
- L'anomalie de départ est vraiment anormale. Pas un hook artificiel fabriqué pour vendre.
- Chaque piste apporte un fait nouveau. Pas de redite sous un autre angle.
- Les sources, dates, noms, chiffres sont précis et ancrés.
- Le narrateur n'est pas neutre. Il cherche, il doute, il change d'avis.

Anti-patterns à fuir :
- Faux mystère ("et pourtant quelque chose cloche", "mais un détail va tout changer")
- Climax qui récapitule au lieu de révéler
- Rebondissements inventés pour tenir l'attention
- Clichés type "enquête" ("une simple question en apparence", "personne n'avait remarqué")

Respiration typique (organique, pas imposée) :
- Un fait qui dérange, concret et daté
- Le contexte de ce qu'on croyait savoir
- Les pistes, une par une, chacune apportant du neuf
- Le moment de bascule — LA pièce qui change la lecture
- La vérité reconstituée
- Ce qui reste troublant après coup

La tension vient du savoir caché, pas de la dramatisation.`,
  },
  {
    id: "essai",
    label: "Essai",
    description: "Une idée, un concept, une thèse — la pensée qui progresse.",
    prompt: `Tu écris un ESSAI. Pas une enquête, pas un portrait. Un essai pense à voix haute.

L'énergie d'un essai :
- Tu déploies UNE idée. Tu la retournes, tu la creuses, tu la mets à l'épreuve.
- Tu n'accumules pas des exemples (caserne + école + hôpital + usine). Tu prends UN cas et tu y reviens plusieurs fois sous des angles différents, tu le laisses résonner.
- Tu fais des détours, des retours en arrière, des parenthèses — c'est même nécessaire.
- Le narrateur est VISIBLE en tant que penseur. "Voilà ce que je crois." "Et pourtant." "Je me demande si."
- La fin n'est pas une résolution. C'est une question plus profonde que celle du début, ou une image qui résonne.

Ce qui compte :
- UN cas concret central, pas un catalogue. Si tu as 5 exemples, prends-en 2 et approfondis-les.
- Tu nuances. Tu intègres ce qui résiste à ta thèse, tu ne l'évites pas.
- Tu fais confiance à l'auditeur. Tu suggères, tu ne surexpliques pas.
- Le rythme varie vraiment : un paragraphe long et méandreux, puis deux phrases sèches. Pas une cadence uniforme.

Anti-patterns à fuir (ESSENTIEL pour cette forme) :
- CATALOGUE D'EXEMPLES : "dans X... puis dans Y... puis dans Z... puis dans W..." — c'est le piège principal. Arrête-toi sur UN cas, creuse-le, reviens dessus.
- Paragraphes qui ont tous la même courbe (pose de scène → description → phrase sentencieuse finale). Cette cadence mécanique est mortelle.
- Transitions en "sauf que", "pourtant", "reste que" comme des soudures visibles entre sections.
- Phrases finales qui ont toutes la même gravité aphoristique.
- Boucles circulaires imposées (revenir au lieu/image d'ouverture à la fin parce que "ça fait propre").
- Conclusions qui transforment tout en leçon.

Ce que tu fais à la place :
- Tu t'ancres dans un cas concret, tu y reviens plusieurs fois.
- Tu laisses des pensées inachevées quand ça sert le propos.
- Tu fais des paragraphes de longueurs vraiment différentes.
- Tu peux finir sur une question, une image, une hésitation — jamais sur un aphorisme clôturant ni sur un CTA.

Respiration typique (organique) :
- Une ouverture qui engage : une scène, une image, une question, ou une tension.
- Le déploiement : tu suis le fil, tu ajoutes des couches, tu nuances, tu creuses.
- La complication : ce qui résiste à ta thèse, intégré frontalement.
- L'ouverture finale : tu ne conclus pas, tu ouvres sur plus grand.

Le rythme est celui de la pensée, pas du suspense.`,
  },
  {
    id: "portrait",
    label: "Portrait",
    description: "Une figure, une machine iconique, un lieu habité — son essence.",
    prompt: `Tu peins un PORTRAIT. Pas une biographie, pas une enquête. Tu montres l'essence d'une figure.

L'énergie d'un portrait :
- Associatif, pas chronologique. Tu entres par un angle particulier (une obsession, une habitude, une rencontre) et tu laisses le portrait se dessiner.
- Les contradictions de la figure sont la matière première, pas un problème à résoudre.
- Anecdotique : un détail vrai vaut dix généralités. Un geste rapporté, un objet, une phrase dite un soir.
- Pas de climax. La figure EST l'univers. Tu ne résous pas la figure.

Ce qui marche :
- Les anecdotes sont spécifiques et sourcées. Pas "il était connu pour être exigeant" mais "il a refait tourner Niki Lauda douze fois sur un même virage, un soir d'octobre 1976".
- Tu n'évites pas les zones d'ombre, les échecs, les laideurs.
- Tu montres comment la figure était vue par ses contemporains, et ce qu'on en pense aujourd'hui. Les deux lectures peuvent cohabiter.
- Tu laisses le spectateur SENTIR la personne, pas l'admirer ni la démolir.

Anti-patterns à fuir :
- Énumération biographique ("né en X, a fait Y, puis Z, puis W"). Mortel.
- Hagiographie : la figure est un génie parfait.
- Démythification facile : "en fait, c'était un monstre" (aussi réducteur que l'hagiographie).
- Listes de "réalisations" ou de "moments-clés".
- Conclusions qui verrouillent la figure dans une formule ("au fond, c'était un homme qui...").

Respiration typique (organique) :
- Un détail qui incarne : un geste, un objet, une phrase.
- D'où vient la figure : ce qui l'a formée, ses fidélités, ses ruptures.
- Son obsession centrale : ce qui la traverse partout.
- Ses contradictions, frontales.
- L'héritage ou ce qui reste d'elle aujourd'hui, sans verrouillage.
- Une image finale qui la fixe sans la figer.

Tu ne racontes pas une vie. Tu la rends présente.`,
  },
  {
    id: "recit_historique",
    label: "Récit historique",
    description: "Une genèse, une naissance, l'évolution d'une idée sur une période datée.",
    prompt: `Tu racontes une GENÈSE. Récit pur. Des scènes, des personnages, des enjeux.

L'énergie d'un récit :
- Chronologique, assumé. Pas de gimmicks narratifs.
- Des SCÈNES, pas des résumés. "Ferry Porsche regarde le prototype sous la neige, à 7h du matin, le 15 novembre 1963" — pas "en 1963, Ferry Porsche supervisait le développement".
- Des personnages identifiés qui font des choix. Pas d'entités abstraites ("l'équipe a décidé").
- Des obstacles réels : concurrence, échecs, contraintes financières, désaccords internes.
- Une transformation vraie à la fin : ce que ça a changé sur le moment, et pas dans le futur lointain.

Ce qui compte :
- Les dates et les lieux sont précis. Les noms propres sont identifiés à leur première occurrence.
- Les motivations des acteurs sont lisibles sans être télégraphiées.
- La tension vient des enjeux réels, pas de formules rhétoriques.
- Le récit a un cadre temporel clair. On sait où on est dans la frise.

Anti-patterns à fuir :
- Chronologie sèche : "en 1963... puis en 1964... puis en 1965...". Mortel.
- Chaque année = un paragraphe mécanique.
- Fin qui transforme tout en leçon morale ("et c'est ainsi que naquit la légende").
- Passages explicatifs longs déguisés en récit ("il faut comprendre que...").
- Abstractions à la place des personnes ("les ingénieurs pensaient que...").

Respiration typique (organique) :
- L'état du monde avant : stabilité, manque, tension latente.
- L'étincelle : un individu, une contrainte, une rencontre.
- La gestation : essais, échecs, doutes, rivalités internes.
- Le moment-clé : la scène qui fait basculer — datée, incarnée.
- La transformation : ce qui devient possible.
- L'héritage immédiat : ce que ça a changé dans les mois qui suivent.

Tu racontes comme si tu y étais. Pas comme si tu l'avais lu dans un livre.`,
  },
];

export function getNarrativeFormById(id: string): NarrativeForm | undefined {
  return NARRATIVE_FORMS.find((f) => f.id === id);
}

export const DEFAULT_NARRATIVE_FORM_ID = "essai";
