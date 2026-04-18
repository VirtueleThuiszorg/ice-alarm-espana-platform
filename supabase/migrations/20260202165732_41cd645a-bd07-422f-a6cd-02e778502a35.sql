-- ============================================
-- EV-07B Device Lifecycle Migration
-- Step 1: Add new enum values FIRST
-- ============================================

-- Add new status values to the enum type first
ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'reserved';
ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'allocated';
ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'with_staff';
ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'live';