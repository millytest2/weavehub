-- Add pillar column to daily_tasks to track which life domain each action belongs to
ALTER TABLE daily_tasks ADD COLUMN pillar TEXT;

-- Add check constraint to ensure pillar is one of the six valid options
ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_pillar_check 
  CHECK (pillar IN ('Cash', 'Skill', 'Content', 'Health', 'Presence', 'Admin'));

-- Create index for faster pillar-based queries
CREATE INDEX idx_daily_tasks_pillar ON daily_tasks(pillar);

-- Add last_pillar_used to identity_seeds to track rotation
ALTER TABLE identity_seeds ADD COLUMN last_pillar_used TEXT;

-- Add check constraint for last_pillar_used
ALTER TABLE identity_seeds ADD CONSTRAINT identity_seeds_pillar_check 
  CHECK (last_pillar_used IN ('Cash', 'Skill', 'Content', 'Health', 'Presence', 'Admin'));