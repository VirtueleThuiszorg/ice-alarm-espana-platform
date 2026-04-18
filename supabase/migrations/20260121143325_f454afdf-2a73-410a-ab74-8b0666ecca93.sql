-- Create enum types
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'call_centre');
CREATE TYPE public.member_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE public.device_status AS ENUM ('active', 'inactive', 'faulty', 'returned', 'in_stock');
CREATE TYPE public.device_config_status AS ENUM ('pending', 'configured', 'failed');
CREATE TYPE public.subscription_status AS ENUM ('active', 'cancelled', 'expired', 'paused');
CREATE TYPE public.plan_type AS ENUM ('single', 'couple');
CREATE TYPE public.billing_frequency AS ENUM ('monthly', 'annual');
CREATE TYPE public.payment_method AS ENUM ('stripe', 'bank_transfer', 'paypal');
CREATE TYPE public.order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE public.order_item_type AS ENUM ('pendant', 'registration_fee', 'subscription', 'shipping');
CREATE TYPE public.payment_type AS ENUM ('registration', 'subscription', 'device', 'shipping', 'order');
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE public.alert_type AS ENUM ('sos_button', 'fall_detected', 'low_battery', 'geo_fence', 'check_in', 'manual');
CREATE TYPE public.alert_status AS ENUM ('incoming', 'in_progress', 'resolved', 'escalated');
CREATE TYPE public.communication_type AS ENUM ('call_inbound', 'call_outbound', 'sms', 'whatsapp');
CREATE TYPE public.communication_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.recipient_type AS ENUM ('member', 'emergency_contact', 'emergency_services');
CREATE TYPE public.preferred_language AS ENUM ('en', 'es');

-- Table: staff (create first as it's referenced by other tables)
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email text UNIQUE NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role app_role NOT NULL,
  phone text,
  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  preferred_language preferred_language DEFAULT 'en',
  created_at timestamptz DEFAULT now()
);

-- Table: members
CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text NOT NULL,
  date_of_birth date NOT NULL,
  nie_dni text,
  address_line_1 text NOT NULL,
  address_line_2 text,
  city text NOT NULL,
  province text NOT NULL,
  postal_code text NOT NULL,
  country text DEFAULT 'Spain',
  preferred_language preferred_language DEFAULT 'en',
  photo_url text,
  special_instructions text,
  status member_status DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: medical_information
CREATE TABLE public.medical_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  medical_conditions text[],
  medications text[],
  allergies text[],
  blood_type text,
  doctor_name text,
  doctor_phone text,
  hospital_preference text,
  additional_notes text,
  updated_at timestamptz DEFAULT now()
);

-- Table: emergency_contacts
CREATE TABLE public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  contact_name text NOT NULL,
  relationship text NOT NULL,
  phone text NOT NULL,
  email text,
  is_primary boolean DEFAULT false,
  priority_order integer NOT NULL,
  notes text,
  speaks_spanish boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Table: devices
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type text DEFAULT 'pendant',
  imei text UNIQUE NOT NULL,
  sim_phone_number text NOT NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  status device_status DEFAULT 'in_stock',
  battery_level integer CHECK (battery_level >= 0 AND battery_level <= 100),
  last_location_lat decimal,
  last_location_lng decimal,
  last_location_address text,
  last_checkin_at timestamptz,
  configuration_status device_config_status DEFAULT 'pending',
  assigned_at timestamptz,
  purchased_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Table: subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  plan_type plan_type NOT NULL,
  billing_frequency billing_frequency NOT NULL,
  amount decimal NOT NULL,
  start_date date NOT NULL,
  renewal_date date NOT NULL,
  status subscription_status DEFAULT 'active',
  has_pendant boolean DEFAULT false,
  stripe_subscription_id text,
  stripe_customer_id text,
  payment_method payment_method DEFAULT 'stripe',
  registration_fee_paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Table: orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  order_number text UNIQUE NOT NULL,
  status order_status DEFAULT 'pending',
  subtotal decimal NOT NULL,
  tax_amount decimal NOT NULL,
  shipping_amount decimal DEFAULT 14.99,
  total_amount decimal NOT NULL,
  shipping_address_line_1 text NOT NULL,
  shipping_address_line_2 text,
  shipping_city text NOT NULL,
  shipping_province text NOT NULL,
  shipping_postal_code text NOT NULL,
  shipping_country text DEFAULT 'Spain',
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Table: order_items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  item_type order_item_type NOT NULL,
  description text NOT NULL,
  quantity integer DEFAULT 1,
  unit_price decimal NOT NULL,
  tax_rate decimal NOT NULL,
  tax_amount decimal NOT NULL,
  total_price decimal NOT NULL,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Table: payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount decimal NOT NULL,
  payment_type payment_type NOT NULL,
  payment_method payment_method NOT NULL,
  status payment_status DEFAULT 'pending',
  stripe_payment_id text,
  invoice_number text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Table: alerts
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  alert_type alert_type NOT NULL,
  status alert_status DEFAULT 'incoming',
  location_lat decimal,
  location_lng decimal,
  location_address text,
  received_at timestamptz DEFAULT now(),
  claimed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  emergency_services_called boolean DEFAULT false,
  next_of_kin_notified boolean DEFAULT false
);

