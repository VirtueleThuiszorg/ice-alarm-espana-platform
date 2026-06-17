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
| EV07B pendant | `EV07B_CHECKIN_KEY`, `EV07B_HMAC_SECRET` |
| Webhooks | `WEBHOOK_SECRET` |
| URLs | `SITE_URL`, `RENDER_WORKER_URL` |

> **`EV07B_HMAC_SECRET` (added by `feat/sos-hardening`):** set the **SAME value** on BOTH the
> gps-gateway service AND this Supabase project — the HMAC signature won't verify if they
> differ. **Leave `EV07B_ENFORCE_HMAC` unset / `false`** during cutover: the ingress accepts
> either HMAC or the legacy `x-api-key` during the transition, so a real pendant is never
> locked out. Only set `EV07B_ENFORCE_HMAC=true` AFTER a real pendant request is confirmed
> verifying via HMAC post-deploy.

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

## Step C2 — Staff setup & provisioning

Provision the launch team **in this order**. `app_role` enum =
`super_admin | admin | call_centre_supervisor | call_centre` (+ `partner`, `member`).

**Invite flow (all staff after Lee):** an admin/supervisor triggers `staff-send-invite`
(creates the invite token + emails a link) → invitee opens the link, which calls
`staff-validate-invite` (checks the token) → invitee sets their password via
`staff-complete-invite` (creates the auth user + the `public.staff` row with the assigned
role). No manual SQL needed after the first admin.

1. **Lee → `super_admin`** — via the one-shot bootstrap from Step C
   (`bootstrap_first_admin`, self-disabling). This is the only account NOT created by an
   invite. After this, Lee can issue invites.

2. **Lee invites Mary → `call_centre_supervisor`** — `staff-send-invite` (role
   `call_centre_supervisor`) → Mary completes via validate/complete-invite. Supervisor
   capabilities: sits in the **L3 escalation tier** (set `staff.escalation_priority` and
   `is_on_call=true` so SOS L3 reaches her — see `sos-escalation-runner`), and can manage
   **rota / shifts / holidays / shift-covers**.

3. **Lee or Mary invite Carmen, Albert, Travis → `call_centre`** — `staff-send-invite`
   (role `call_centre`) ×3 → each completes via validate/complete-invite. Operator
   capabilities: **view + edit member records incl. medical info and emergency contacts**,
   handle the alerts/SOS queue, messages, tasks, tickets, leads — but **NO billing/finance
   and NO system-settings access**.

**Test phase (after bootstrap, on the DEPLOYED project — TESTING ONLY):** create these
accounts so Lee can log in as each role and verify the access boundaries below:

| Email | Role | Temp password |
|---|---|---|
| `lee@careconneqt.com` | `super_admin` (via the bootstrap fn) | `Test@1234` |
| `mary@careconneqt.com` | `call_centre_supervisor` | `Test@1234` |
| `carmen@careconneqt.com` | `call_centre` | `Test@1234` |
| `albert@careconneqt.com` | `call_centre` | `Test@1234` |
| `travis@careconneqt.com` | `call_centre` | `Test@1234` |

> 🔴 `Test@1234` is a SHARED TEST password — **pre-launch verification only**. It must NOT
> survive to go-live (see the **Step F blocking gate**). Real staff accounts are created via
> the invite flow above, where each person sets their own strong password.

**Verify-gate C2 — role-surface check (do for each persona after they log in):**
- **Operators (Carmen/Albert/Travis, `call_centre`):**
  - ✅ CAN open a member's **Medical** and **Emergency Contacts** tabs and edit them.
  - ✅ CAN open the alerts queue / SOS takeover and **resolve an alert**.
  - ❌ CANNOT see **/admin/finance, /admin/payments, /admin/subscriptions, /admin/commissions**
    (billing/finance) or **/admin/settings** (system settings) — these should 404/redirect
    to unauthorized, not render.
- **Supervisor (Mary, `call_centre_supervisor`):**
  - ✅ all operator surfaces, PLUS can manage **rota/shifts** and **approve/deny holidays**
    and **shift-covers**.
  - ✅ appears in the SOS **L3** escalation path (priority + on-call set).
- **Lee (`super_admin`):** full admin incl. finance + settings.

If an operator can reach finance/settings, RBAC is misconfigured — **STOP and fix the
`ProtectedRoute requireAdmin` / role checks before go-live** (operators must not see
billing or settings).

---

## Step C3 — Staffing & rota / on-call coverage

Configure shifts in the admin **Rota** (`staff_shifts`) and set the on-call/escalation
fields on each `staff` row (`is_on_call`, `escalation_priority`).

