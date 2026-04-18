-- H5: Webhook idempotency table to prevent duplicate processing.
-- Stores processed event IDs so retried webhooks are no-ops.
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,  -- 'stripe' or 'mollie'
  event_type TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);

-- RLS: only service_role should access this
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
