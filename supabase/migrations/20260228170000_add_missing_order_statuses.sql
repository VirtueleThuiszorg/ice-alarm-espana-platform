-- Add missing order_status enum values used by stripe-webhook
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_stock';
