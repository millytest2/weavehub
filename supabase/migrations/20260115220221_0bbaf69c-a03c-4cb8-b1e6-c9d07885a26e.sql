-- Create table for weekly pillar targets
-- These define the minimum actions per pillar per week based on identity/goals
CREATE TABLE public.weekly_pillar_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN ('business', 'body', 'content', 'relationship', 'mind', 'play')),
  weekly_target INTEGER NOT NULL DEFAULT 3,
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority >= 1 AND priority <= 5),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, pillar)
);

-- Enable RLS
ALTER TABLE public.weekly_pillar_targets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own pillar targets" 
ON public.weekly_pillar_targets 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own pillar targets" 
ON public.weekly_pillar_targets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pillar targets" 
ON public.weekly_pillar_targets 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pillar targets" 
ON public.weekly_pillar_targets 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_weekly_pillar_targets_updated_at
BEFORE UPDATE ON public.weekly_pillar_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();