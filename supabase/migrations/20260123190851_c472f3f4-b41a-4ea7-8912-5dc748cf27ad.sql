-- Create the Member Specialist AI agent
INSERT INTO ai_agents (agent_key, name, description, enabled, mode)
VALUES (
  'member_specialist',
  'Member Support Specialist',
  'Personalized AI assistant for logged-in members. Has access to member profile, device status, subscription, and emergency contacts to provide tailored support.',
  true,
  'draft_only'
);

-- Create initial config with read permissions for member data (using JSONB)
INSERT INTO ai_agent_configs (agent_id, system_instruction, is_active, read_permissions)
SELECT 
  id,
  'You are a personalized support assistant for ICE Alarm España members. You have access to this specific member''s profile, device status, subscription details, and emergency contacts. Provide helpful, empathetic support tailored to their individual situation. Always address them by name and reference their specific data when relevant. Be warm, professional, and solution-oriented.',
  true,
  '["members", "devices", "subscriptions", "emergency_contacts"]'::jsonb
FROM ai_agents WHERE agent_key = 'member_specialist';