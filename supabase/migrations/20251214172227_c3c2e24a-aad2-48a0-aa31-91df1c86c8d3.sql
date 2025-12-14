-- Drop existing function first
DROP FUNCTION IF EXISTS public.get_admin_users();

-- Recreate with more details
CREATE FUNCTION public.get_admin_users()
RETURNS TABLE(
  id uuid, 
  full_name text, 
  created_at timestamp with time zone,
  last_active timestamp with time zone,
  insights_count bigint, 
  experiments_count bigint,
  documents_count bigint,
  actions_completed bigint,
  has_identity_seed boolean,
  current_streak integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin role required';
    END IF;
    
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.created_at,
        -- Last active = most recent of any activity
        GREATEST(
            p.updated_at,
            (SELECT MAX(ah.completed_at) FROM public.action_history ah WHERE ah.user_id = p.id),
            (SELECT MAX(i.created_at) FROM public.insights i WHERE i.user_id = p.id),
            (SELECT MAX(dt.created_at) FROM public.daily_tasks dt WHERE dt.user_id = p.id)
        ) as last_active,
        (SELECT COUNT(*) FROM public.insights i WHERE i.user_id = p.id)::bigint as insights_count,
        (SELECT COUNT(*) FROM public.experiments e WHERE e.user_id = p.id)::bigint as experiments_count,
        (SELECT COUNT(*) FROM public.documents d WHERE d.user_id = p.id)::bigint as documents_count,
        (SELECT COUNT(*) FROM public.action_history ah WHERE ah.user_id = p.id)::bigint as actions_completed,
        (SELECT EXISTS(SELECT 1 FROM public.identity_seeds ids WHERE ids.user_id = p.id)) as has_identity_seed,
        -- Calculate streak: consecutive days with completed actions
        COALESCE((
            WITH recent_dates AS (
                SELECT DISTINCT action_date 
                FROM public.action_history ah 
                WHERE ah.user_id = p.id 
                ORDER BY action_date DESC
                LIMIT 30
            ),
            streak_calc AS (
                SELECT 
                    action_date,
                    action_date - (ROW_NUMBER() OVER (ORDER BY action_date DESC))::int AS grp
                FROM recent_dates
            )
            SELECT COUNT(*)::integer
            FROM streak_calc
            WHERE grp = (SELECT grp FROM streak_calc WHERE action_date = CURRENT_DATE)
        ), 0) as current_streak
    FROM public.profiles p
    ORDER BY last_active DESC NULLS LAST;
END;
$$;