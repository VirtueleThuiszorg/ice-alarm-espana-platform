CREATE SCHEMA IF NOT EXISTS auth;
-- Stand-in for Supabase's auth.uid(); the harness sets it per-test.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('harness.uid', true), '')::uuid $$;

CREATE TYPE member_status AS ENUM ('active','inactive','suspended');
CREATE TYPE plan_type AS ENUM ('single','couple');
CREATE TYPE billing_frequency AS ENUM ('monthly','annual');
CREATE TYPE subscription_status AS ENUM ('active','cancelled','expired','paused','pending','past_due','suspended');
CREATE TYPE payment_method AS ENUM ('stripe','bank_transfer','paypal');
CREATE TYPE device_status AS ENUM ('active','inactive','faulty','returned','in_stock','reserved','allocated','with_staff','live');
CREATE TYPE contact_method_type AS ENUM ('email','phone','social','other');
CREATE TYPE app_role AS ENUM ('super_admin','admin','call_centre','call_centre_supervisor');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, role app_role, is_active boolean DEFAULT true
);
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT EXISTS (SELECT 1 FROM public.staff WHERE user_id=_user_id AND is_active AND role IN ('admin','super_admin')) $$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT EXISTS (SELECT 1 FROM public.staff WHERE user_id=_user_id AND is_active) $$;

CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE,
  first_name text NOT NULL, last_name text NOT NULL, email text UNIQUE NOT NULL,
  phone text NOT NULL, date_of_birth date NOT NULL, nie_dni text,
  address_line_1 text NOT NULL, address_line_2 text, city text NOT NULL,
  province text NOT NULL, postal_code text NOT NULL, country text DEFAULT 'Spain',
  photo_url text, special_instructions text, status member_status DEFAULT 'active',
  courtesy_calls_enabled boolean DEFAULT true, next_courtesy_call_date date,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.get_member_id(_user_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT id FROM public.members WHERE user_id=_user_id $$;

CREATE TABLE public.medical_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  medical_conditions text[], medications text[], allergies text[], blood_type text,
  doctor_name text, doctor_phone text, hospital_preference text, additional_notes text,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  contact_name text NOT NULL, relationship text NOT NULL, phone text NOT NULL,
  email text, priority_order integer NOT NULL, is_primary boolean DEFAULT false,
  speaks_spanish boolean, notes text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), imei text NOT NULL,
  sim_phone_number text NOT NULL, member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  status device_status DEFAULT 'in_stock', device_type text, model text,
  serial_number text, notes text, created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_devices_one_member ON devices(member_id) WHERE member_id IS NOT NULL;
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  plan_type plan_type NOT NULL, billing_frequency billing_frequency NOT NULL,
  status subscription_status DEFAULT 'pending', start_date date NOT NULL,
  renewal_date date NOT NULL, amount numeric NOT NULL, has_pendant boolean DEFAULT false,
  payment_method payment_method, registration_fee_paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.member_contact_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  type contact_method_type NOT NULL, label text, value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.member_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  staff_id uuid, note_type text DEFAULT 'general', content text NOT NULL,
  is_pinned boolean DEFAULT false, is_private boolean DEFAULT false,
  followup_date date, followup_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL,
  first_name text, last_name text, full_name text, email_primary text,
  phone_primary text, status text, stage text, referral_source text,
  address_line_1 text, address_line_2 text, city text, province text,
  postal_code text, country text, notes text, tags text[] DEFAULT '{}',
  groups text[] DEFAULT '{}', linked_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  assigned_to_staff_id uuid, last_synced_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.crm_profiles (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  stage text, status text, referral_source text, industry text, department text,
  assigned_to_staff_id uuid, tags text[] DEFAULT '{}', groups text[] DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
