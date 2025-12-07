-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.is_admin());

-- Create admin analytics view function
CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS TABLE (
    total_users bigint,
    users_this_week bigint,
    users_this_month bigint,
    total_insights bigint,
    total_experiments bigint,
    total_documents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin role required';
    END IF;
    
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.profiles)::bigint as total_users,
        (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '7 days')::bigint as users_this_week,
        (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '30 days')::bigint as users_this_month,
        (SELECT COUNT(*) FROM public.insights)::bigint as total_insights,
        (SELECT COUNT(*) FROM public.experiments)::bigint as total_experiments,
        (SELECT COUNT(*) FROM public.documents)::bigint as total_documents;
END;
$$;

-- Create function to get user list (admin only)
CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE (
    id uuid,
    full_name text,
    created_at timestamp with time zone,
    insights_count bigint,
    experiments_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        (SELECT COUNT(*) FROM public.insights i WHERE i.user_id = p.id)::bigint as insights_count,
        (SELECT COUNT(*) FROM public.experiments e WHERE e.user_id = p.id)::bigint as experiments_count
    FROM public.profiles p
    ORDER BY p.created_at DESC;
END;
$$;