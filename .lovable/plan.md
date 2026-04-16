

## Plan : Persister les ancres manuelles Whisper en DB (+ push GitHub)

**Problème** : Les recalages manuels sont stockés en `localStorage` et perdus au rechargement. Le matching automatique les écrase.

**Solution** : Enrichir `shot_timepoints` (jsonb) avec `isManual: boolean` — pas de migration SQL nécessaire.

---

### Étape 1 — `saveAllTimepoints` : inclure les shots manuels + flag `isManual`

**Fichier** : `src/components/editor/WhisperAlignmentEditor.tsx` (ligne ~525-550)

- Modifier le filtre pour inclure aussi les shots avec `status === "manual"`
- Ajouter `isManual: s.isManualAnchor` à chaque timepoint du payload

### Étape 2 — Charger les ancres depuis la DB au lieu de localStorage

**Fichier** : `src/components/editor/WhisperAlignmentEditor.tsx`

- Au chargement (useEffect ~ligne 250), lire les `shot_timepoints` existants et reconstruire `manualAnchors` depuis les entrées ayant `isManual: true`
- Supprimer `getManualAnchorsStorageKey`, `loadStoredManualAnchors`, `persistManualAnchors` et toutes les références à `localStorage`

### Étape 3 — Auto-save après chaque recalage manuel

**Fichier** : `src/components/editor/WhisperAlignmentEditor.tsx`

- Dans `confirmSelection` (~ligne 520) : appeler `saveAllTimepoints()` automatiquement après mise à jour de l'état local
- Toast de confirmation

### Étape 4 — Cohérence Edge Function `chirp-shot-mapping`

**Fichier** : `supabase/functions/chirp-shot-mapping/index.ts`

- Ajouter `isManual: false` à chaque timepoint généré automatiquement

### Étape 5 — Push GitHub

Les modifications seront automatiquement synchronisées vers GitHub via l'intégration bidirectionnelle Lovable ↔ GitHub.

---

### Format enrichi du timepoint

```json
{
  "shotId": "uuid",
  "shotIndex": 0,
  "timeSeconds": 12.34,
  "isManual": true
}
```

Aucune migration SQL requise — `shot_timepoints` est déjà en `jsonb`.

