-- Create experiments table
CREATE TABLE public.experiments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  hypothesis text,
  results text,
  status text DEFAULT 'planning' CHECK (status IN ('planning', 'running', 'completed', 'failed')),
  topic_id uuid,
  learning_path_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage own experiments"
  ON public.experiments
  FOR ALL
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_experiments_updated_at
  BEFORE UPDATE ON public.experiments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();