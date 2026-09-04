-- ICE import: hardware detail the export carries.
--
-- Pendant IMEI 130 rows, of which only 65 are a clean 15-digit IMEI. The rest
-- are compound strings like
--   "IMEI: 865513074081908 DOCKING STATION: D3:2E:41:C6:79:71"
-- so the docking station MAC needs its own column rather than being jammed into
-- devices.imei. Also Watch or Pendant 111 · Alarm Type 15 · Unit Type 4 ·
-- Alarm Manufacturer 1.
--
-- Reverse: ALTER TABLE public.devices DROP COLUMN IF EXISTS <each>;

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS docking_station_mac text,
  ADD COLUMN IF NOT EXISTS manufacturer        text,
  ADD COLUMN IF NOT EXISTS unit_type           text;

COMMENT ON COLUMN public.devices.docking_station_mac IS 'Extracted from the compound KarmaCRM "Pendant IMEI" field at import.';
