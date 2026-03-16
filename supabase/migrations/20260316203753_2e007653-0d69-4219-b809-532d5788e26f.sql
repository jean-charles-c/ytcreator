
CREATE POLICY "Users can delete own favorite voice profiles"
ON public.favorite_voice_profile
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
