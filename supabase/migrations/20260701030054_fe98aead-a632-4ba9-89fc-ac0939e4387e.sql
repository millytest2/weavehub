
-- action_history: add UPDATE + DELETE policies
CREATE POLICY "Users can update their own action history"
  ON public.action_history FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own action history"
  ON public.action_history FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- grounding_log: add DELETE policy
CREATE POLICY "Users can delete their own grounding log"
  ON public.grounding_log FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- rate_limits: add INSERT/UPDATE/DELETE scoped to user
CREATE POLICY "Users can insert their own rate limits"
  ON public.rate_limits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own rate limits"
  ON public.rate_limits FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own rate limits"
  ON public.rate_limits FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Revoke EXECUTE on SECURITY DEFINER functions from anon/public
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_analytics() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_users() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_item_access(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_completed_action() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_item_access(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
