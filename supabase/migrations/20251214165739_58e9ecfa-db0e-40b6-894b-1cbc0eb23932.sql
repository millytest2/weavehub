-- Create rate limits table
CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, function_name)
);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own rate limits
CREATE POLICY "Users can manage own rate limits"
ON public.rate_limits
FOR ALL
USING (auth.uid() = user_id);

-- Function to check and update rate limit (returns true if allowed, false if rate limited)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id uuid,
  p_function_name text,
  p_max_requests integer DEFAULT 20,
  p_window_minutes integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record rate_limits%ROWTYPE;
  v_window_start timestamp with time zone;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::interval;
  
  -- Try to get existing record
  SELECT * INTO v_record
  FROM rate_limits
  WHERE user_id = p_user_id AND function_name = p_function_name;
  
  IF NOT FOUND THEN
    -- First request, create record
    INSERT INTO rate_limits (user_id, function_name, request_count, window_start)
    VALUES (p_user_id, p_function_name, 1, now());
    RETURN true;
  END IF;
  
  -- Check if window has expired
  IF v_record.window_start < v_window_start THEN
    -- Reset window
    UPDATE rate_limits
    SET request_count = 1, window_start = now()
    WHERE user_id = p_user_id AND function_name = p_function_name;
    RETURN true;
  END IF;
  
  -- Check if over limit
  IF v_record.request_count >= p_max_requests THEN
    RETURN false;
  END IF;
  
  -- Increment counter
  UPDATE rate_limits
  SET request_count = request_count + 1
  WHERE user_id = p_user_id AND function_name = p_function_name;
  
  RETURN true;
END;
$$;