-- Add contact preference fields to members table
ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS preferred_contact_method text,
ADD COLUMN IF NOT EXISTS preferred_contact_time text;

-- Add comment for documentation
COMMENT ON COLUMN public.members.preferred_contact_method IS 'Preferred contact method: whatsapp, phone, or email';
COMMENT ON COLUMN public.members.preferred_contact_time IS 'Best time to contact: morning, afternoon, evening, or anytime';