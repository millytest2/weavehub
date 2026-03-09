
-- Weekly intentions: what user wants to do this week
CREATE TABLE public.weekly_intentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  pillar TEXT,
  completed BOOLEAN DEFAULT false,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_intentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own weekly intentions"
  ON public.weekly_intentions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Monthly plans: events, goals, and context for each month
CREATE TABLE public.monthly_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  text TEXT NOT NULL,
  event_date DATE,
  plan_type TEXT NOT NULL DEFAULT 'goal',
  completed BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own monthly plans"
  ON public.monthly_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
