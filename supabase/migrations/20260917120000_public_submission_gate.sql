-- THE PUBLIC FORMS GET A DOOR, AND THE DOOR GETS A LOG.
--
-- ── WHAT HAPPENED ────────────────────────────────────────────────────────────
--
-- A lead arrived with no name, no email and no phone. Nobody could act on it, and it rang the
-- new-enquiry bell for Lee and Martijn like a real one. The cause was not a missing check: it
-- was that the only checks were `required` attributes on an HTML form, which exist in the
-- browser of somebody who visits the page and nowhere at all for a script that POSTs to the REST
-- endpoint. `leads` carried "Anyone can submit leads" FOR INSERT WITH CHECK (true) since January
-- and the columns are nullable, so anon could write whatever it liked straight into the table.
--
-- This migration adds what the server side needs to exist BEFORE anything is locked down. The
-- lockdown itself — revoking the anon policy and adding the CHECK constraints — is a separate
-- migration that lands with the forms that stop needing the policy, because doing it here would
-- take the live contact form down until the next deploy.
--
-- ── 1. public_submission_log ────────────────────────────────────────────────
--
-- A rate limit needs a memory, and it must be a memory the submitter cannot clear. Not the
-- browser, not a cookie, not a header — a row per attempt, written by the edge function with
-- the service role.
--
-- IT LOGS REFUSALS TOO, and that is the point rather than an extra. A limiter that only counts
-- accepted submissions is no limiter at all: a script sending a thousand malformed requests an
-- hour gets refused a thousand times and is never once slowed down.
--
-- THE EMAIL IS HASHED, NOT STORED. The limit is per email as well as per IP, so the function has
-- to recognise the same address twice — which needs a stable key, not the address itself. A
-- table of every email that ever tried a contact form would be a marketing list we never asked
-- for and would have to disclose. sha-256 of the lowercased address answers "same person again?"
-- and answers nothing else.
--
-- IP IS TRUNCATED. The last octet of IPv4 (and the interface half of IPv6) identifies a machine;
-- the rest identifies a household or an office, which is the granularity a rate limit wants
-- anyway. Storing less is not a compromise here — a /24 is the better limiter, because a bot
-- farm rotating the last octet defeats a full-address limit and does not defeat this one.
--
-- RETENTION IS 30 DAYS, deleted by the same function on its way past. Nothing here is of use
-- after the hour it was written for, and a log of who contacted us that grows for ever is a
-- liability rather than an asset.

CREATE TABLE IF NOT EXISTS public.public_submission_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form         text        NOT NULL,
  -- Truncated: IPv4 /24, IPv6 /64. Never the full address.
  ip_prefix    text,
  -- sha-256 of the lowercased, trimmed email. Never the address.
  email_hash   text,
  outcome      text        NOT NULL CHECK (outcome IN ('accepted', 'refused', 'rate_limited')),
  -- Why it was refused, or why it was flagged. Free text for an operator, never parsed.
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- The two lookups the limiter makes, both windowed on the last hour.
CREATE INDEX IF NOT EXISTS idx_public_submission_log_ip
  ON public.public_submission_log (ip_prefix, created_at DESC)
  WHERE ip_prefix IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_submission_log_email
  ON public.public_submission_log (email_hash, created_at DESC)
  WHERE email_hash IS NOT NULL;

ALTER TABLE public.public_submission_log ENABLE ROW LEVEL SECURITY;

-- NO anon policy, and no authenticated one either. The only writer is the edge function with the
-- service role, which bypasses RLS; staff read it because a burst of refusals is something
-- somebody should be able to look at.
CREATE POLICY "Staff can read the public submission log"
  ON public.public_submission_log FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Service role manages the public submission log"
  ON public.public_submission_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.public_submission_log IS
  'One row per attempt at a public form, accepted or not, written by the public-submit function '
  'with the service role. Feeds the per-IP and per-email hourly rate limit. Emails are stored as '
  'a sha-256 hash and IPs truncated to a /24 (v4) or /64 (v6): enough to recognise a repeat, not '
  'enough to be a contact list. Rows older than 30 days are deleted by the function.';

-- ── 2. leads.suspected_spam ─────────────────────────────────────────────────
--
-- NOT A DELETE, AND NOT A SEPARATE TABLE. A lead the heuristics dislike is still a lead: the
-- vendor pitch that prompted all this looked like spam and was, but the next one to trip "the
-- message is in Spanish and English was selected" will be a real Spanish daughter who picked the
-- wrong flag. So the row stays exactly where it was, in the list staff already read, with a
-- filter and a one-click way to say the guess was wrong.
--
-- WHAT IT CHANGES IS THE BELL. A suspected-spam lead does not wake Lee and Martijn. That is the
-- whole benefit: the enquiry is still there to be looked at, and nobody is interrupted for it.
--
-- DEFAULT FALSE, NOT NULL: a three-valued "maybe" would have to be handled by every query that
-- filters on it, and the honest default for every existing row is "nobody has said this is spam".

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS suspected_spam boolean NOT NULL DEFAULT false;

-- Why the guess was made, for the staff member deciding whether it was right. Null when not
-- suspected. Never shown as a reason to dismiss a lead — only as a reason it did not ring.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS spam_reasons text[];

-- The Leads list filters on it, and the bell trigger reads it on every insert.
CREATE INDEX IF NOT EXISTS idx_leads_suspected_spam
  ON public.leads (suspected_spam, created_at DESC);

COMMENT ON COLUMN public.leads.suspected_spam IS
  'Set by the public-submit function from the heuristics in _shared/public-submit.ts. Suppresses '
  'the new-enquiry bell and nothing else: the lead is still in the list, and staff can clear the '
  'flag with one click. Never a reason to hide or delete an enquiry.';

-- ── rollback ────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.idx_leads_suspected_spam;
-- ALTER TABLE public.leads DROP COLUMN IF EXISTS spam_reasons;
-- ALTER TABLE public.leads DROP COLUMN IF EXISTS suspected_spam;
-- DROP TABLE IF EXISTS public.public_submission_log;
