-- ICE import: distinguish key holders from emergency contacts.
--
-- The export has "Key Holder 1 - Name" (36 rows) and "- Tel" (18) alongside
-- three emergency contacts. A key holder is not an emergency contact: they are
-- called to gain entry, not to be informed. Rather than a separate table they
-- live in emergency_contacts with a type, so the operator card can list both in
-- one priority order.
--
-- Default 'emergency' keeps every existing row semantically unchanged.
--
-- Reverse: ALTER TABLE public.emergency_contacts DROP COLUMN IF EXISTS contact_type;

ALTER TABLE public.emergency_contacts
  ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'emergency';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emergency_contacts_contact_type_check'
  ) THEN
    ALTER TABLE public.emergency_contacts
      ADD CONSTRAINT emergency_contacts_contact_type_check
      CHECK (contact_type IN ('emergency','key_holder'));
  END IF;
END $$;
