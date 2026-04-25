-- Étape 12 — Enrichir narrative_chapters avec les champs narratifs
ALTER TABLE public.narrative_chapters
  ADD COLUMN IF NOT EXISTS structural_role text,
  ADD COLUMN IF NOT EXISTS main_event text,
  ADD COLUMN IF NOT EXISTS dramatic_tension text,
  ADD COLUMN IF NOT EXISTS revelation text,
  ADD COLUMN IF NOT EXISTS emotional_progression text,
  ADD COLUMN IF NOT EXISTS transition_to_next text;

-- Lien optionnel vers la forme narrative utilisée pour générer le sommaire
ALTER TABLE public.narrative_outlines
  ADD COLUMN IF NOT EXISTS form_id uuid,
  ADD COLUMN IF NOT EXISTS pitch_id uuid,
  ADD COLUMN IF NOT EXISTS ai_model text;

-- Indexes pour accélérer le chargement par projet
CREATE INDEX IF NOT EXISTS idx_narrative_outlines_project ON public.narrative_outlines(project_id);
CREATE INDEX IF NOT EXISTS idx_narrative_chapters_outline ON public.narrative_chapters(outline_id, chapter_order);

-- Trigger d'auto-update updated_at sur outlines/chapters (réutilise update_updated_at_column existant)
DROP TRIGGER IF EXISTS trg_narrative_outlines_updated_at ON public.narrative_outlines;
CREATE TRIGGER trg_narrative_outlines_updated_at
BEFORE UPDATE ON public.narrative_outlines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_narrative_chapters_updated_at ON public.narrative_chapters;
CREATE TRIGGER trg_narrative_chapters_updated_at
BEFORE UPDATE ON public.narrative_chapters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();