---
name: Structural Edits No Auto Prompts
description: Split/merge/delete shots never trigger prompt generation; affected shots get prompt_export=null
type: feature
---
- Split, merge, and delete operations on shots NEVER auto-call `regeneratePromptsForScene` / `generate-storyboard` `prompt_only`.
- Affected shots (modified survivor, redistributed shots after delete, newly inserted shot from split) have their `prompt_export` set to `null` in DB and local state.
- This way `runStoryboard({ promptOnly: true })`'s `isComplete` filter correctly considers their scene as "incomplete" and processes them on the next click of "Générer tous les prompts".
- `regeneratePromptsForScene` is kept only for explicit per-scene "Régénérer les prompts" buttons.
- Why: previous auto-regen silently filled prompts using stale style/format/sensitive settings, then `isComplete` skipped those scenes when the user later clicked the global button.