-- Table: alert_communications
CREATE TABLE public.alert_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid REFERENCES public.alerts(id) ON DELETE CASCADE NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  communication_type communication_type NOT NULL,
  direction communication_direction NOT NULL,
  recipient_type recipient_type NOT NULL,
  recipient_phone text NOT NULL,
  duration_seconds integer,
  recording_url text,
  message_content text,
  twilio_sid text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Table: activity_logs
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Table: shift_notes
CREATE TABLE public.shift_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  note_content text NOT NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  requires_followup boolean DEFAULT false,
  followup_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_medical_information_updated_at
  BEFORE UPDATE ON public.medical_information
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Security definer function to check staff role
CREATE OR REPLACE FUNCTION public.get_staff_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.staff WHERE user_id = _user_id AND is_active = true LIMIT 1
$$;

-- Function to check if user is staff
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff WHERE user_id = _user_id AND is_active = true)
$$;

-- Function to check if user is admin or super_admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff 
    WHERE user_id = _user_id 
    AND is_active = true 
    AND role IN ('admin', 'super_admin')
  )
$$;

-- Function to get member_id for current user
CREATE OR REPLACE FUNCTION public.get_member_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.members WHERE user_id = _user_id LIMIT 1
$$;

-- Enable RLS on all tables
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for staff
CREATE POLICY "Staff can view all staff" ON public.staff FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Super admins can manage staff" ON public.staff FOR ALL TO authenticated USING (public.get_staff_role(auth.uid()) = 'super_admin');

-- RLS Policies for members
CREATE POLICY "Staff can view all members" ON public.members FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage members" ON public.members FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own profile" ON public.members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Members can update own profile" ON public.members FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- RLS Policies for medical_information
CREATE POLICY "Staff can view medical info" ON public.medical_information FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage medical info" ON public.medical_information FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own medical info" ON public.medical_information FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));
CREATE POLICY "Members can update own medical info" ON public.medical_information FOR UPDATE TO authenticated USING (member_id = public.get_member_id(auth.uid()));

-- RLS Policies for emergency_contacts
CREATE POLICY "Staff can view emergency contacts" ON public.emergency_contacts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage emergency contacts" ON public.emergency_contacts FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own contacts" ON public.emergency_contacts FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));
CREATE POLICY "Members can manage own contacts" ON public.emergency_contacts FOR ALL TO authenticated USING (member_id = public.get_member_id(auth.uid()));

-- RLS Policies for devices
CREATE POLICY "Staff can view all devices" ON public.devices FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage devices" ON public.devices FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own device" ON public.devices FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));

-- RLS Policies for subscriptions
CREATE POLICY "Staff can view all subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage subscriptions" ON public.subscriptions FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));

-- RLS Policies for orders
CREATE POLICY "Staff can view all orders" ON public.orders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage orders" ON public.orders FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own orders" ON public.orders FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));

-- RLS Policies for order_items
CREATE POLICY "Staff can view all order items" ON public.order_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage order items" ON public.order_items FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own order items" ON public.order_items FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.member_id = public.get_member_id(auth.uid())));

-- RLS Policies for payments
CREATE POLICY "Staff can view all payments" ON public.payments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage payments" ON public.payments FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own payments" ON public.payments FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));

-- RLS Policies for alerts
CREATE POLICY "Staff can view all alerts" ON public.alerts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage alerts" ON public.alerts FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Members can view own alerts" ON public.alerts FOR SELECT TO authenticated USING (member_id = public.get_member_id(auth.uid()));

-- RLS Policies for alert_communications
CREATE POLICY "Staff can view all communications" ON public.alert_communications FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage communications" ON public.alert_communications FOR ALL TO authenticated USING (public.is_staff(auth.uid()));

-- RLS Policies for activity_logs
CREATE POLICY "Admins can view activity logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Staff can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- RLS Policies for shift_notes
CREATE POLICY "Staff can view shift notes" ON public.shift_notes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage shift notes" ON public.shift_notes FOR ALL TO authenticated USING (public.is_staff(auth.uid()));

-- Enable realtime for alerts table
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- Create indexes for better performance
CREATE INDEX idx_members_user_id ON public.members(user_id);
CREATE INDEX idx_members_email ON public.members(email);
CREATE INDEX idx_members_status ON public.members(status);
CREATE INDEX idx_medical_information_member_id ON public.medical_information(member_id);
CREATE INDEX idx_emergency_contacts_member_id ON public.emergency_contacts(member_id);
CREATE INDEX idx_devices_member_id ON public.devices(member_id);
CREATE INDEX idx_devices_status ON public.devices(status);
CREATE INDEX idx_devices_imei ON public.devices(imei);
CREATE INDEX idx_subscriptions_member_id ON public.subscriptions(member_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_orders_member_id ON public.orders(member_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_payments_member_id ON public.payments(member_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_alerts_member_id ON public.alerts(member_id);
CREATE INDEX idx_alerts_status ON public.alerts(status);
CREATE INDEX idx_alerts_received_at ON public.alerts(received_at);
CREATE INDEX idx_alert_communications_alert_id ON public.alert_communications(alert_id);
CREATE INDEX idx_activity_logs_entity_type_id ON public.activity_logs(entity_type, entity_id);
CREATE INDEX idx_shift_notes_staff_id ON public.shift_notes(staff_id);
CREATE INDEX idx_staff_user_id ON public.staff(user_id);