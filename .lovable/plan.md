## Objectif

Promouvoir le **Narrative Form Generator (NFG)** au niveau de la page **Mes projets**, en mode autonome, et le rattacher à un projet seulement au moment où l'utilisateur génère son script. Conserver l'historique des études par projet, et réinitialiser les Sources narratives à chaque nouvelle étude.

---

## 1. Page Mes projets — bouton de lancement

Dans `src/pages/Dashboard.tsx`, ajouter à côté du bouton « Créer un projet » un second bouton :

- Libellé : **« Créer à partir d'autres vidéos »**
- Icône : `Sparkles` (cohérent avec le NFG actuel)
- Action : `navigate("/narrative-form")`
- Mêmes styles (bordure, hauteur, accessibilité 48px) que le bouton existant, regroupés dans un `flex flex-wrap gap-3`.

---

## 2. Nouvelle route autonome `/narrative-form`

Créer `src/pages/NarrativeFormStandalone.tsx` :

- Route protégée ajoutée dans `src/App.tsx` : `/narrative-form` (et `/narrative-form/:projectId` pour rouvrir une étude existante depuis un projet).
- Header simple avec retour vers `/dashboard`.
- Monte `NarrativeWorkflowView` en mode **autonome** (`projectId = null` au démarrage).

Adaptations dans `NarrativeWorkflowView` :

- Accepter `projectId: string | null` (déjà le cas) et un nouveau prop `mode: "standalone" | "embedded"`.
- En mode standalone, **ne pas créer de projet** tant que l'utilisateur n'arrive pas à l'étape script. Le projet sera créé :
  - soit via le flux existant `createProjectFromPitch` (`useGeneratedProjects.ts`) lorsque l'utilisateur choisit un pitch et lance la génération de script,
  - soit explicitement via un bouton « Créer le projet et continuer » à l'étape script/export.
- Une fois le projet créé, rediriger vers `/narrative-form/:projectId` (l'étude reste ouverte mais désormais rattachée).

---

## 3. Rattachement étude ↔ projet

Le rattachement repose sur les colonnes existantes :

- `narrative_analyses.project_id` (déjà présent)
- `narrative_outlines.project_id`, `narrative_scenes.project_id` (déjà présents)
- `generated_projects` lie `analysis_id` ↔ `project_id`

Aucune migration nécessaire. Modifs côté code uniquement :

- À la création tardive du projet (depuis le pitch), faire un `UPDATE narrative_analyses SET project_id = ... WHERE id = analysisId` (déjà fait partiellement dans `runAnalysis`, à confirmer pour le flux standalone).
- Conserver l'accès NFG dans l'éditeur (`RsearchEngineTab`) : projectId déjà passé, pas de changement.

---

## 4. Historique des études par projet

Nouveau composant `src/components/editor/narrativeWorkflow/NarrativeStudiesHistory.tsx` :

- Affiché en haut de `NarrativeWorkflowView` quand `projectId` est défini.
- Liste les `narrative_analyses` du projet (`project_id = projectId`, `status = 'analysis_completed'`), triées par `created_at DESC`.
- Chaque ligne : titre de l'analyse, date, nombre de sources, badge si une forme/pitchs sont liés.
- Un clic charge l'étude en lecture (hydrate `analysisResult`, `analysisId`, `pitchesVisible = true`).
- Bouton **« Nouvelle étude »** en tête de liste : remet à zéro l'état NFG ET les Sources (cf. §5).

En mode standalone (sans projectId), l'historique reste masqué. Une fois le projet créé, l'historique apparaît.

---

## 5. Réinitialisation des Sources à chaque nouvelle étude

Comportement actuel : `SourceManager` charge les `narrative_sources` de l'utilisateur (pas par projet). Elles persistent entre études.

Changement demandé : « pour chaque nouvelle étude, les Sources narratives doivent être remises à zéro ».

Approche retenue (sans migration) :

- Ajouter dans `NarrativeWorkflowView` une notion d'**étude active** (un identifiant local + `analysisId`).
- Le bouton « Nouvelle étude » :
  1. Réinitialise l'état React (`analysisResult`, `analysisId`, `pitchesVisible`, `lastSources`, `analysisStatus = "idle"`).
  2. Appelle `SourceManager` avec un nouveau prop `resetSignal: number` (incrémenté à chaque clic) ; `SourceManager` réagit en vidant sa liste affichée et son état d'édition.
  3. Les anciennes sources restent en base (non supprimées) mais ne sont plus affichées dans la nouvelle session — l'utilisateur démarre avec une liste vide et ajoute ses nouvelles sources.

Note : l'historique des études (§4) reste intact car il s'appuie sur `narrative_analyses` (qui contient `source_ids` figé).

---

## 6. Détails techniques

```text
src/
├── App.tsx                                    [+ route /narrative-form, /narrative-form/:projectId]
├── pages/
│   ├── Dashboard.tsx                          [+ bouton "Créer à partir d'autres vidéos"]
│   └── NarrativeFormStandalone.tsx            [NOUVEAU - wrapper page]
└── components/editor/narrativeWorkflow/
    ├── NarrativeWorkflowView.tsx              [+ mode standalone, + reset, + redirect après création]
    ├── NarrativeStudiesHistory.tsx            [NOUVEAU - liste études par projet]
    └── SourceManager.tsx                      [+ prop resetSignal]
```

Aucune migration Supabase. Aucun changement RLS.

---

## 7. Points hors périmètre

- L'onglet RsearchEngine de l'éditeur reste inchangé (accès NFG conservé via le bouton existant).
- La logique de génération (analyse, pitchs, outline, script) n'est pas modifiée.
- Aucune suppression automatique des `narrative_sources` en base.
