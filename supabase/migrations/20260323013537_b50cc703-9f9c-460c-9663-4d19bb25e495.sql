
-- Daily briefs (generated overnight or on-demand)
CREATE TABLE public.daily_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  brief_date DATE NOT NULL,
  what_shifted TEXT,
  recommended_actions JSONB DEFAULT '[]'::jsonb,
  forgotten_gem_id UUID,
  forgotten_gem_context TEXT,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, brief_date)
);

ALTER TABLE public.daily_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own briefs"
  ON public.daily_briefs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Daily credits
CREATE TABLE public.daily_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credit_date DATE NOT NULL,
  total_credits INTEGER DEFAULT 3,
  credits_spent INTEGER DEFAULT 0,
  actions_committed UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, credit_date)
);

ALTER TABLE public.daily_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own credits"
  ON public.daily_credits FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Action completions (evening close)
CREATE TABLE public.action_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  daily_task_id UUID REFERENCES public.daily_tasks(id) ON DELETE SET NULL,
  completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'completed',
  what_happened TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.action_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own completions"
  ON public.action_completions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Daily closes (evening journal)
CREATE TABLE public.daily_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  close_date DATE NOT NULL,
  daily_brief_id UUID REFERENCES public.daily_briefs(id) ON DELETE SET NULL,
  journal_entry TEXT,
  patterns_noticed TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, close_date)
);

ALTER TABLE public.daily_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own closes"
  ON public.daily_closes FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Learned patterns (auto-detected per user)
CREATE TABLE public.learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pattern_type TEXT NOT NULL,
  trigger_condition TEXT NOT NULL,
  outcome TEXT NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 0.5,
  times_observed INTEGER DEFAULT 1,
  last_observed DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.learned_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own patterns"
  ON public.learned_patterns FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add credit_cost and priority to daily_tasks
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS credit_cost INTEGER DEFAULT 1;
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'HIGH';
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS cited_sources JSONB;
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS impact_description TEXT;
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS daily_brief_id UUID REFERENCES public.daily_briefs(id) ON DELETE SET NULL;
