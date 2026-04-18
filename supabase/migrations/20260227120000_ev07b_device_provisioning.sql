-- EV-07B Device Provisioning & Manual Management Columns
-- Adds fields for SMS-based device provisioning, manual management mode,
-- and makes sim_phone_number optional for bulk IMEI import workflows.

-- Make SIM phone number nullable (allows adding IMEI-only stock)
ALTER TABLE devices ALTER COLUMN sim_phone_number DROP NOT NULL;

-- Charging base pairing
ALTER TABLE devices ADD COLUMN IF NOT EXISTS charging_base_mac text;

-- SOS / emergency contact number (A1 on EV-07B)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sos_number text;

-- APN configuration
ALTER TABLE devices ADD COLUMN IF NOT EXISTS apn_name text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS apn_ip_port text;

-- Reporting mode: 'time' (periodic), 'intelligent' (motion-based), etc.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS reporting_mode text DEFAULT 'time';

-- Volume settings (0-8 for EV-07B)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS speaker_volume integer DEFAULT 5;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS mic_volume integer DEFAULT 5;

-- Manual vs API management mode
ALTER TABLE devices ADD COLUMN IF NOT EXISTS management_mode text DEFAULT 'manual';

-- 14-step provisioning checklist stored as JSONB
-- Structure: { "step_key": { "completed": bool, "completed_at": timestamp, "notes": string } }
ALTER TABLE devices ADD COLUMN IF NOT EXISTS provisioning_checklist jsonb DEFAULT '{}';

-- SMS command response log stored as JSONB array
-- Structure: [{ "command": string, "sent_at": timestamp, "response": string, "received_at": timestamp }]
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sms_command_log jsonb DEFAULT '[]';

-- Add check constraints for volume ranges
ALTER TABLE devices ADD CONSTRAINT chk_speaker_volume CHECK (speaker_volume IS NULL OR (speaker_volume >= 0 AND speaker_volume <= 8));
ALTER TABLE devices ADD CONSTRAINT chk_mic_volume CHECK (mic_volume IS NULL OR (mic_volume >= 0 AND mic_volume <= 8));

-- Index for management mode queries
CREATE INDEX IF NOT EXISTS idx_devices_management_mode ON devices (management_mode);

COMMENT ON COLUMN devices.charging_base_mac IS 'MAC address of the paired EV-07B charging base';
COMMENT ON COLUMN devices.sos_number IS 'Primary SOS number (A1 contact) configured on the device';
COMMENT ON COLUMN devices.apn_name IS 'APN name configured for GPRS data connection';
COMMENT ON COLUMN devices.apn_ip_port IS 'Server IP:port for device check-in reporting';
COMMENT ON COLUMN devices.reporting_mode IS 'Check-in reporting mode: time, intelligent, etc.';
COMMENT ON COLUMN devices.speaker_volume IS 'Speaker volume level 0-8';
COMMENT ON COLUMN devices.mic_volume IS 'Microphone volume level 0-8';
COMMENT ON COLUMN devices.management_mode IS 'Device management mode: manual (SMS-based) or api (external API)';
COMMENT ON COLUMN devices.provisioning_checklist IS 'JSON object tracking 14-step provisioning completion';
COMMENT ON COLUMN devices.sms_command_log IS 'JSON array of SMS command/response history';
