-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding and relevance columns to insights
ALTER TABLE public.insights 
ADD COLUMN IF NOT EXISTS embedding vector(384),
ADD COLUMN IF NOT EXISTS relevance_score float DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS last_accessed timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS access_count integer DEFAULT 0;

-- Add embedding and relevance columns to documents
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS embedding vector(384),
ADD COLUMN IF NOT EXISTS relevance_score float DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS last_accessed timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS access_count integer DEFAULT 0;

-- Create index for vector similarity search on insights
CREATE INDEX IF NOT EXISTS insights_embedding_idx ON public.insights 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for vector similarity search on documents
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON public.documents 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Function to calculate decay score (exponential decay over 30 days)
CREATE OR REPLACE FUNCTION public.calculate_relevance_decay(
  created_at timestamp with time zone,
  last_accessed timestamp with time zone,
  access_count integer,
  base_relevance float DEFAULT 1.0
)
RETURNS float
LANGUAGE plpgsql
AS $$
DECLARE
  age_days float;
  recency_boost float;
  access_boost float;
  decay_factor float;
BEGIN
  -- Calculate age in days
  age_days := EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0;
  
  -- Exponential decay: half-life of 30 days for background, but recent items stay high
  decay_factor := POWER(0.5, age_days / 30.0);
  
  -- Recency boost: items accessed recently get a boost
  recency_boost := CASE 
    WHEN last_accessed > now() - interval '7 days' THEN 0.3
    WHEN last_accessed > now() - interval '30 days' THEN 0.15
    ELSE 0
  END;
  
  -- Access frequency boost (capped at 0.2)
  access_boost := LEAST(access_count * 0.02, 0.2);
  
  RETURN LEAST(base_relevance * decay_factor + recency_boost + access_boost, 1.0);
END;
$$;

-- Function to search insights by semantic similarity with relevance decay
CREATE OR REPLACE FUNCTION public.search_insights_semantic(
  user_uuid uuid,
  query_embedding vector(384),
  match_count integer DEFAULT 10,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  source text,
  created_at timestamp with time zone,
  similarity float,
  final_relevance float
)
LANGUAGE plpgsql
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

-- Function to search documents by semantic similarity with relevance decay
CREATE OR REPLACE FUNCTION public.search_documents_semantic(
  user_uuid uuid,
  query_embedding vector(384),
  match_count integer DEFAULT 5,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  summary text,
  created_at timestamp with time zone,
  similarity float,
  final_relevance float
)
LANGUAGE plpgsql
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

-- Update access tracking when items are retrieved
CREATE OR REPLACE FUNCTION public.update_item_access(
  table_name text,
  item_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF table_name = 'insights' THEN
    UPDATE public.insights 
    SET last_accessed = now(), access_count = access_count + 1 
    WHERE id = item_id;
  ELSIF table_name = 'documents' THEN
    UPDATE public.documents 
    SET last_accessed = now(), access_count = access_count + 1 
    WHERE id = item_id;
  END IF;
END;
$$;