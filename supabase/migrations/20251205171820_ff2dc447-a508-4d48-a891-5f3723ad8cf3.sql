-- Add extracted_content column to store full text/transcripts for preview
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS extracted_content TEXT;