-- Create a function to efficiently get today's birthdays
-- This avoids loading all members and filtering client-side
CREATE OR REPLACE FUNCTION public.get_todays_birthdays()
RETURNS SETOF members
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT * FROM members 
  WHERE status = 'active' 
  AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND EXTRACT(DAY FROM date_of_birth) = EXTRACT(DAY FROM CURRENT_DATE);
$$;