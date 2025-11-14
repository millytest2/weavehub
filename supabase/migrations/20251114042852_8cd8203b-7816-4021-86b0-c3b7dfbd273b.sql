-- Create identity_seeds table
CREATE TABLE public.identity_seeds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.identity_seeds ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own identity seed
CREATE POLICY "Users can manage own identity seed"
ON public.identity_seeds
FOR ALL
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_identity_seeds_updated_at
BEFORE UPDATE ON public.identity_seeds
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create index for faster lookups
CREATE INDEX idx_identity_seeds_user_id ON public.identity_seeds(user_id);