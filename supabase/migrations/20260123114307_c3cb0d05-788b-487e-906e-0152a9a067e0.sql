-- Create cost category enum
CREATE TYPE public.cost_category AS ENUM ('supplier_payment', 'operational', 'marketing', 'staff', 'other');

-- Create cost frequency enum
CREATE TYPE public.cost_frequency AS ENUM ('one_time', 'monthly', 'annual');

-- Create cost status enum
CREATE TYPE public.cost_status AS ENUM ('pending', 'paid', 'overdue');

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  description TEXT,
  selling_price_net NUMERIC(10, 2) NOT NULL DEFAULT 0,
  selling_tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.21,
  cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  supplier_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create operational_costs table
CREATE TABLE public.operational_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category public.cost_category NOT NULL DEFAULT 'other',
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  frequency public.cost_frequency NOT NULL DEFAULT 'one_time',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  status public.cost_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add product_id and cost_price to order_items
ALTER TABLE public.order_items 
ADD COLUMN product_id UUID REFERENCES public.products(id),
ADD COLUMN cost_price NUMERIC(10, 2);

-- Enable RLS on products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Staff can read products
CREATE POLICY "Staff can read products"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Admin can manage products
CREATE POLICY "Admin can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Admin can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Admin can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

-- Enable RLS on operational_costs
ALTER TABLE public.operational_costs ENABLE ROW LEVEL SECURITY;

-- Staff can read operational costs
CREATE POLICY "Staff can read operational costs"
  ON public.operational_costs FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Admin can manage operational costs
CREATE POLICY "Admin can insert operational costs"
  ON public.operational_costs FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Admin can update operational costs"
  ON public.operational_costs FOR UPDATE
  TO authenticated
  USING (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Admin can delete operational costs"
  ON public.operational_costs FOR DELETE
  TO authenticated
  USING (public.get_staff_role(auth.uid()) IN ('admin', 'super_admin'));

-- Create trigger for updated_at on products
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on operational_costs
CREATE TRIGGER update_operational_costs_updated_at
  BEFORE UPDATE ON public.operational_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default products
INSERT INTO public.products (name, sku, description, selling_price_net, selling_tax_rate, cost_price, supplier_name)
VALUES 
  ('GPS Pendant', 'PENDANT-GPS-001', 'GPS-enabled emergency pendant with fall detection', 125.00, 0.21, 0, NULL),
  ('Registration Fee', 'FEE-REG-001', 'One-time registration and setup fee', 59.99, 0, 0, NULL),
  ('Shipping', 'SHIP-STD-001', 'Standard shipping within Spain', 14.99, 0, 0, NULL);