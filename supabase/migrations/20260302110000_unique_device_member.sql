-- C5: Prevent a device from being assigned to multiple members simultaneously.
-- A device with member_id NULL is unassigned (allowed).
-- A device with member_id set must be unique across the table.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_one_member
ON devices(member_id)
WHERE member_id IS NOT NULL;
