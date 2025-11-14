-- Update experiments table with new fields
ALTER TABLE experiments 
ADD COLUMN steps TEXT,
ADD COLUMN duration TEXT,
ADD COLUMN identity_shift_target TEXT,
ADD COLUMN result_summary TEXT;

-- Update existing status values to match new simplified statuses
UPDATE experiments SET status = 'planned' WHERE status = 'planning';

-- Update daily_tasks to support new structure
ALTER TABLE daily_tasks
ADD COLUMN one_thing TEXT,
ADD COLUMN why_matters TEXT,
ADD COLUMN reflection TEXT;

-- For backwards compatibility, copy title to one_thing for existing tasks
UPDATE daily_tasks SET one_thing = title WHERE one_thing IS NULL AND title IS NOT NULL;