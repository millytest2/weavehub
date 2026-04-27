-- Skill Stack: structured identity archetypes
CREATE TABLE public.skill_stack (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  archetype TEXT NOT NULL, -- e.g. "money_making", "salesman", "content", "ai_proof", "body", "charisma", "relationship", "friendship", "upath_founder", "disciplined", "curious"
  label TEXT NOT NULL, -- display name e.g. "Money-making Miles"
  target TEXT, -- the target outcome
  skills TEXT, -- the specific skills required
  daily_reps TEXT, -- the daily reps expected
  metrics TEXT, -- what to track
  failure_mode TEXT, -- the anti-pattern to watch for
  standard TEXT, -- the standard / non-negotiable
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, archetype)
);

ALTER TABLE public.skill_stack ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own skill stack"
  ON public.skill_stack FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER skill_stack_updated_at
  BEFORE UPDATE ON public.skill_stack
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Daily Scoreboard: 8 reps per day
CREATE TABLE public.daily_scoreboard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  scoreboard_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sales_rep BOOLEAN DEFAULT false,
  upath_rep BOOLEAN DEFAULT false,
  content_rep BOOLEAN DEFAULT false,
  fitness_rep BOOLEAN DEFAULT false,
  charisma_rep BOOLEAN DEFAULT false,
  relationship_rep BOOLEAN DEFAULT false,
  ai_leverage_rep BOOLEAN DEFAULT false,
  money_rep BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scoreboard_date)
);

ALTER TABLE public.daily_scoreboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scoreboard"
  ON public.daily_scoreboard FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER daily_scoreboard_updated_at
  BEFORE UPDATE ON public.daily_scoreboard
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_daily_scoreboard_user_date ON public.daily_scoreboard(user_id, scoreboard_date DESC);

-- Weekly Rhythm: default schedule template
CREATE TABLE public.weekly_rhythm (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  work_hours TEXT, -- e.g. "Mon-Fri 9am-5pm Social Hog"
  gym_blocks TEXT, -- e.g. "Mon/Wed/Fri/Sat 6pm"
  deep_work_blocks TEXT, -- UPath / content blocks
  meal_pattern TEXT,
  sleep_target TEXT, -- e.g. "in bed by 10:30, up by 6:30"
  social_blocks TEXT, -- weekly friend/date plans
  weekend_pattern TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_rhythm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own weekly rhythm"
  ON public.weekly_rhythm FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER weekly_rhythm_updated_at
  BEFORE UPDATE ON public.weekly_rhythm
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Calendar settings + cached events
CREATE TABLE public.calendar_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  google_calendar_enabled BOOLEAN DEFAULT true,
  primary_calendar_id TEXT DEFAULT 'primary',
  last_synced_at TIMESTAMPTZ,
  cached_events JSONB DEFAULT '[]'::jsonb, -- today's events for fast read
  cache_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar settings"
  ON public.calendar_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER calendar_settings_updated_at
  BEFORE UPDATE ON public.calendar_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();