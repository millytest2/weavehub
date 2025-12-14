-- Create table to track user activity patterns for time-of-day learning
CREATE TABLE public.user_activity_patterns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  hour_of_day integer NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  activity_type text NOT NULL, -- 'request', 'complete', 'skip'
  pillar text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_activity_patterns ENABLE ROW LEVEL SECURITY;

-- Users can manage their own patterns
CREATE POLICY "Users can manage own activity patterns" 
ON public.user_activity_patterns 
FOR ALL 
USING (auth.uid() = user_id);

-- Create index for efficient querying
CREATE INDEX idx_user_activity_patterns_user_hour ON public.user_activity_patterns(user_id, hour_of_day);
CREATE INDEX idx_user_activity_patterns_created ON public.user_activity_patterns(user_id, created_at DESC);

-- Function to get user's learned time preferences
CREATE OR REPLACE FUNCTION public.get_user_time_preferences(p_user_id uuid)
RETURNS TABLE(
  hour_of_day integer,
  request_count bigint,
  complete_count bigint,
  skip_count bigint,
  success_rate numeric
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uap.hour_of_day,
    COUNT(*) FILTER (WHERE uap.activity_type = 'request') as request_count,
    COUNT(*) FILTER (WHERE uap.activity_type = 'complete') as complete_count,
    COUNT(*) FILTER (WHERE uap.activity_type = 'skip') as skip_count,
    CASE 
      WHEN COUNT(*) FILTER (WHERE uap.activity_type IN ('complete', 'skip')) > 0 
      THEN ROUND(
        COUNT(*) FILTER (WHERE uap.activity_type = 'complete')::numeric / 
        NULLIF(COUNT(*) FILTER (WHERE uap.activity_type IN ('complete', 'skip')), 0)::numeric, 
        2
      )
      ELSE 0.5
    END as success_rate
  FROM public.user_activity_patterns uap
  WHERE uap.user_id = p_user_id
    AND uap.created_at > now() - interval '30 days'
  GROUP BY uap.hour_of_day
  ORDER BY uap.hour_of_day;
END;
$$;