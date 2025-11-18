-- Add phase tracking to identity_seeds
ALTER TABLE identity_seeds 
ADD COLUMN current_phase TEXT DEFAULT 'baseline' CHECK (current_phase IN ('baseline', 'empire'));

-- Add triple-score fields to experiments
ALTER TABLE experiments 
ADD COLUMN baseline_impact INTEGER DEFAULT 0 CHECK (baseline_impact >= 0 AND baseline_impact <= 10),
ADD COLUMN content_fuel INTEGER DEFAULT 0 CHECK (content_fuel >= 0 AND content_fuel <= 10),
ADD COLUMN identity_alignment INTEGER DEFAULT 0 CHECK (identity_alignment >= 0 AND identity_alignment <= 10);

-- Add baseline tracking fields to identity_seeds
ALTER TABLE identity_seeds
ADD COLUMN target_monthly_income INTEGER DEFAULT 4000,
ADD COLUMN current_monthly_income INTEGER DEFAULT 0,
ADD COLUMN job_apps_this_week INTEGER DEFAULT 0,
ADD COLUMN job_apps_goal INTEGER DEFAULT 50,
ADD COLUMN days_to_move INTEGER,
ADD COLUMN weekly_focus TEXT;