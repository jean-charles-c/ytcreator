DROP POLICY IF EXISTS "Users can update own VO audios" ON public.vo_audio_history;

CREATE POLICY "Users can update own VO audios"
ON public.vo_audio_history
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());