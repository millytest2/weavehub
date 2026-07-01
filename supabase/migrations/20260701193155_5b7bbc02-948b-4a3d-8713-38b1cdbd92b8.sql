
ALTER TABLE public.identity_seeds
  ADD COLUMN IF NOT EXISTS previous_reality text,
  ADD COLUMN IF NOT EXISTS reality_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.identity_seeds_track_reality()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.weekly_focus, '') <> COALESCE(OLD.weekly_focus, '')
     AND COALESCE(OLD.weekly_focus, '') <> '' THEN
    NEW.previous_reality := OLD.weekly_focus;
    NEW.reality_updated_at := now();
  ELSIF TG_OP = 'INSERT' AND COALESCE(NEW.weekly_focus, '') <> '' THEN
    NEW.reality_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.identity_seeds_track_reality() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_identity_seeds_track_reality ON public.identity_seeds;
CREATE TRIGGER trg_identity_seeds_track_reality
BEFORE INSERT OR UPDATE ON public.identity_seeds
FOR EACH ROW EXECUTE FUNCTION public.identity_seeds_track_reality();
