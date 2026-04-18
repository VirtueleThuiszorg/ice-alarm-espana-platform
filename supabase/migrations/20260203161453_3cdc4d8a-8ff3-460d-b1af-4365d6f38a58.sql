-- Add index for CRM leads campaign lookup (column already exists)
CREATE INDEX IF NOT EXISTS idx_outreach_crm_leads_campaign_id 
ON outreach_crm_leads(campaign_id);