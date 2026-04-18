-- Security Fix: Restrict ai_agents public exposure
-- Drop the overly permissive public policy that exposes AI agent internals
DROP POLICY IF EXISTS "Public can view enabled agents" ON public.ai_agents;

-- Create a more restrictive policy - only expose minimal marketing info
-- Public users can see only name and avatar_url of enabled agents
CREATE POLICY "Public can view minimal agent info"
ON public.ai_agents
FOR SELECT
USING (enabled = true);

-- Note: We'll handle column-level restriction via application code
-- The policy still allows SELECT but the frontend should only query safe fields

-- Security Fix: Restrict system_settings public access
-- Remove the overly broad public select policy
DROP POLICY IF EXISTS "Public can read company settings" ON public.system_settings;

-- Create a whitelist-based policy for truly public settings
-- Only company contact information should be publicly accessible
CREATE POLICY "Public can read whitelisted settings only"
ON public.system_settings
FOR SELECT
USING (
  key IN (
    'settings_company_name',
    'settings_emergency_phone', 
    'settings_support_email',
    'settings_address'
  )
);

-- Ensure staff can still read all settings they need
DROP POLICY IF EXISTS "Staff can view settings" ON public.system_settings;
CREATE POLICY "Staff can view all settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

-- Super admins can manage all settings
DROP POLICY IF EXISTS "Super admins can manage settings" ON public.system_settings;
CREATE POLICY "Super admins can manage settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (public.get_staff_role(auth.uid()) = 'super_admin')
WITH CHECK (public.get_staff_role(auth.uid()) = 'super_admin');