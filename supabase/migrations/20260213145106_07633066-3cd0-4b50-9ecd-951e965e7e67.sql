-- Fix conversation_messages: Remove public access policies
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.conversation_messages;
DROP POLICY IF EXISTS "Anyone can read messages" ON public.conversation_messages;

-- Staff can read all conversation messages
CREATE POLICY "Staff can read all conversation messages"
ON public.conversation_messages FOR SELECT
USING (public.is_staff(auth.uid()));

-- Staff can insert conversation messages
CREATE POLICY "Staff can insert conversation messages"
ON public.conversation_messages FOR INSERT
WITH CHECK (public.is_staff(auth.uid()));

-- Members can read messages in their own conversations
CREATE POLICY "Members can read own conversation messages"
ON public.conversation_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_messages.conversation_id
      AND c.member_id = public.get_member_id(auth.uid())
  )
);

-- Members can insert messages in their own conversations
CREATE POLICY "Members can insert own conversation messages"
ON public.conversation_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND c.member_id = public.get_member_id(auth.uid())
  )
);

-- Fix conversation_calls: Remove public access policy
DROP POLICY IF EXISTS "Anyone can manage calls" ON public.conversation_calls;

-- Staff can manage all call records
CREATE POLICY "Staff can manage conversation calls"
ON public.conversation_calls FOR ALL
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- Members can view call records for their own conversations
CREATE POLICY "Members can view own conversation calls"
ON public.conversation_calls FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_calls.conversation_id
      AND c.member_id = public.get_member_id(auth.uid())
  )
);