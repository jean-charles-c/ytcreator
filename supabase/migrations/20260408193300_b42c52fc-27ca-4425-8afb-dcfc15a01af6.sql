
CREATE TABLE public.custom_tts_transforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pattern TEXT NOT NULL,
  replacement TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_tts_transforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transforms"
ON public.custom_tts_transforms FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transforms"
ON public.custom_tts_transforms FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transforms"
ON public.custom_tts_transforms FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transforms"
ON public.custom_tts_transforms FOR DELETE
USING (auth.uid() = user_id);
