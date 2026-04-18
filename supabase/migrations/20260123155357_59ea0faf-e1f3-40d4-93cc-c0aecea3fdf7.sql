-- Allow public read access to enabled AI agents (needed for chat widget avatar)
CREATE POLICY "Public can view enabled agents"
ON public.ai_agents
FOR SELECT
USING (enabled = true);