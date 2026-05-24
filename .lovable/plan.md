# Anti-contamination des prompts visuels

## Diagnostic

Dans le projet « La Facture Secrète », le shot 3 de la scène 1 (sujet : *The Gallery* — Rolls-Royce) contient « Époque contemporaine, **Atelier Pagani.** » Ce n'est ni un bug d'affichage ni du strip legacy : c'est le `prompt_export` généré par l'IA qui a halluciné un lieu emprunté à un autre sujet du même projet (Pagani Huayra / Pack Tempesta).

Cause racine identifiée dans `supabase/functions/generate-storyboard/index.ts` :

1. Le bloc `OBJETS RÉCURRENTS` injecté dans le system prompt liste **tous** les objets récurrents du projet, pas seulement ceux de la scène en cours.
2. Le `scene_context.lieu` est correct (« Intérieur d'une Rolls-Royce Phantom (studio) ») mais rien n'**interdit** explicitement à l'IA de citer une autre marque/atelier du projet.
3. Aucun filet de sécurité côté serveur ni côté UI ne détecte qu'un prompt mentionne une entité absente du contexte de sa scène.

## Couche 1 — Filtrage des objets récurrents par scène (serveur)

Dans `generate-storyboard` (et `regenerate-shot`) :

- Construire `objectIdentityBlock` en n'incluant que les objets dont :
  - `mentions_scenes` contient l'`scene_order` courant, **ou**
  - le `nom` apparaît dans `scene_context.objets_associes` (match texte tolérant), **ou**
  - le `nom` est cité dans `source_text` / fragments de la scène.
- Si la génération couvre plusieurs scènes dans un même appel, fournir un **bloc d'objets par scène** plutôt qu'un bloc global, attaché à chaque `CONTEXTE DE LA SCÈNE`.
- Conserver la lib complète uniquement pour les guardrails globaux (jamais comme matériau de prompt visuel).

Résultat : l'IA ne « voit » plus Pagani Huayra quand elle génère un shot Rolls-Royce.

## Couche 2 — Garde-fou explicite dans le prompt système

Ajouter au system prompt de `generate-storyboard` / `regenerate-shot` un bloc :

```
ENTITY ISOLATION RULE — CRITICAL:
- The prompt_export MUST ONLY mention brands, vehicles, ateliers, locations
  and objects listed in the CURRENT SCENE's CONTEXTE block (lieu, sujet,
  objets_associes) or in that scene's filtered OBJETS RÉCURRENTS.
- NEVER name another brand/atelier/object that belongs to a different scene
  of the same project, even if it appears elsewhere in the recurring library.
- If unsure, fall back to a neutral location ("studio neutre", "showroom")
  rather than inventing or borrowing a brand name.
```

## Couche 3 — Détection post-génération + UI

Côté serveur, après génération de chaque `prompt_export` :

- Construire la liste des entités « autorisées » pour la scène (marques + ateliers + lieux dérivés de `scene_context` + objets filtrés).
- Construire la liste des entités « interdites » = union des noms d'objets récurrents du projet **moins** les autorisées.
- Si le `prompt_export` contient (insensible casse, mot entier) une entité interdite, stocker un flag `contamination_warning` dans le shot (champ JSON existant ou nouveau, à décider lors de l'implémentation).

Côté UI (`ShotCard.tsx`, tab VisualPrompts) :

- Quand le flag est présent, afficher un badge orange « ⚠ Entité étrangère détectée : *Pagani* » au-dessus du bloc « Contexte narratif (secondaire) ».
- Proposer un bouton « Régénérer ce shot » (action existante) et un bouton « Nettoyer automatiquement » qui remplace l'entité interdite par le `lieu` de la scène et resauve `prompt_export`.

## Détails techniques

- Fichiers à modifier :
  - `supabase/functions/generate-storyboard/index.ts` — filtrage objets, ajout règle ENTITY ISOLATION, détection post-gen.
  - `supabase/functions/regenerate-shot/index.ts` — mêmes 3 ajouts pour la régénération unitaire.
  - `supabase/functions/_shared/identity-lock-utils.ts` — utilitaires partagés `filterRecurringObjectsForScene()` et `detectForeignEntities()`.
  - `src/components/editor/ShotCard.tsx` — badge + bouton « Nettoyer ».
- Pas de migration DB requise si on stocke le warning dans un JSON existant ; sinon ajouter une colonne `shots.contamination_warning text` (à confirmer avec toi avant migration).
- Pas d'impact sur le strip legacy ni sur les blocs IDENTITY LOCK déjà en place.

## Mémoire projet à mettre à jour après implémentation

Nouvelle entrée `mem://features/prompt-engineering/entity-isolation` rappelant la règle (objets récurrents filtrés par scène + interdiction de citer une entité étrangère).
