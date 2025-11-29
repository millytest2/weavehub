-- Create action_history table to track all completed actions (invisible to user)
CREATE TABLE public.action_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_id UUID REFERENCES public.daily_tasks(id) ON DELETE SET NULL,
  action_date DATE NOT NULL DEFAULT CURRENT_DATE,
  pillar TEXT,
  action_text TEXT NOT NULL,
  why_it_mattered TEXT,
  time_required TEXT,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  task_sequence INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.action_history ENABLE ROW LEVEL SECURITY;

-- Policies for action_history (backend access only through service role)
CREATE POLICY "Users can view their own action history"
ON public.action_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own action history"
ON public.action_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create function to auto-log completed actions
CREATE OR REPLACE FUNCTION public.log_completed_action()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    INSERT INTO public.action_history (
      user_id,
      task_id,
      action_date,
      pillar,
      action_text,
      why_it_mattered,
      time_required,
      task_sequence
    ) VALUES (
      NEW.user_id,
      NEW.id,
      NEW.task_date,
      NEW.pillar,
      NEW.one_thing,
      NEW.why_matters,
      NEW.description,
      NEW.task_sequence
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to automatically log when task is marked complete
CREATE TRIGGER on_task_completed
  AFTER UPDATE ON public.daily_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_completed_action();

-- Index for faster queries
CREATE INDEX idx_action_history_user_date ON public.action_history(user_id, action_date DESC);
CREATE INDEX idx_action_history_pillar ON public.action_history(user_id, pillar);