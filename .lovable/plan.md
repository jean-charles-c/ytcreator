

## Goal
Après génération des prompts visuels (`prompt_export`), détecter automatiquement les objets/personnages/lieux récurrents qui apparaissent dans **la phrase descriptive du visuel** (et non seulement dans le texte source du script), pour que les images de référence soient automatiquement ajoutées au moment de la génération d'image.

## État actuel (ce qui existe déjà)

Un mécanisme de détection automatique existe déjà :
- À la fin de `startStoryboard` (mode prompts), un évènement `storyboard-prompts-complete` est dispatché.
- Un listener dans `Editor.tsx` appelle `detect-object-shots` puis met à jour `mentions_shots` sur chaque objet.
- Au moment de l'image gen, `generate-shot-image` lit `mentions_shots` et injecte automatiquement les `reference_images` + REFERENCE IMAGE RULE dans le prompt envoyé à l'IA.

**Problème** : le payload envoyé à `detect-object-shots` ne contient que `source_sentence` / `source_sentence_fr` / `description`. Il n'inclut **pas** `prompt_export`, qui est pourtant la phrase descriptive utilisée pour le visuel et qui mentionne souvent l'objet/personnage/lieu (ex : la voiture est nommée explicitement dans le prompt mais pas dans la narration).

## Changements proposés

### 1. `src/pages/Editor.tsx` — enrichir le payload de détection
Dans les deux endroits qui appellent `detect-object-shots` (auto post-prompts ligne ~1768 et manuel ligne ~1694), ajouter `prompt_export` au payload de chaque shot :
```ts
shotsPayload = shots.map(s => ({
  id, scene_id,
  source_sentence, source_sentence_fr, description,
  prompt_export: s.prompt_export,   // ← nouveau
}))
```

### 2. `supabase/functions/detect-object-shots/index.ts` — analyser aussi le prompt visuel
- Inclure `prompt_export` dans le `shotList` envoyé à l'IA, sous un libellé clair (ex : `Prompt visuel: "..."`).
- Mettre à jour le system prompt pour préciser que l'analyse doit porter à la fois sur le **texte narratif** ET sur la **description visuelle générée**, car un objet peut être présent visuellement sans être nommé dans la narration.
- Garder la limite de 300 caractères ou augmenter légèrement (ex : 400) pour le prompt visuel afin d'éviter de trop gonfler le payload.

### 3. Robustesse du déclenchement automatique
Vérifier dans `BackgroundTasks.tsx` que `storyboard-prompts-complete` est bien dispatché aussi quand `promptOnly: true` est utilisé (régénération des prompts manquants), pas seulement à la première création. Ajuster la condition `!params.segmentOnly && failedSceneIds.length === 0 && totalShots > 0` si besoin pour qu'elle couvre `promptOnly`.

### 4. Toast de confirmation clair
Garder le toast existant `Auto-détection : N liaison(s) objet↔shot trouvée(s)` et ajouter une mention quand des images de référence sont effectivement disponibles, ex :
> « Auto-détection : 12 liaisons trouvées — 4 shots recevront des images de référence. »

## Ce qui ne change pas
- `generate-shot-image` n'a pas besoin de modification : il lit déjà `mentions_shots` + `reference_images` et injecte le bloc REFERENCE IMAGE RULE automatiquement.
- `ObjectRegistryPanel` reste la source de vérité pour les images de référence par objet.
- Le mécanisme de retry 429 et la logique de merge (union des liens existants + nouveaux) sont conservés.

## Résultat attendu
Dès que les prompts visuels sont générés (création initiale ou « Générer les prompts manquants »), une passe IA croise automatiquement chaque `prompt_export` ET le texte source avec le registre d'objets récurrents, met à jour `mentions_shots`, et la génération d'image suivante embarque automatiquement les images de référence + la REFERENCE IMAGE RULE pour préserver l'identité visuelle.

