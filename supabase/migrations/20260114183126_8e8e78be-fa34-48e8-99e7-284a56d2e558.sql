-- Create pending_actions table to queue AI-generated actions from saved content
CREATE TABLE public.pending_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('document', 'insight', 'learning_path')),
  source_id UUID NOT NULL,
  source_title TEXT NOT NULL,
  action_text TEXT NOT NULL,
  action_context TEXT,
  suggested_path_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'archived')),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '48 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own pending actions"
ON public.pending_actions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pending actions"
ON public.pending_actions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending actions"
ON public.pending_actions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pending actions"
ON public.pending_actions FOR DELETE
USING (auth.uid() = user_id);

-- Add learning_debt_score column to identity_seeds to track consumption vs action ratio
ALTER TABLE public.identity_seeds 
ADD COLUMN IF NOT EXISTS content_saved_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS content_applied_count INTEGER DEFAULT 0;

-- Index for fast lookup of pending actions
CREATE INDEX idx_pending_actions_user_status ON public.pending_actions(user_id, status);
CREATE INDEX idx_pending_actions_expires ON public.pending_actions(expires_at) WHERE status = 'pending';