-- Create table to track grounding sessions
CREATE TABLE public.grounding_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  emotional_state TEXT,
  matched_source_type TEXT, -- 'insight' or 'document'
  matched_source_id UUID,
  matched_source_title TEXT,
  gentle_rep TEXT,
  reminder TEXT,
  resonated BOOLEAN DEFAULT NULL, -- user can mark if it helped
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.grounding_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own grounding logs"
ON public.grounding_log
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own grounding logs"
ON public.grounding_log
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own grounding logs"
ON public.grounding_log
FOR UPDATE
USING (auth.uid() = user_id);

-- Index for querying user's grounding patterns
CREATE INDEX idx_grounding_log_user_state ON public.grounding_log(user_id, emotional_state);