ALTER TABLE public.weekly_intentions ADD COLUMN IF NOT EXISTS day_of_week SMALLINT;
COMMENT ON COLUMN public.weekly_intentions.day_of_week IS '0=Mon..6=Sun, NULL=any day this week';