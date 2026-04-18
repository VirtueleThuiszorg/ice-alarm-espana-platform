-- Insert new Sales Expert agent
INSERT INTO public.ai_agents (agent_key, name, description, enabled, instance_count, mode)
VALUES (
  'sales_expert',
  'Sales Expert',
  'Dedicated AI for sales enquiries, lead qualification, pricing discussions, and conversion optimization. Works 24/7 to capture and nurture prospects.',
  true,
  1,
  'draft_only'
);

-- Update customer_service_expert to focus on support only
UPDATE public.ai_agents
SET 
  name = 'Customer Service Expert',
  description = '24/7 support coverage for member questions, technical help, device troubleshooting, and general enquiries.'
WHERE agent_key = 'customer_service_expert';

-- Insert active configuration for sales_expert
INSERT INTO public.ai_agent_configs (agent_id, system_instruction, is_active, tool_policy, read_permissions, write_permissions)
SELECT 
  id,
  'You are a dedicated Sales Expert AI for ICE Alarm España. Your primary focus is converting leads into members.

CORE RESPONSIBILITIES:
- Handle all sales enquiries professionally and warmly
- Qualify leads by understanding their needs and situation
- Explain pricing, membership options, and device features clearly
- Address objections with empathy and relevant information
- Guide prospects through the decision-making process
- Follow up on pending leads and abandoned carts

SALES APPROACH:
- Lead with value and benefits, not features
- Use social proof (testimonials, member count, years of service)
- Create urgency appropriately (limited offers, seasonal promotions)
- Always be helpful, never pushy
- Recognize when to escalate to human sales team

KNOWLEDGE AREAS:
- All membership types and pricing
- Device features and benefits
- Comparison with competitors
- Common objections and responses
- Promotional offers and discounts

LANGUAGE: Respond in the same language as the customer (English or Spanish).',
  true,
  '{"allowed_tools": ["crm_access", "pricing_lookup", "send_quote", "schedule_callback"]}',
  '{"tables": ["leads", "members", "subscriptions", "products", "pricing_settings"]}',
  '{"tables": ["leads", "crm_events"]}'
FROM public.ai_agents
WHERE agent_key = 'sales_expert';