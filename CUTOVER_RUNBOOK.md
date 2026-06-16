# CUTOVER_RUNBOOK.md — clean start on `cfwnrcogikjycjcobsay`

> Gated runbook for cutting Care Conneqt over from the Lovable-managed Supabase
> (`crpsuhoixfdhjugprbuc`, current live prod) to Lee's own project
> (`cfwnrcogikjycjcobsay`). **Clean start — NO data migration.**
> Created 2026-06-16. Schema already applied (123 migrations). See `CLAUDE.md` §4 for refs.
>
> **Golden rule:** before any `db push` / `functions deploy`, run
> `cat supabase/.temp/project-ref` and confirm it reads **`cfwnrcogikjycjcobsay`**.
> As of 2026-06-16 the repo **is** linked to `cfwnrcogikjycjcobsay` (verified).
>
> **Do each step in order. Do not start a step until the previous step's verify-gate passes.**
> Nothing here is done yet — this is the plan, not a record of completion.

---

## Pre-flight (already done)

- [x] Schema pushed: 123 migrations applied to `cfwnrcogikjycjcobsay` (2026-06-16).
- [x] `supabase migration list` shows local == remote for all 123.
- [x] Config/content tables seeded by the migrations themselves (isabella_settings,
      ai_agents/ai_agent_configs/ai_memory, products, email_templates, email_settings,
      outreach_settings, media_*, video_templates, documentation, testimonials, storage
      buckets). **No re-entry needed for these.**
- [x] Repo linked to `cfwnrcogikjycjcobsay`.

> **AI note:** AI runs via the Lovable gateway on `LOVABLE_API_KEY` only — keep it set
> through cutover so Isabella is not broken. Swapping the 14 `ai.gateway.lovable.dev`
> callers to Claude/Anthropic API is a **separate post-cutover code task** (shared
> `_shared/ai-gateway.ts` helper), NOT part of this runbook.

---

## Step A — Set env secrets on the new project

Set as Supabase **function secrets** (`supabase secrets set ...` or dashboard → Edge
Functions → Secrets). `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`
are injected automatically — do **not** set them.

