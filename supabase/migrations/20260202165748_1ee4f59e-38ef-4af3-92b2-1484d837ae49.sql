-- ============================================
-- EV-07B Device Lifecycle Migration
-- Step 2: Add new columns and update existing data
-- ============================================

-- Add new columns to devices table for EV-07B lifecycle
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS model text DEFAULT 'EV-07B';
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS serial_number text;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS sim_iccid text;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS reserved_at timestamptz;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS reserved_order_id uuid REFERENCES public.orders(id);
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS collected_at timestamptz;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS collected_by_staff_id uuid REFERENCES public.staff(id);
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS live_at timestamptz;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS offline_since timestamptz;

-- Update all existing devices to have model = 'EV-07B'
UPDATE public.devices SET model = 'EV-07B' WHERE model IS NULL;

-- Map existing status values to new lifecycle statuses
-- active -> allocated (if no member) or live (if member assigned)
UPDATE public.devices 
SET status = 'allocated' 
WHERE status = 'active' AND member_id IS NULL;

UPDATE public.devices 
SET status = 'live', live_at = COALESCE(assigned_at, now())
WHERE status = 'active' AND member_id IS NOT NULL;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_devices_model ON public.devices(model);
CREATE INDEX IF NOT EXISTS idx_devices_status_model ON public.devices(status, model);
CREATE INDEX IF NOT EXISTS idx_devices_is_online ON public.devices(is_online) WHERE is_online = false;