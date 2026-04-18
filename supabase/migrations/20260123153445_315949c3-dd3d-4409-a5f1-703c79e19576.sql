-- Add avatar_url column to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN avatar_url text;

COMMENT ON COLUMN ai_agents.avatar_url IS 'URL of the agent avatar image';

-- Create storage bucket for AI agent avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-agent-avatars', 'ai-agent-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to agent avatars
CREATE POLICY "Public can view agent avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'ai-agent-avatars');

-- Allow authenticated users (admins) to upload avatars
CREATE POLICY "Authenticated users can upload agent avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ai-agent-avatars' AND auth.role() = 'authenticated');

-- Allow authenticated users (admins) to update avatars
CREATE POLICY "Authenticated users can update agent avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'ai-agent-avatars' AND auth.role() = 'authenticated');

-- Allow authenticated users (admins) to delete avatars
CREATE POLICY "Authenticated users can delete agent avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'ai-agent-avatars' AND auth.role() = 'authenticated');