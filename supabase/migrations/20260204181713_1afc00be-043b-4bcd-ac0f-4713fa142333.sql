-- Create function for incrementing partner link clicks (bypasses RLS)
CREATE OR REPLACE FUNCTION increment_partner_link_clicks(link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE partner_post_links
  SET clicks = clicks + 1
  WHERE id = link_id;
END;
$$;