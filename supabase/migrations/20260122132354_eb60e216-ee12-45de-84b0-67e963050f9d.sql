-- Create enums for CRM import system
CREATE TYPE public.import_batch_status AS ENUM ('uploaded', 'parsed', 'importing', 'completed', 'failed');
CREATE TYPE public.import_row_target AS ENUM ('member', 'crm_contact', 'skip');
CREATE TYPE public.import_row_status AS ENUM ('pending', 'imported', 'failed', 'skipped');
CREATE TYPE public.contact_method_type AS ENUM ('email', 'phone', 'social', 'other');

-- Table: crm_import_batches
CREATE TABLE public.crm_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  source text NOT NULL DEFAULT 'karmacrm_csv',
  filename text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  status public.import_batch_status NOT NULL DEFAULT 'uploaded',
  notes text
);

-- Table: crm_contacts (for incomplete records that cannot become members)
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'karmacrm',
  first_name text,
  last_name text,
  full_name text,
  email_primary text,
  phone_primary text,
  status text,
  stage text,
  referral_source text,
  assigned_to_staff_id uuid REFERENCES public.staff(id),
  tags text[] DEFAULT '{}',
  groups text[] DEFAULT '{}',
  notes text,
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  postal_code text,
  country text,
  linked_member_id uuid REFERENCES public.members(id),
  last_synced_at timestamp with time zone
);

-- Table: crm_import_rows (RAW VAULT)
CREATE TABLE public.crm_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  batch_id uuid NOT NULL REFERENCES public.crm_import_batches(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  raw jsonb NOT NULL,
  dedupe_key text,
  parsed_first_name text,
  parsed_last_name text,
  parsed_full_name text,
  parsed_email_primary text,
  parsed_phone_primary text,
  parsed_status text,
  parsed_stage text,
  parsed_referral_source text,
  parsed_city text,
  parsed_postal_code text,
  parsed_country text,
  parsed_membership_type text,
  parsed_device_imei text,
  parsed_notes text,
  import_target public.import_row_target DEFAULT 'member',
  imported_member_id uuid REFERENCES public.members(id),
  imported_crm_contact_id uuid REFERENCES public.crm_contacts(id),
  import_status public.import_row_status NOT NULL DEFAULT 'pending',
  error_message text
);

-- Table: member_contact_methods (extra emails/phones)
CREATE TABLE public.member_contact_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  type public.contact_method_type NOT NULL,
  label text,
  value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false
);

-- Table: crm_profiles (CRM-only fields for members)
CREATE TABLE public.crm_profiles (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  stage text,
  status text,
  referral_source text,
  industry text,
  department text,
  assigned_to_staff_id uuid REFERENCES public.staff(id),
  tags text[] DEFAULT '{}',
  groups text[] DEFAULT '{}',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.crm_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_contact_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies: crm_import_batches (staff/admin only)
CREATE POLICY "Staff can view import batches"
  ON public.crm_import_batches FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage import batches"
  ON public.crm_import_batches FOR ALL
  USING (is_admin(auth.uid()));

-- RLS Policies: crm_import_rows (staff/admin only)
CREATE POLICY "Staff can view import rows"
  ON public.crm_import_rows FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage import rows"
  ON public.crm_import_rows FOR ALL
  USING (is_admin(auth.uid()));

-- RLS Policies: crm_contacts (staff/admin only)
CREATE POLICY "Staff can view crm contacts"
  ON public.crm_contacts FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can manage crm contacts"
  ON public.crm_contacts FOR ALL
  USING (is_admin(auth.uid()));

-- RLS Policies: member_contact_methods
CREATE POLICY "Staff can manage contact methods"
  ON public.member_contact_methods FOR ALL
  USING (is_staff(auth.uid()));

CREATE POLICY "Members can view own contact methods"
  ON public.member_contact_methods FOR SELECT
  USING (member_id = get_member_id(auth.uid()));

-- RLS Policies: crm_profiles
CREATE POLICY "Staff can manage crm profiles"
  ON public.crm_profiles FOR ALL
  USING (is_staff(auth.uid()));

CREATE POLICY "Members can view own crm profile"
  ON public.crm_profiles FOR SELECT
  USING (member_id = get_member_id(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_crm_import_rows_batch_id ON public.crm_import_rows(batch_id);
CREATE INDEX idx_crm_import_rows_dedupe_key ON public.crm_import_rows(dedupe_key);
CREATE INDEX idx_crm_contacts_email ON public.crm_contacts(email_primary);
CREATE INDEX idx_crm_contacts_linked_member ON public.crm_contacts(linked_member_id);
CREATE INDEX idx_member_contact_methods_member ON public.member_contact_methods(member_id);

-- Trigger for crm_profiles updated_at
CREATE TRIGGER update_crm_profiles_updated_at
  BEFORE UPDATE ON public.crm_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();