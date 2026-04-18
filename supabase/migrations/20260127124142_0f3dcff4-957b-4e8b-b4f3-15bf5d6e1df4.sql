-- Allow members to INSERT their own medical information
CREATE POLICY "Members can insert own medical info"
ON public.medical_information
FOR INSERT
WITH CHECK (member_id = get_member_id(auth.uid()));