| Integration | Env vars |
|---|---|
| AI (keep through cutover) | `LOVABLE_API_KEY` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_SOS_NUMBER`, `TWILIO_OUTBOUND_NUMBER`, `TWILIO_TWIML_APP_SID` |
| Email — Resend | `RESEND_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME` |
| Email — Gmail | `GMAIL_APP_PASSWORD` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| EV07B pendant | `EV07B_CHECKIN_KEY` |
| Webhooks | `WEBHOOK_SECRET` |
| URLs | `SITE_URL`, `RENDER_WORKER_URL` |

**Verify-gate A:** `supabase secrets list` shows every var above present (names only;
values are hidden). No deploy yet.

---

## Step B — Enter `system_settings` DB rows

These are read from the DB, not env. Enter via the admin Settings UI (after Step C/D) or
seed directly. **Secret values are NOT in the repo — they must be supplied.**

| Group | Keys |
|---|---|
| Stripe | `settings_stripe_secret_key`, `settings_stripe_webhook_secret` |
| Mollie | `settings_mollie_api_key`, `settings_active_payment_gateway` |
| Twilio (DB duplicates) | `settings_twilio_account_sid`, `settings_twilio_auth_token`, `settings_twilio_api_key_sid`, `settings_twilio_api_key_secret`, `settings_twilio_phone_number`, `settings_twilio_whatsapp_number` |
| Facebook | `settings_facebook_page_access_token`, `settings_facebook_page_id` |
| WhatsApp routing | `admin_whatsapp_number` |
| Company info | `settings_company_name`, `settings_support_email`, `settings_website`, `settings_address`, `settings_call_centre_phone`, `settings_emergency_phone` |

> Twilio creds are needed in **both** env (Step A) and `system_settings` — different
> functions read from different places.

**Verify-gate B:** `select key from public.system_settings order by key;` lists all the
keys above; payment + Twilio + webhook secrets are non-empty.

---

## Step C — Create the first admin/staff account

The invite functions (`staff-send-invite`, `staff-register`) require an *existing* admin,
so the first `super_admin` is a chicken-and-egg. Use the **guarded bootstrap** added on
`feat/admin-bootstrap`: the SQL function `public.bootstrap_first_admin(...)` (migration
`20260616120000_bootstrap_first_admin.sql`) plus the one-time `bootstrap-admin` edge
function. It **self-disables** — it refuses once any `super_admin` exists, so it cannot be
used to escalate privileges later. `is_admin()` / `get_staff_role()` resolve role from a
`public.staff` row where `user_id = auth.uid()` AND `is_active = true`.

> Requires the bootstrap migration + function to be deployed first (the migration is part
> of the schema; deploy `bootstrap-admin` with Step D, or ahead of it).

1. **Create the auth user** — Supabase dashboard → Authentication → Add user (email +
   password). Copy the resulting `user_id` (UUID).
2. **Run the bootstrap** (pick ONE):

   - **Edge function (supported path):** call `bootstrap-admin` with the service-role key:
     ```bash
     curl -X POST "$SUPABASE_URL/functions/v1/bootstrap-admin" \
       -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
       -H "Content-Type: application/json" \
       -d '{"user_id":"<AUTH_USER_UUID>","email":"lee@<domain>","first_name":"Lee","last_name":"Wakeman"}'
     ```
   - **SQL directly** (dashboard SQL editor / service role):
     ```sql
     select public.bootstrap_first_admin(
       '<AUTH_USER_UUID>', 'lee@<domain>', 'Lee', 'Wakeman');
     ```

   Either creates or promotes the staff row to `super_admin` and **raises/409s if a
   super_admin already exists**. (`role` enum = `super_admin` | `admin` | `call_centre`.)

**Verify-gate C:** the call returns the new `staff_id`; `select is_admin('<AUTH_USER_UUID>');`
returns `true`; a second bootstrap call is **refused** (proves the self-disable); logging
into the admin portal reaches admin pages.

---

## Step D — Deploy edge functions to `cfwnrcogikjycjcobsay`

> **This is where the Isabella settings gate goes live.** Confirm link target first:
> `cat supabase/.temp/project-ref` → must be `cfwnrcogikjycjcobsay`.

- Deploy all functions: `supabase functions deploy` (or per-function as needed).
- At minimum the gate-bearing three must deploy: `ai-run`, `ai-execute-action`,
  `ai-dispatch-events` — plus the EV07B emergency pipeline (`ev07b-sos-alert`,
  `ev07b-checkin`, `emergency-contact-notify`, `sos-escalation-runner`) and the rest.

**Verify-gate D:** `supabase functions list` shows the functions deployed; a test invoke of
`ai-run` (chat_widget) returns 200; logs show no missing-env errors.

---

## Step E — Repoint Vercel and redeploy

Update the Vercel project env to the **new** project, then redeploy.

- `VITE_SUPABASE_URL` → `https://cfwnrcogikjycjcobsay.supabase.co`
- `VITE_SUPABASE_PROJECT_ID` (a.k.a. PROJECT_ID) → `cfwnrcogikjycjcobsay`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/publishable key) → new project's anon key
- (Confirm the exact var names against `src/integrations/supabase/client.ts` before editing.)
- Redeploy `main` on Vercel (production builds from GitHub).

**Verify-gate E:** the live site's network calls hit `cfwnrcogikjycjcobsay.supabase.co`;
auth/login works against the new project.

---

## Step F — End-to-end smoke test

Run against the live (new) environment:

1. **Member signup** — complete a registration; confirm a `members` row + welcome email.
2. **Device register** — provision/assign an EV07B; confirm a `devices` row, status active.
3. **Test SOS end-to-end** — fire an SOS (test IMEI or `ev07b-sos-alert` test call);
   confirm: `alerts` row created → `emergency-contact-notify` fires (SMS/email) →
   `sos-escalation-runner` escalates. **This path must NOT depend on Isabella toggles.**
4. **Chat widget** — send a message; confirm `ai-run` (chat_widget) returns a reply.
   Then toggle `chat_widget` off in admin → confirm the reply is suppressed but
   escalate-to-human still works (the Isabella gate, now live).

**Verify-gate F:** all four pass. Only then is the cutover complete and
`cfwnrcogikjycjcobsay` becomes live production — at which point update `CLAUDE.md` §4
(swap which ref is "current live") and retire `crpsuhoixfdhjugprbuc` per a separate
decision.

---

## Post-cutover (separate tasks, not part of this runbook)
- Swap the 14 `ai.gateway.lovable.dev` callers to Claude/Anthropic API via
  `_shared/ai-gateway.ts`; retire `LOVABLE_API_KEY`.
- Update `CLAUDE.md` §4 to mark `cfwnrcogikjycjcobsay` as current live prod.
- Decide the fate of `crpsuhoixfdhjugprbuc` (the old Lovable prod).
