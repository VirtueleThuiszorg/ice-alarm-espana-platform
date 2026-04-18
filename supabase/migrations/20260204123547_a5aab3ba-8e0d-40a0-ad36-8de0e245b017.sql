-- Update Customer Service Expert to become Customer Service & Sales Expert
UPDATE ai_agents 
SET 
  name = 'Customer Service & Sales Expert',
  description = '24/7 coverage for sales enquiries, lead qualification, pricing discussions, support questions, device troubleshooting, and general customer assistance.',
  updated_at = now()
WHERE agent_key = 'customer_service_expert';

-- Disable the Sales Expert agent (keep data for reference)
UPDATE ai_agents 
SET 
  enabled = false,
  updated_at = now()
WHERE agent_key = 'sales_expert';