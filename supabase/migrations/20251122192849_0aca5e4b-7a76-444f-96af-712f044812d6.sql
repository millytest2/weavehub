-- Add task_sequence column to track which task in the daily set (1, 2, or 3)
ALTER TABLE daily_tasks ADD COLUMN task_sequence INTEGER DEFAULT 1;

-- Update the unique constraint to include sequence
ALTER TABLE daily_tasks DROP CONSTRAINT daily_tasks_user_id_task_date_key;
ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_user_id_task_date_sequence_key UNIQUE (user_id, task_date, task_sequence);