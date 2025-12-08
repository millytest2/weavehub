-- Add core_values column to identity_seeds table
ALTER TABLE public.identity_seeds 
ADD COLUMN IF NOT EXISTS core_values text;