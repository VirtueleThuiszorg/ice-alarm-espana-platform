-- Single source of truth for pricing (PRICING_REFACTOR_PLAN.md).
-- Replaces the three hardcoded copies (pricing.ts, submit-registration PRICING constant,
-- marketing literals). Publicly readable (landing / /pricing render without auth); admin-write.
-- SEEDED WITH EXACT CURRENT VALUES so go-live changes nothing until an admin edits a price.

-- ── pricing_plans: membership plans as rows (extensible to future plans) ──
CREATE TABLE public.pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text UNIQUE NOT NULL,            -- 'single' | 'couple'
  monthly_net numeric NOT NULL,             -- net €/month before IVA
  annual_months integer NOT NULL DEFAULT 10,-- months charged annually (10 = 2 free)
  subscription_tax_rate numeric NOT NULL DEFAULT 0.10,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.staff(id)
);

-- ── pricing_settings: global scalar prices (keyed) ──
CREATE TABLE public.pricing_settings (
  key text PRIMARY KEY,                      -- e.g. 'pendant_net'
  value numeric NOT NULL,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.staff(id)
);

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

-- Public can READ prices (needed by landing/pricing pages, anon). No cost/margin here.
CREATE POLICY "Anyone can view pricing_plans" ON public.pricing_plans
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can view pricing_settings" ON public.pricing_settings
  FOR SELECT TO anon, authenticated USING (true);

-- Only admins can change prices.
CREATE POLICY "Admins manage pricing_plans" ON public.pricing_plans
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage pricing_settings" ON public.pricing_settings
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER pricing_plans_updated_at BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pricing_settings_updated_at BEFORE UPDATE ON public.pricing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── SEED = exact current values (single 24.99, couple 34.99; pendant 125 net @21%;
--    shipping 14.99; registration 59.99 @0%; subscription IVA 10%) ──
INSERT INTO public.pricing_plans (plan_key, monthly_net, annual_months, subscription_tax_rate, display_order) VALUES
  ('single', 24.99, 10, 0.10, 1),
  ('couple', 34.99, 10, 0.10, 2);

INSERT INTO public.pricing_settings (key, value, label) VALUES
  ('pendant_net', 125.00, 'GPS pendant net price (before IVA)'),
  ('pendant_tax_rate', 0.21, 'Pendant IVA rate'),
  ('shipping_amount', 14.99, 'Shipping (IVA included)'),
  ('registration_base', 59.99, 'Registration fee base (no IVA)'),
  ('registration_tax_rate', 0.00, 'Registration fee IVA rate');

COMMENT ON TABLE public.pricing_plans IS 'Canonical membership pricing — read by frontend + submit-registration. See PRICING_REFACTOR_PLAN.md';
COMMENT ON TABLE public.pricing_settings IS 'Canonical scalar prices (pendant/shipping/registration/taxes).';
