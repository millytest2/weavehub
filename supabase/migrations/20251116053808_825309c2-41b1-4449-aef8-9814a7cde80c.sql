-- Enable realtime for experiments table
ALTER PUBLICATION supabase_realtime ADD TABLE public.experiments;

-- Enable realtime for daily_tasks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_tasks;