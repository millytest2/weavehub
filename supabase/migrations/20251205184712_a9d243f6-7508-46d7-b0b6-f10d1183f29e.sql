-- Fix update_item_access function with ownership check and proper search_path
CREATE OR REPLACE FUNCTION public.update_item_access(
  table_name text, 
  item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF table_name = 'insights' THEN
    UPDATE public.insights 
    SET last_accessed = now(), access_count = access_count + 1 
    WHERE id = item_id AND user_id = current_user_id;
  ELSIF table_name = 'documents' THEN
    UPDATE public.documents 
    SET last_accessed = now(), access_count = access_count + 1 
    WHERE id = item_id AND user_id = current_user_id;
  END IF;
END;
$$;

-- Fix search_path on other mutable functions
CREATE OR REPLACE FUNCTION public.calculate_relevance_decay(
  created_at timestamp with time zone, 
  last_accessed timestamp with time zone, 
  access_count integer, 
  base_relevance double precision DEFAULT 1.0
)
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  age_days float;
  recency_boost float;
  access_boost float;
  decay_factor float;
BEGIN
  age_days := EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0;
  decay_factor := POWER(0.5, age_days / 30.0);
  
  recency_boost := CASE 
    WHEN last_accessed > now() - interval '7 days' THEN 0.3
    WHEN last_accessed > now() - interval '30 days' THEN 0.15
    ELSE 0
  END;
  
  access_boost := LEAST(access_count * 0.02, 0.2);
  
  RETURN LEAST(base_relevance * decay_factor + recency_boost + access_boost, 1.0);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_insights_semantic(
  user_uuid uuid, 
  query_embedding vector, 
  match_count integer DEFAULT 10, 
  similarity_threshold double precision DEFAULT 0.5
)
RETURNS TABLE(
  id uuid, 
  title text, 
  content text, 
  source text, 
  created_at timestamp with time zone, 
  similarity double precision, 
  final_relevance double precision
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.title,
    i.content,
    i.source,
    i.created_at,
    1 - (i.embedding <=> query_embedding) as similarity,
    (1 - (i.embedding <=> query_embedding)) * 
      calculate_relevance_decay(i.created_at, i.last_accessed, i.access_count, i.relevance_score) as final_relevance
  FROM public.insights i
  WHERE i.user_id = user_uuid
    AND i.embedding IS NOT NULL
    AND 1 - (i.embedding <=> query_embedding) > similarity_threshold
  ORDER BY final_relevance DESC
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_documents_semantic(
  user_uuid uuid, 
  query_embedding vector, 
  match_count integer DEFAULT 5, 
  similarity_threshold double precision DEFAULT 0.5
)
RETURNS TABLE(
  id uuid, 
  title text, 
  summary text, 
  created_at timestamp with time zone, 
  similarity double precision, 
  final_relevance double precision
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d.summary,
    d.created_at,
    1 - (d.embedding <=> query_embedding) as similarity,
    (1 - (d.embedding <=> query_embedding)) * 
      calculate_relevance_decay(d.created_at, d.last_accessed, d.access_count, d.relevance_score) as final_relevance
  FROM public.documents d
  WHERE d.user_id = user_uuid
    AND d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) > similarity_threshold
  ORDER BY final_relevance DESC
  LIMIT match_count;
END;
$$;