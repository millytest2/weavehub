
CREATE TABLE public.substack_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  name TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.substack_sources TO authenticated;
GRANT ALL ON public.substack_sources TO service_role;
ALTER TABLE public.substack_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own substack sources" ON public.substack_sources FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.substack_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.substack_sources(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  link TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, guid)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.substack_posts TO authenticated;
GRANT ALL ON public.substack_posts TO service_role;
ALTER TABLE public.substack_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own substack posts" ON public.substack_posts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX substack_posts_user_pub_idx ON public.substack_posts(user_id, published_at DESC);
