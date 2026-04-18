
-- 1. Drop dependent policies
DROP POLICY IF EXISTS "Staff can manage blog posts" ON blog_posts;
DROP POLICY IF EXISTS "Staff manage partner members" ON partner_members;
DROP POLICY IF EXISTS "Staff manage pricing tiers" ON partner_pricing_tiers;
DROP POLICY IF EXISTS "Staff manage alert subscriptions" ON partner_alert_subscriptions;
DROP POLICY IF EXISTS "Staff view all alert notifications" ON partner_alert_notifications;
DROP POLICY IF EXISTS "Staff insert alert notifications" ON partner_alert_notifications;

-- 2. Expand staff table with HR fields
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_leave', 'suspended', 'terminated')),
  ADD COLUMN IF NOT EXISTS nie_number TEXT,
  ADD COLUMN IF NOT EXISTS social_security_number TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Spain',
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT,
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'operations',
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Migrate is_active data to status
UPDATE staff SET status = 'active' WHERE is_active = true;
UPDATE staff SET status = 'terminated' WHERE is_active = false;

-- 4. Replace is_active with generated column
ALTER TABLE staff DROP COLUMN is_active;
ALTER TABLE staff ADD COLUMN is_active BOOLEAN GENERATED ALWAYS AS (status = 'active') STORED;

-- 5. Recreate dropped policies using status instead of is_active
CREATE POLICY "Staff can manage blog posts" ON blog_posts FOR ALL
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff manage partner members" ON partner_members FOR ALL
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff manage pricing tiers" ON partner_pricing_tiers FOR ALL
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff manage alert subscriptions" ON partner_alert_subscriptions FOR ALL
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff view all alert notifications" ON partner_alert_notifications FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insert alert notifications" ON partner_alert_notifications FOR INSERT
  WITH CHECK (public.is_staff(auth.uid()));

-- 6. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_staff_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staff_updated_at ON staff;
CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW
  EXECUTE FUNCTION update_staff_updated_at();

-- 7. Create staff_documents table
CREATE TABLE IF NOT EXISTS staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('nie_copy', 'contract', 'cv', 'certification', 'other')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_documents_staff_id ON staff_documents(staff_id);

-- 8. Create staff_activity_log table
CREATE TABLE IF NOT EXISTS staff_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('status_change', 'role_change', 'profile_update', 'document_upload', 'document_delete', 'login', 'note_added')),
  details JSONB DEFAULT '{}',
  performed_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_activity_log_staff_id ON staff_activity_log(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_activity_log_created_at ON staff_activity_log(created_at DESC);

-- 9. RLS for staff_documents
ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to staff_documents"
  ON staff_documents FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Staff read own documents"
  ON staff_documents FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- 10. RLS for staff_activity_log
ALTER TABLE staff_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to staff_activity_log"
  ON staff_activity_log FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Staff read own activity"
  ON staff_activity_log FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- 11. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-documents', 'staff-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin upload staff documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Admin delete staff documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'staff-documents'
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Staff read own staff documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'staff-documents'
    AND (
      public.is_admin(auth.uid())
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM staff WHERE user_id = auth.uid()
      )
    )
  );