> **Escalation ordering (verified):** `sos-escalation-runner` selects on-call fallback staff
> with `is_on_call=true` ordered by `escalation_priority` **ASCENDING** (lower number =
> reached first). So the catch-all backstop must have the **highest** `escalation_priority`.

### Roles & shift patterns

| Person | Role | Shift pattern | On-call / escalation |
|---|---|---|---|
| **Lee** | `super_admin` **+ on-call fallback operator** | Covers ANY uncovered shift (incl. nights when Travis is off) | `is_on_call=true`, **highest** `escalation_priority` (final catch-all). Must be able to **receive & take an SOS** when no scheduled operator is present. |
| **Mary** | `call_centre_supervisor` | **Mornings 07:00–15:00**, 4-on / 2-off | Escalation **L3** (supervisor tier); manages shifts / holidays / covers |
| **Carmen** | `call_centre` | Rotating: **2× mornings (07:00–15:00) + 2× afternoons (15:00–23:00) + 2 off** | operator |
| **Albert** | `call_centre` | **Afternoons 15:00–23:00**, 4-on / 2-off | operator |
| **Travis** | `call_centre` | **Nights 23:00–07:00** (primary, sole night operator) | operator |

### ⚠️ Coverage risks (flag prominently)

- 🔴 **Night shift (23:00–07:00) has ONE primary operator (Travis); Lee is the only
  backup.** This is a **single point of failure on the most safety-critical hours.**
  **Recommend cross-training a second night-capable operator post-launch.**
- 🟠 **Lee is the sole fallback for ALL uncovered shifts.** Sustainable for launch; revisit
  as alert volume grows (Lee cannot be the permanent catch-all at scale).
- 🟢 **Active safety nets for a no-show:** `staff-shift-monitor` (2-min heartbeat →
  WhatsApp alert) and the SOS escalation chain. **Confirm Lee's mobile number receives the
  shift-monitor + escalation WhatsApp alerts** (in `system_settings` / staff `personal_mobile`).

**Verify-gate C3 (BLOCKING for night cover):** simulate an **uncovered / unanswered SOS at
night** — fire a test SOS with no scheduled operator accepting it, and confirm:
1. `staff-shift-monitor` flags the no-show and WhatsApps Lee.
2. The escalation chain walks to the on-call fallback and **reaches Lee** (highest
   `escalation_priority`, `is_on_call=true`).
3. **Lee can actually take/accept the call** (browser softphone or dialed leg).
If escalation does not reach Lee, the night safety net is broken — **STOP, do not go live
on nights** until fixed.

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

