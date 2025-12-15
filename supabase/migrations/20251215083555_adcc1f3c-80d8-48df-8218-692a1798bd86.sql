-- Add new columns to learning_paths for 30-day structured learning
ALTER TABLE public.learning_paths 
ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS structure JSONB,
ADD COLUMN IF NOT EXISTS sources_used JSONB,
ADD COLUMN IF NOT EXISTS current_day INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS final_deliverable TEXT,
ADD COLUMN IF NOT EXISTS sub_topics JSONB,
ADD COLUMN IF NOT EXISTS topic_name TEXT;

-- Create path_daily_progress table for tracking daily learning
CREATE TABLE public.path_daily_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  day_number INTEGER NOT NULL,
  learning_task TEXT,
  learning_source_ref TEXT,
  learning_completed BOOLEAN DEFAULT false,
  application_task TEXT,
  application_completed BOOLEAN DEFAULT false,
  is_rest_day BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(path_id, day_number)
);

-- Enable RLS
ALTER TABLE public.path_daily_progress ENABLE ROW LEVEL SECURITY;

-- RLS policy for path_daily_progress
CREATE POLICY "Users can manage own path progress"
ON public.path_daily_progress
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);