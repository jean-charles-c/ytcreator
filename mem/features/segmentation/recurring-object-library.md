---
name: Recurring Object Library
description: User-level table recurring_object_library persists characters/locations/objects with reference_images across projects and re-segmentations
type: feature
---
A user-level table `public.recurring_object_library` (RLS by user_id, unique on user_id+nom+type) stores every recurring entity that has at least one reference image.

- `ObjectRegistryPanel` auto-upserts (debounced 1.5s) any in-project object with `reference_images` to the library, including identity_prompt, description, epoque, type and source_project_id.
- The "Importer d'un autre projet" dialog now reads exclusively from this library (grouped by source project; entries with no source go under "Bibliothèque personnelle").
- `analyze-context` edge function preserves existing in-project objects that have `reference_images` instead of overwriting them — re-segmentation never wipes user-curated identity anchors.
- Removing an object from the panel only removes it from the current project; the library entry is kept.
