-- THE BROWSER LOSES ITS KEY TO `leads`.
--
-- An earlier migration built the door — `public-submit`, its rate-limit log and the spam column
-- — and the change before this one put both public forms through it. This takes away the way
-- round it.
--
-- THE ORDER IS THE POINT AND IT IS WHY THIS IS THIRD. A validated function nothing calls changes
-- nothing; revoking the policy before the forms are deployed takes the live contact form down
-- for however long the two are out of step. Function, then forms, then this.
--
-- ── 1. leads: no anon INSERT ─────────────────────────────────────────────────
--
-- "Anyone can submit leads" FOR INSERT WITH CHECK (true) has been on this table since January.
-- It is what let a script POST a lead with no name, no email and no phone straight past the
-- form's `required` attributes — and ring the new-enquiry bell for Lee and Martijn.
--
-- The replacement is not a narrower policy. It is NO policy: `public-submit` writes with the
-- service role, which does not consult RLS at all, so the table needs no INSERT policy for
-- anon or authenticated and the only way a row arrives is through the function.

DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;

-- ── 2. registration_drafts: a policy nothing has used for months ─────────────
--
-- The join wizard stopped writing drafts from the browser when `save-registration-draft` was
-- introduced; nothing in src/ writes this table any more (LeadsPage only reads it). The policy
-- stayed behind. An unused anon INSERT policy on a table holding half-finished registrations —
-- names, addresses, dates of birth — is a write path with no caller and no guard, which is the
-- worst combination: nobody is watching it because nobody uses it.

DROP POLICY IF EXISTS "Anyone can insert drafts" ON public.registration_drafts;

-- ── 3. website_events: bounded, not revoked, and here is why ─────────────────
--
-- This one is genuinely different and it would be dishonest to treat it the same.
--
-- It is page-view telemetry: no name, no email, nothing anybody acts on, no bell, and it is
-- written on EVERY page view by every visitor. Routing it through an edge function would put a
-- function invocation on every page load of a marketing site to protect rows that contain a path
-- and a browser string — a cost, a latency and a new failure mode, all real, to fix a risk that
-- is not the one that bit us.
--
-- What was actually wrong was `WITH CHECK (true)`: anon could write ANY shape into the table,
-- including a 10MB metadata blob or a million rows of free text, using it as storage. So the
-- policy is kept and BOUNDED — the event type must be one we emit, and the free-text columns
-- have ceilings. That closes the abuse without closing the analytics.
--
-- The write is still consent-gated in the browser (`hasAnalyticsConsent`), unchanged.

DROP POLICY IF EXISTS "Anyone can insert website events" ON public.website_events;

CREATE POLICY "Visitors can record a bounded website event"
  ON public.website_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- A CEILING ON EVERY TEXT COLUMN, not an allow-list of event types. `trackEvent` takes the
    -- name from its caller, so an allow-list would silently drop the next event somebody adds
    -- and the loss would show up as a gap in a chart months later. A ceiling stops the abuse —
    -- the table as free storage — without deciding in the database what may be measured.
    event_type IS NOT NULL
    AND length(event_type) <= 64
    AND coalesce(length(page_path), 0) <= 512
    AND coalesce(length(page_title), 0) <= 512
    AND coalesce(length(referrer), 0) <= 1024
    AND coalesce(length(user_agent), 0) <= 512
    AND coalesce(length(visitor_id), 0) <= 64
    AND coalesce(length(session_id), 0) <= 64
    AND coalesce(length(language), 0) <= 32
    AND coalesce(length(utm_source), 0) <= 128
    AND coalesce(length(utm_medium), 0) <= 128
    AND coalesce(length(utm_campaign), 0) <= 128
    AND coalesce(length(utm_term), 0) <= 128
    AND coalesce(length(utm_content), 0) <= 128
    -- Client-derived descriptors. PageTracker writes short fixed strings ("mobile", "Chrome",
    -- "1920x1080"); every one of them is nevertheless a free-text column a POST can choose.
    AND coalesce(length(device_type), 0) <= 32
    AND coalesce(length(browser), 0) <= 64
    AND coalesce(length(operating_system), 0) <= 64
    AND coalesce(length(screen_resolution), 0) <= 32
    -- Geo columns. Nothing in the browser writes these today — they are filled in from the IP
    -- server-side — but the policy is what a POST meets, not what our code happens to send.
    AND coalesce(length(country_code), 0) <= 8
    AND coalesce(length(country_name), 0) <= 128
    AND coalesce(length(city), 0) <= 128
    AND coalesce(length(region), 0) <= 128
    -- The one column that could hold anything at all. 4KB is far above any event we emit.
    AND coalesce(length(metadata::text), 0) <= 4096
  );

