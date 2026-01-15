-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create platform_voice_templates table for storing brand voice settings
CREATE TABLE public.platform_voice_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  brand_identity TEXT,
  content_pillars JSONB DEFAULT '[]'::jsonb,
  platform_voices JSONB DEFAULT '{}'::jsonb,
  personality_blend TEXT,
  values TEXT[],
  avoid_list TEXT[],
  vision_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE public.platform_voice_templates ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own templates
CREATE POLICY "Users can manage own voice templates"
ON public.platform_voice_templates
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_platform_voice_templates_updated_at
BEFORE UPDATE ON public.platform_voice_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();