-- Enable realtime for devices table (for battery/location updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;