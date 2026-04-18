-- Add courtesy_call_frequency column to members table
ALTER TABLE public.members 
ADD COLUMN IF NOT EXISTS courtesy_call_frequency text DEFAULT 'monthly';