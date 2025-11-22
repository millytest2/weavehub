-- First, delete duplicate rows keeping only the most recent one
DELETE FROM daily_tasks a
USING daily_tasks b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.task_date = b.task_date;

-- Now add the unique constraint
ALTER TABLE daily_tasks 
ADD CONSTRAINT daily_tasks_user_id_task_date_key UNIQUE (user_id, task_date);