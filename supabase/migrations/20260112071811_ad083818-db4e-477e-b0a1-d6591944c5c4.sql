-- Add new columns to experiments table for active experiment tracking
ALTER TABLE public.experiments 
ADD COLUMN IF NOT EXISTS experiment_type text DEFAULT 'personal',
ADD COLUMN IF NOT EXISTS duration_days integer DEFAULT 7,
ADD COLUMN IF NOT EXISTS metrics_tracked jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS current_day integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Create experiment_logs table for daily check-ins
CREATE TABLE IF NOT EXISTS public.experiment_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  day_number integer NOT NULL,
  metrics_data jsonb DEFAULT '{}'::jsonb,
  observations text,
  energy_level integer CHECK (energy_level >= 1 AND energy_level <= 10),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on experiment_logs
ALTER TABLE public.experiment_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for experiment_logs
CREATE POLICY "Users can manage own experiment logs"
ON public.experiment_logs
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create observations table for content capture pipeline
CREATE TABLE IF NOT EXISTS public.observations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  observation_type text NOT NULL DEFAULT 'insight',
  content text NOT NULL,
  source text,
  your_data text,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  post_drafted boolean DEFAULT false,
  posted_at timestamp with time zone,
  platform text,
  generated_post text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on observations
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for observations
CREATE POLICY "Users can manage own observations"
ON public.observations
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_experiment_logs_experiment_id ON public.experiment_logs(experiment_id);
CREATE INDEX IF NOT EXISTS idx_observations_user_id ON public.observations(user_id);
CREATE INDEX IF NOT EXISTS idx_observations_type ON public.observations(observation_type);