> ## 🔴 CRITICAL — Vercel AUTO-DEPLOYS production from the `main` branch.
> Merging the feature branches to `main` **immediately triggers a production deploy**. So the
> cutover order is **strict and non-negotiable**:
>
> 1. **Set all secrets** on `cfwnrcogikjycjcobsay` — env (Step A) **and** `system_settings` (Step B).
> 2. **Deploy edge functions** to `cfwnrcogikjycjcobsay` (Step D).
> 3. **Switch Vercel env vars** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`,
>    `VITE_SUPABASE_PUBLISHABLE_KEY`) from the OLD project to `cfwnrcogikjycjcobsay`.
> 4. **ONLY THEN merge the 9 feature branches to `main`** — this triggers Vercel's automatic
>    production deploy, now correctly pointed at the fully-wired new backend.
> 5. **Smoke-test** (Step F).
>
> ⛔ **Do NOT merge to `main` before steps 1–3.** If you do, Vercel auto-deploys the new
> frontend against the OLD / unwired backend (wrong DB, missing secrets/functions) — a
> live-site outage on a life-safety service.

Update the Vercel project env to the **new** project (step 3 above), then let the merge
(step 4) trigger the deploy:

- `VITE_SUPABASE_URL` → `https://cfwnrcogikjycjcobsay.supabase.co`
- `VITE_SUPABASE_PROJECT_ID` (a.k.a. PROJECT_ID) → `cfwnrcogikjycjcobsay`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/publishable key) → new project's anon key
- (Confirm the exact var names against `src/integrations/supabase/client.ts` before editing.)
- The production deploy fires automatically on the `main` merge (step 4) — no manual redeploy
  needed, but you can trigger a redeploy in Vercel if env vars changed without a new commit.

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
5. **🔴 BLOCKING — medical-data correctness (verifies `feat/join-medical-fix` end to end;
   unit tests cannot prove the DB write).** Complete a FULL `/join` signup with medical
   info filled in — conditions, medications, allergies, blood type — for BOTH:
   - a **single** registration, and
   - a **couple** registration (fill the partner's medical info too).

   Then query the new DB (`cfwnrcogikjycjcobsay`) and confirm for each new member:
   ```sql
   -- primary member has a medical row with the entered values
   select m.id, m.first_name, mi.blood_type, mi.allergies, mi.medications, mi.medical_conditions
   from members m join medical_information mi on mi.member_id = m.id
   where m.id = '<new_member_id>';
   -- couple: the partner member ALSO has a medical_information row
   -- emergency contacts were written
   select count(*) from emergency_contacts where member_id = '<new_member_id>';
   ```
   **Pass criteria (ALL must hold):**
   - `medical_information` row exists for the new member with the entered blood type /
     allergies / medications / conditions (not null/empty).
   - For the couple case, a `medical_information` row also exists for the partner member.
   - `emergency_contacts` rows exist for the member.

   If any of these is missing, the medical-data fix is NOT working — **STOP, do not go
   live.** This is the regression that shipped before (`FRONTEND_GAPS.md`): medical info
   entered at signup was silently dropped from the member record.
6. **Public nav/footer link check (after `feat/frontend-polish` is merged + deployed).**
   Click EVERY public **header** and **footer** link from at least TWO different pages
   (the **home page** and a **sub-page** e.g. `/products` or `/contact`) and confirm each
   lands/scrolls correctly:
   - Header: How It Works, Products, Pricing, Partners, Contact, Member Login, Start Your
     Protection, logo.
   - Footer: How It Works, Pricing, Partners, Terms, Privacy, Help, Call Now.
   - **Especially: header "Pricing" must scroll to the `#pricing` section when clicked from
     a NON-home page** (this is the cross-page hash-scroll fixed in `feat/frontend-polish`;
     audit 2026-06-16 confirmed all other targets correct). Record the result.
7. **🔴 BLOCKING — no test/shared password on the live system.** Before ANY real member is
   onboarded, every test account from Step C2 must be remediated: delete the test accounts
   OR have each real staff member re-created via the invite flow (`staff-send-invite` →
   `staff-complete-invite`) so they set their own strong password. **No account may still
   use `Test@1234` (or any shared password) at go-live.** Verify, e.g.:
   - Confirm no staff member can authenticate with `Test@1234` (try each test email).
   - Confirm the real staff accounts were created via invites (each has a unique,
     self-set password).
   If any account still uses the test password, **STOP — do not onboard real members.**
8. **🔴 BLOCKING — Twilio must be on a PAID plan before any real client.** A Twilio TRIAL
   account can only send to **pre-verified** numbers — which means the SOS/emergency path
   **cannot call or SMS a real member's emergency contacts**, and outbound voice/SMS to real
   members will fail. Trial is acceptable for **cutover testing only**. Before onboarding any
   real client: upgrade the Twilio account to paid, remove the trial restriction, and confirm
   an SMS/call reaches a NON-verified number. **Do not go live on a trial Twilio account.**
9. **🔴 BLOCKING — rotate any credential exposed during setup.** Any secret that was shared
   in chat, screenshots, or otherwise exposed during cutover (notably the **Twilio Auth
   Token**, but also Stripe/Mollie/Resend/Gmail/Supabase service-role/`EV07B_HMAC_SECRET`
   /`EV07B_CHECKIN_KEY`/`WEBHOOK_SECRET` if exposed) MUST be rotated before go-live. Going
   forward, set all secrets **directly in the Supabase / provider dashboards** — never in
   chat or screenshots. Verify the old (exposed) values no longer work.

**Verify-gate F:** **all nine** pass — and gates F5 (medical-data), F7 (no test passwords),
F8 (Twilio paid) and F9 (rotated exposed credentials) are HARD BLOCKERS: the
platform is NOT considered live until F5 passes for both single and couple. Only then is
the cutover complete and `cfwnrcogikjycjcobsay` becomes live production — at which point
update `CLAUDE.md` §4 (swap which ref is "current live") and retire `crpsuhoixfdhjugprbuc`
per a separate decision. **Record the F5 result (pass/fail, member IDs checked) in
`LEARN.md` §4.**

---

## Post-cutover (separate tasks, not part of this runbook)
- Swap the 14 `ai.gateway.lovable.dev` callers to Claude/Anthropic API via
  `_shared/ai-gateway.ts`; retire `LOVABLE_API_KEY`.
- Update `CLAUDE.md` §4 to mark `cfwnrcogikjycjcobsay` as current live prod.
- Decide the fate of `crpsuhoixfdhjugprbuc` (the old Lovable prod).
