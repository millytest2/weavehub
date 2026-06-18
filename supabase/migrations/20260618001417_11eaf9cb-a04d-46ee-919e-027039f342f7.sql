
-- 1. Re-scope all policies currently on public role to authenticated role
ALTER POLICY "Users can insert their own action history" ON public.action_history TO authenticated;
ALTER POLICY "Users can view their own action history" ON public.action_history TO authenticated;
ALTER POLICY "Users manage own calendar settings" ON public.calendar_settings TO authenticated;
ALTER POLICY "Users can manage own connections" ON public.connections TO authenticated;
ALTER POLICY "Users can manage own conversations" ON public.conversations TO authenticated;
ALTER POLICY "Users manage own scoreboard" ON public.daily_scoreboard TO authenticated;
ALTER POLICY "Users can manage own tasks" ON public.daily_tasks TO authenticated;
ALTER POLICY "Users can manage own documents" ON public.documents TO authenticated;
ALTER POLICY "Users can manage own experiment logs" ON public.experiment_logs TO authenticated;
ALTER POLICY "Users can manage own experiments" ON public.experiments TO authenticated;
ALTER POLICY "Users can insert their own grounding logs" ON public.grounding_log TO authenticated;
ALTER POLICY "Users can update their own grounding logs" ON public.grounding_log TO authenticated;
ALTER POLICY "Users can view their own grounding logs" ON public.grounding_log TO authenticated;
ALTER POLICY "Users can manage own identity seed" ON public.identity_seeds TO authenticated;
ALTER POLICY "Users can manage own insights" ON public.insights TO authenticated;
ALTER POLICY "Users can manage own paths" ON public.learning_paths TO authenticated;
ALTER POLICY "Users can manage own metric logs" ON public.metric_logs TO authenticated;
ALTER POLICY "Users can manage own monthly plans" ON public.monthly_plans TO authenticated;
ALTER POLICY "Users can manage own observations" ON public.observations TO authenticated;
ALTER POLICY "Users can manage own path progress" ON public.path_daily_progress TO authenticated;
ALTER POLICY "Users can manage path items" ON public.path_items TO authenticated;
ALTER POLICY "Users can delete their own pending actions" ON public.pending_actions TO authenticated;
ALTER POLICY "Users can insert their own pending actions" ON public.pending_actions TO authenticated;
ALTER POLICY "Users can update their own pending actions" ON public.pending_actions TO authenticated;
ALTER POLICY "Users can view their own pending actions" ON public.pending_actions TO authenticated;
ALTER POLICY "Users can manage own voice templates" ON public.platform_voice_templates TO authenticated;
ALTER POLICY "Users can insert own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can update own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can view own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users manage own skill stack" ON public.skill_stack TO authenticated;
ALTER POLICY "Users can manage own milestones" ON public.thread_milestones TO authenticated;
ALTER POLICY "Users can manage own topics" ON public.topics TO authenticated;
ALTER POLICY "Users can manage own activity patterns" ON public.user_activity_patterns TO authenticated;
ALTER POLICY "Users can manage own goals" ON public.user_goals TO authenticated;
ALTER POLICY "Admins can manage roles" ON public.user_roles TO authenticated;
ALTER POLICY "Admins can view all roles" ON public.user_roles TO authenticated;
ALTER POLICY "Users can manage own weekly integrations" ON public.weekly_integrations TO authenticated;
ALTER POLICY "Users can manage own weekly intentions" ON public.weekly_intentions TO authenticated;
ALTER POLICY "Users can create their own pillar targets" ON public.weekly_pillar_targets TO authenticated;
ALTER POLICY "Users can delete their own pillar targets" ON public.weekly_pillar_targets TO authenticated;
ALTER POLICY "Users can update their own pillar targets" ON public.weekly_pillar_targets TO authenticated;
ALTER POLICY "Users can view their own pillar targets" ON public.weekly_pillar_targets TO authenticated;
ALTER POLICY "Users manage own weekly rhythm" ON public.weekly_rhythm TO authenticated;

-- 2. Lock down rate_limits: drop overly-broad ALL policy; only allow users to read their own row.
--    Writes go through SECURITY DEFINER check_rate_limit() only.
DROP POLICY IF EXISTS "Users can manage own rate limits" ON public.rate_limits;
CREATE POLICY "Users can view own rate limits"
  ON public.rate_limits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Allow users to read their own role
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Harden check_rate_limit with input validation
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_user_id uuid, p_function_name text, p_max_requests integer DEFAULT 20, p_window_minutes integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_record rate_limits%ROWTYPE;
  v_window_start timestamp with time zone;
BEGIN
  IF p_function_name IS NULL
     OR length(p_function_name) > 100
     OR p_function_name !~ '^[a-zA-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid function name';
  END IF;
  IF p_max_requests IS NULL OR p_max_requests < 1 OR p_max_requests > 100000 THEN
    RAISE EXCEPTION 'Invalid max_requests';
  END IF;
  IF p_window_minutes IS NULL OR p_window_minutes < 1 OR p_window_minutes > 1440 THEN
    RAISE EXCEPTION 'Invalid window_minutes';
  END IF;

  v_window_start := now() - (p_window_minutes || ' minutes')::interval;

  SELECT * INTO v_record
  FROM rate_limits
  WHERE user_id = p_user_id AND function_name = p_function_name;

  IF NOT FOUND THEN
    INSERT INTO rate_limits (user_id, function_name, request_count, window_start)
    VALUES (p_user_id, p_function_name, 1, now());
    RETURN true;
  END IF;

  IF v_record.window_start < v_window_start THEN
    UPDATE rate_limits
    SET request_count = 1, window_start = now()
    WHERE user_id = p_user_id AND function_name = p_function_name;
    RETURN true;
  END IF;

  IF v_record.request_count >= p_max_requests THEN
    RETURN false;
  END IF;

  UPDATE rate_limits
  SET request_count = request_count + 1
  WHERE user_id = p_user_id AND function_name = p_function_name;

  RETURN true;
END;
$function$;

-- 5. Revoke EXECUTE from anon/public on sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_item_access(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_analytics() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_time_preferences(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_insights_semantic(uuid, vector, integer, double precision) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_documents_semantic(uuid, vector, integer, double precision) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_time_preferences(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_insights_semantic(uuid, vector, integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_documents_semantic(uuid, vector, integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_item_access(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO service_role;
