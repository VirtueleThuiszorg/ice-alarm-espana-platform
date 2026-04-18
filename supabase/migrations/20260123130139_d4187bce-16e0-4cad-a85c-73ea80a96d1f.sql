-- Allow public read access to non-sensitive company settings
CREATE POLICY "Public can read company settings" 
ON public.system_settings 
FOR SELECT 
USING (
  key IN (
    'settings_company_name',
    'settings_emergency_phone', 
    'settings_support_email',
    'settings_address',
    'registration_fee_enabled',
    'registration_fee_discount',
    'single_monthly',
    'single_annual',
    'couple_monthly',
    'couple_annual'
  )
);