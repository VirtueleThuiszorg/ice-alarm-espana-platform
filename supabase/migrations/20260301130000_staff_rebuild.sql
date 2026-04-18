-- ============================================================
-- Staff Rebuild Migration
-- Expands staff table with new columns, creates staff_documents
-- and staff_activity_log tables, adds RLS policies.
-- ============================================================

-- 1. Add new columns to staff table
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

-- 2. Backfill status from existing is_active column
UPDATE staff SET status = 'active' WHERE is_active = true;
UPDATE staff SET status = 'terminated' WHERE is_active = false;

-- 3. Convert is_active to a generated column for backward compatibility
ALTER TABLE staff DROP COLUMN is_active;
ALTER TABLE staff ADD COLUMN is_active BOOLEAN GENERATED ALWAYS AS (status = 'active') STORED;

-- 4. Create updated_at trigger
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

-- ============================================================
-- 5. staff_documents table
-- ============================================================
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

-- ============================================================
-- 6. staff_activity_log table
-- ============================================================
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

-- ============================================================
-- 7. RLS Policies
-- ============================================================

-- staff_documents RLS
ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to staff_documents"
  ON staff_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('admin', 'super_admin')
      AND staff.status = 'active'
    )
  );

CREATE POLICY "Staff read own documents"
  ON staff_documents FOR SELECT
  USING (
    staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  );

-- staff_activity_log RLS
ALTER TABLE staff_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to staff_activity_log"
  ON staff_activity_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('admin', 'super_admin')
      AND staff.status = 'active'
    )
  );

CREATE POLICY "Staff read own activity"
  ON staff_activity_log FOR SELECT
  USING (
    staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 8. Storage bucket for staff documents
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-documents', 'staff-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin upload staff documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('admin', 'super_admin')
      AND staff.status = 'active'
    )
  );

CREATE POLICY "Admin delete staff documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'staff-documents'
    AND EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.role IN ('admin', 'super_admin')
      AND staff.status = 'active'
    )
  );

CREATE POLICY "Staff read own staff documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'staff-documents'
    AND (
      EXISTS (
        SELECT 1 FROM staff
        WHERE staff.user_id = auth.uid()
        AND staff.role IN ('admin', 'super_admin')
        AND staff.status = 'active'
      )
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM staff WHERE user_id = auth.uid()
      )
    )
  );
