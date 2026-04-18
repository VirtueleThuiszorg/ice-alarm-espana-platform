-- Add CIF (Spanish tax ID) column for company partners
ALTER TABLE public.partners 
ADD COLUMN cif TEXT;

-- Add helpful comment
COMMENT ON COLUMN public.partners.cif IS 'Spanish tax identification number (CIF/NIF) for company partners';