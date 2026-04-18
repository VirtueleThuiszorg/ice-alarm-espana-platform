-- Create a combined function to get all user role info in a single call
-- This replaces 5 separate RPC calls with 1
CREATE OR REPLACE FUNCTION public.get_user_role_info(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
  _staff_role app_role;
  _partner_id uuid;
  _member_id uuid;
  _is_staff boolean;
  _is_partner boolean;
BEGIN
  -- Check staff status and role
  SELECT role INTO _staff_role 
  FROM public.staff 
  WHERE user_id = _user_id AND is_active = true 
  LIMIT 1;
  
  _is_staff := _staff_role IS NOT NULL;
  
  -- Check partner status and get ID
  SELECT id INTO _partner_id 
  FROM public.partners 
  WHERE user_id = _user_id AND status = 'active' 
  LIMIT 1;
  
  _is_partner := _partner_id IS NOT NULL;
  
  -- Get member ID
  SELECT id INTO _member_id 
  FROM public.members 
  WHERE user_id = _user_id 
  LIMIT 1;
  
  -- Build result JSON
  SELECT json_build_object(
    'is_staff', _is_staff,
    'staff_role', _staff_role,
    'is_partner', _is_partner,
    'partner_id', _partner_id,
    'member_id', _member_id
  ) INTO result;
  
  RETURN result;
END;
$$;