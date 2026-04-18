-- Add 'viewed' status to invite_status enum
ALTER TYPE invite_status ADD VALUE 'viewed' AFTER 'sent';

-- Add viewed_at timestamp to track when link was opened
ALTER TABLE partner_invites ADD COLUMN viewed_at TIMESTAMP WITH TIME ZONE;

-- Add view_count for multiple views tracking
ALTER TABLE partner_invites ADD COLUMN view_count INTEGER DEFAULT 0;