-- Make member_id nullable to allow staff-only conversations
ALTER TABLE public.conversations ALTER COLUMN member_id DROP NOT NULL;

-- Add conversation_type column to distinguish between conversation types
ALTER TABLE public.conversations ADD COLUMN conversation_type TEXT DEFAULT 'member';

-- Add staff_participants column for staff-to-staff conversations
ALTER TABLE public.conversations ADD COLUMN staff_participants UUID[] DEFAULT '{}';

-- Add check constraint for conversation_type
ALTER TABLE public.conversations ADD CONSTRAINT conversation_type_check 
CHECK (conversation_type IN ('member', 'staff', 'internal'));

-- Update existing conversations to have type 'member'
UPDATE public.conversations SET conversation_type = 'member' WHERE conversation_type IS NULL;

-- Add RLS policy for staff to view staff conversations they're part of
CREATE POLICY "Staff can view staff conversations they participate in"
ON public.conversations FOR SELECT
USING (
  is_staff(auth.uid()) AND (
    conversation_type = 'member' 
    OR (SELECT id FROM staff WHERE user_id = auth.uid()) = ANY(staff_participants)
    OR assigned_to = (SELECT id FROM staff WHERE user_id = auth.uid())
  )
);