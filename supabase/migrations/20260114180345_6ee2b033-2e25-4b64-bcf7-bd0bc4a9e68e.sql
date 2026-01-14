-- Update default duration_days from 30 to 14 for new learning paths
ALTER TABLE public.learning_paths 
ALTER COLUMN duration_days SET DEFAULT 14;

-- Also update any existing paths that have 30 days to use 14 (if they haven't started yet)
UPDATE public.learning_paths 
SET duration_days = 14 
WHERE duration_days = 30 AND (current_day = 0 OR current_day IS NULL);