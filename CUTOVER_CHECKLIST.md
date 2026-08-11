# CUTOVER_CHECKLIST.md — one-page tick-list

> ⛔ **CANCELLED 2026-07-22 (LAUNCH_SCOPE.md §0).** The cutover to `cfwnrcogikjycjcobsay`
> is not happening; the one true backend remains **`crpsuhoixfdhjugprbuc`**. Historical
> reference only — do not execute.
>
> **Re-confirmed 2026-08-11** against the Supabase dashboard. Every `cfwnrcogikjycjcobsay`
> mention below is HISTORICAL. See `PROJECT_REFS.md`.
>
> Condensed from `CUTOVER_RUNBOOK.md` (the runbook is the source of truth; this is the
> quick-reference). Target: `cfwnrcogikjycjcobsay`. Schema already pushed (123 migrations).

## A. Gather before starting
- [ ] **Provider secrets** ready (entered in dashboard at step B1): `LOVABLE_API_KEY`;
      Twilio ×9 (`TWILIO_ACCOUNT_SID/AUTH_TOKEN/API_KEY_SID/API_KEY_SECRET/PHONE_NUMBER/
      WHATSAPP_NUMBER/SOS_NUMBER/OUTBOUND_NUMBER/TWIML_APP_SID`); `RESEND_API_KEY`,
      `SENDER_EMAIL`, `SENDER_NAME`; `GMAIL_APP_PASSWORD`; `GOOGLE_CLIENT_ID`,
      `GOOGLE_CLIENT_SECRET`; `RENDER_WORKER_URL`.
- [x] Self-generated secrets set: `WEBHOOK_SECRET`, `EV07B_CHECKIN_KEY`, `EV07B_HMAC_SECRET`, `SITE_URL`.
- [ ] **Twilio upgraded TRIAL → PAID** (trial can't reach real emergency contacts — F8).
- [ ] **Rotate any credential exposed during setup** (esp. Twilio Auth Token — F9); set secrets only in dashboards.

## B. Strict ordered run (do NOT reorder — Vercel auto-deploys `main`)
1. [ ] **Secrets** — env (Step A) **and** `system_settings` rows (Step B: Stripe, Mollie,
       Twilio dupes, Facebook, company info).
2. [ ] **Deploy edge functions** to `cfwnrcogikjycjcobsay` (Step D) — confirm link target first.
3. [ ] **Switch Vercel env vars** → new project: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`,
       `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. [ ] **Merge feature branches → `main`** (order per `MERGE_ORDER.md`) → triggers Vercel
       production deploy against the now-wired backend. ⛔ Never merge before steps 1–3.
5. [ ] **Bootstrap first admin** (Step C: `bootstrap_first_admin`, self-disabling).
6. [ ] **Staff**: invite Mary (supervisor) + Carmen/Albert/Travis (operators) via the invite
       flow; set on-call/escalation + rota (Steps C2/C3). Test accounts = `Test@1234` (TESTING ONLY).

## C. Blocking smoke-test gates (Step F — ALL must pass before real clients)
- [ ] **F3 SOS end-to-end** — pendant/test → `alerts` row → `emergency-contact-notify` → escalation (NOT toggle-dependent).
- [ ] **F4 Chat widget** — `ai-run` replies; toggling `chat_widget` off suppresses reply but keeps escalate-to-human.
- [ ] 🔴 **F5 Medical data** — full `/join` (single AND couple) → `medical_information` (member + partner) + `emergency_contacts` rows exist.
- [ ] 🔴 **Live payment charge** — Stripe/Mollie test-mode `/join` → charged total == displayed total (== `payments`/`orders` rows).
- [ ] 🔴 **HMAC pendant** — real pendant request verifies via HMAC; THEN set `EV07B_ENFORCE_HMAC=true`.
- [ ] 🔴 **Night SOS reaches Lee** — uncovered/unanswered night SOS → shift-monitor WhatsApp + escalation reach Lee, and Lee can take the call (C3).
- [ ] **Role boundaries** — operators see medical+alerts, NOT finance/settings; supervisor manages rota; admin all (C2).
- [ ] **F6 Nav/footer links** — every public header/footer link lands/scrolls from home + a sub-page (esp. Pricing).
- [ ] 🔴 **F7 No test/shared password** — no account uses `Test@1234`; real staff via invite flow.
- [ ] 🔴 **F8 Twilio paid** · **F9 exposed creds rotated**.

## After all gates pass
- [ ] `cfwnrcogikjycjcobsay` is live production → update `CLAUDE.md` §4 (swap current-live ref); decide fate of old `crpsuhoixfdhjugprbuc`.
