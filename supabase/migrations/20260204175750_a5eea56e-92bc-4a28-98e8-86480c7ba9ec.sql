-- Add conversation_id column to voice_call_sessions to fix call stability
ALTER TABLE voice_call_sessions 
ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id);

-- Add lead_id column to conversations for linking website leads
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id);