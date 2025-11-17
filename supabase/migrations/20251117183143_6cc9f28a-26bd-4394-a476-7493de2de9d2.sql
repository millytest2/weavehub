-- Fix experiments status constraint to include 'in_progress'
ALTER TABLE experiments DROP CONSTRAINT IF EXISTS experiments_status_check;
ALTER TABLE experiments ADD CONSTRAINT experiments_status_check 
  CHECK (status = ANY (ARRAY['planning'::text, 'in_progress'::text, 'running'::text, 'completed'::text, 'failed'::text]));