COMMENT ON POLICY "Visitors can record a bounded website event" ON public.website_events IS
  'Page-view telemetry, written by PageTracker from the browser after consent. Anon INSERT is '
  'kept deliberately — a function call on every page load would cost more than it protects — but '
  'bounded, because the previous WITH CHECK (true) let anon use the table as free storage.';

-- ── 4. leads: the columns stop accepting nothing ─────────────────────────────
--
-- Belt as well as braces. `public-submit` refuses an incomplete contact enquiry, and this makes
-- one impossible even if a future edge function, an import or a hand-written INSERT forgets.
--
-- SCOPED TO source = 'contact_form'. The other sources legitimately hold less: a
-- `product_interest` row is an email and nothing else by design, and the CRM import wrote rows
-- from a system that did not always have a phone number. A blanket constraint would either be
-- false about those or force them to carry empty strings to satisfy it.
--
-- NOT VALID, and this is the honest part. I have no access to production, so I cannot count how
-- many existing `contact_form` rows would fail. NOT VALID applies the rule to every INSERT and
-- UPDATE from now on and does NOT scan what is already there — so the migration cannot fail on
-- legacy data, and no historical enquiry is deleted or rewritten to fit a rule written after it
-- arrived. Validating it is a one-line follow-up once somebody has run the count in §5.

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_contact_form_is_actionable;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_contact_form_is_actionable
  CHECK (
    source IS DISTINCT FROM 'contact_form'
    OR (
      first_name IS NOT NULL AND length(trim(first_name)) > 0
      AND email IS NOT NULL AND length(trim(email)) > 0
      AND phone IS NOT NULL AND length(trim(phone)) > 0
    )
  )
  NOT VALID;

COMMENT ON CONSTRAINT leads_contact_form_is_actionable ON public.leads IS
  'A contact-form lead must be answerable: a name, an email and a phone number, none of them '
  'blank. NOT VALID on purpose — it governs every new row without scanning or rejecting rows '
  'that arrived before the rule existed. Run the count in the migration comment before VALIDATE.';

-- ── 5. the count somebody should run before validating ──────────────────────
--
--   SELECT count(*) FILTER (WHERE first_name IS NULL OR length(trim(first_name)) = 0) AS no_name,
--          count(*) FILTER (WHERE email      IS NULL OR length(trim(email))      = 0) AS no_email,
--          count(*) FILTER (WHERE phone      IS NULL OR length(trim(phone))      = 0) AS no_phone,
--          count(*)                                                                  AS total
--     FROM public.leads
--    WHERE source = 'contact_form';
--
-- If that returns zeroes:  ALTER TABLE public.leads VALIDATE CONSTRAINT leads_contact_form_is_actionable;
-- If it does not, the rows are still readable, still in the list, and still belong to whoever
-- sent them — decide what they are before making the database refuse their shape.

-- ── rollback ────────────────────────────────────────────────────────────────
-- ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_contact_form_is_actionable;
-- DROP POLICY IF EXISTS "Visitors can record a bounded website event" ON public.website_events;
-- CREATE POLICY "Anyone can insert website events" ON public.website_events
--   FOR INSERT TO anon, authenticated WITH CHECK (true);
-- CREATE POLICY "Anyone can insert drafts" ON public.registration_drafts
--   FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Anyone can submit leads" ON public.leads FOR INSERT WITH CHECK (true);
