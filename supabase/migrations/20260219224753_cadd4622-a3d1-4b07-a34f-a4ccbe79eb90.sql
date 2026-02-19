
-- Table to cache The Thread milestones (2026 → monthly breakdown)
CREATE TABLE public.thread_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month_number INTEGER NOT NULL, -- 1-12
  year INTEGER NOT NULL DEFAULT 2026,
  title TEXT NOT NULL,
  description TEXT,
  capability_focus TEXT, -- what skill/capability this month builds
  status TEXT DEFAULT 'upcoming', -- upcoming, current, completed
  insights_connected INTEGER DEFAULT 0, -- count of insights linked to this milestone
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month_number, year)
);

-- Enable RLS
ALTER TABLE public.thread_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own milestones"
ON public.thread_milestones
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_thread_milestones_updated_at
BEFORE UPDATE ON public.thread_milestones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
