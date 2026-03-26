ALTER TABLE public.video_generations ADD COLUMN selected_for_export boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_single_export_selection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.selected_for_export = true THEN
    UPDATE public.video_generations
    SET selected_for_export = false
    WHERE id != NEW.id
      AND selected_for_export = true
      AND (
        (NEW.source_shot_id IS NOT NULL AND source_shot_id = NEW.source_shot_id)
        OR (NEW.source_upload_id IS NOT NULL AND source_upload_id = NEW.source_upload_id)
      );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_single_export_selection
  BEFORE UPDATE OF selected_for_export ON public.video_generations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_export_selection();