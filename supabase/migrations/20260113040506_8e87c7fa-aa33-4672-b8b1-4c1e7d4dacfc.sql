-- Create weekly integrations table for 6-domain tracking
CREATE TABLE public.weekly_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  business_score INTEGER CHECK (business_score >= 1 AND business_score <= 10),
  body_score INTEGER CHECK (body_score >= 1 AND body_score <= 10),
  content_score INTEGER CHECK (content_score >= 1 AND content_score <= 10),
  relationship_score INTEGER CHECK (relationship_score >= 1 AND relationship_score <= 10),
  mind_score INTEGER CHECK (mind_score >= 1 AND mind_score <= 10),
  play_score INTEGER CHECK (play_score >= 1 AND play_score <= 10),
  business_notes TEXT,
  body_notes TEXT,
  content_notes TEXT,
  relationship_notes TEXT,
  mind_notes TEXT,
  play_notes TEXT,
  pattern_detected TEXT,
  cross_domain_insights JSONB DEFAULT '[]'::jsonb,
  export_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

-- Enable RLS
ALTER TABLE public.weekly_integrations ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own weekly integrations
CREATE POLICY "Users can manage own weekly integrations"
ON public.weekly_integrations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_weekly_integrations_user_week ON public.weekly_integrations(user_id, week_start DESC);