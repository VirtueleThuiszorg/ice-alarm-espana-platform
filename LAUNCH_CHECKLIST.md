# LAUNCH_CHECKLIST.md — every blocker/task to launch (canonical per LEARN.md §1)

> Ticked only when **VERIFIED** (a test, a click-through, or a confirmed live
> setting — never "looks done"). Go-live is blocked until every **hard blocker**
> is ticked. Created 2026-07-22. See `LAUNCH_SCOPE.md` for scope and `STATE.md`
> for the honest current state behind each item.

## Hard launch blockers (go-live is blocked until all ticked)

### Domain & email  *(added 2026-07-22)*
- [ ] **Launch domain owned + DNS controlled + attached to Vercel + email SPF/DKIM verified.**
  - **Status 2026-07-22:** `careconneqt.es` is **owned by a known partner**.
    Attaching it to Vercel + DNS + email verification (SPF/DKIM/DMARC and
    Resend/Gmail domain verification) is a **final, coordinated go-live step** —
    done together with the partner at cutover, not before.
  - Until then the repo uses `careconneqt.es` in `public/robots.txt` (sitemap)
    and the `auth-email-hook` sender domain as the intended value; **email
    sending from `@careconneqt.es` remains unverified**, and **development
    continues on the `*.vercel.app` URL**.
- [ ] **Email transport = Resend on the verified `careconneqt.es` domain** *(Lee,
      2026-07-24)*. The provider-aware shared helper is **MERGED (#69) but DORMANT**:
      `email_settings.provider` is `NOT NULL DEFAULT 'gmail'` and the singleton row
      was created with defaults, so every send stays on the Gmail path until the
      admin toggle flips — and prod functions additionally still run the pre-#69
      bytes until the next manual redeploy (deploy-functions green-skips). All ~11
      transactional functions inherit through the helper (test-pinned in
      `emailTransport.test.ts`). **Resend activates via the admin toggle at domain
      cutover** — steps, in order:
      1. verify `careconneqt.es` in Resend (SPF/DKIM DNS, with the domain partner);
      2. `supabase secrets set RESEND_API_KEY=... --project-ref crpsuhoixfdhjugprbuc`;
      3. set `email_settings.from_email` to a `@careconneqt.es` address and flip
         `provider` to `resend` in Admin → Settings → Email;
      4. redeploy the email functions; smoke-test an invite + a recovery email.
      Sanity check when next in admin: confirm the Email Settings provider toggle
      currently reads **Gmail** (it should — flag it if not). Until this line ticks,
      **development email runs on Gmail SMTP** (`GMAIL_APP_PASSWORD`, dedicated Care
      Conneqt Gmail — interim only: ~500/day cap, no bounce webhooks, no
      custom-domain DKIM; not acceptable at go-live).

### Payments  *(human gate — CLAUDE.md)*
- [ ] Stripe + Mollie **live** keys entered in Admin → Settings; webhook secret set.
- [ ] Webhook-**only** activation proven end-to-end on prod (no client-side bypass).
- [ ] Per-line IVA correct at checkout (plans 10% / devices 21%) — LAUNCH_SCOPE §1.

### Safety & security  *(human gate)*
- [ ] SOS → operator path signed off (E2E, measured latency).
  - **Status 2026-07-23 (STAGE_SOS_FIX.md):** WP-A unified ownership **merged** (#35),
    WP-B single resolve path **merged** (#36), admin **SOS drill merged** (#37 — safe
    live-drill tool, level-5 ladder-inert, auto cleanup). WP-C real escalation (#39)
    and WP-D `tel:112` button (#40, stacked) are **open, gated on Lee's live drill +
    per-PR sign-off**. Each WP carries single-write-path + race + source-scan tests.
- [ ] **/complete-registration works on prod** — currently every signup completing there
      fails RLS (client-side members INSERT, denied by design). Server-side fix with
      zero policy changes is **PR #38 (open, for Lee review)**. Partner
      ResidentialDashboard has the same bug class (flagged, separate gated fix).
- [ ] RLS isolation tests green on every table.
- [ ] Isabella tool-permission gate verified (hard-blocked tools unreachable).
- [ ] Twilio on a **PAID** plan — **the emergency-critical channel** *(Lee,
      2026-07-24)*: `emergency-contact-notify` sends SMS first, email second; a
      trial account can't reach unverified numbers, so real emergency contacts
      would silently get nothing. Email (whatever the provider) is never the
      channel an SOS depends on.
- [ ] No test/shared passwords on any account at go-live.
- [ ] **Rotate the `service_role` key and the Supabase access token** (both were
      exposed during dev). Then update **all** references to the new values:
      the Vault secret `service_role_key` (`vault.create_secret` / rotate),
      the `SUPABASE_ACCESS_TOKEN` GitHub Actions secret (used by
      `deploy-functions.yml`), and any other env reference — and **verify the
      crons still fire** afterwards (`sos-escalation-runner`, `staff-shift-monitor`,
      `ev07b-offline-monitor`, `shift-daily-reminders` post to their functions
      without a `service_role_key missing from Vault` warning). Dev continues on
      the current keys by Lee's decision; rotation is a **final go-live step**.

### Backend  *(Stage 0 / 0b — STATE.md)*
- [x] Supabase Stage 0 verification complete on `crpsuhoixfdhjugprbuc`
      (migration diff, deployed-function diff, Postgres error-spike root cause).
- [x] Stage 0b executed 2026-07-22 (two pushes): all drift migrations + the 2 SOS
      cron migrations applied; **91 functions deployed**; all 4 crons re-scheduled on the
      Vault pattern (**code-verified**: no live cron references `app.settings`).
- [x] **Crons confirmed firing on prod (2026-07-22 ~17:47 UTC).** `cron.job_run_details`:
      all 4 jobs `status=succeeded`, **no `app.settings` error** — `sos-escalation-runner`
      (1 min), `ev07b-offline-monitor` (2 min), `staff-shift-monitor`, `shift-daily-reminders`.
      The ~721/day error spike is **RESOLVED**. (Evidence in STATE.md → Stage 0b.)
- [ ] **24h clean-run confirmation** — re-check `cron.job_run_details` + error count at
      **T+24h (~2026-07-23)** to confirm the clean run held for a full day, then this line
      closes. (Clock started 2026-07-22 ~17:47 UTC.)
- [ ] Empty project `qkfvojbcxaptufsepupo` deleted.
- [ ] **Pending migrations to apply** (none applied on prod yet; all reversible,
      none touches an RLS policy):
      `20260725010000_partner_privilege_guard.sql` (**security** — makes
      privileged `partners` columns, incl. the `alert_visibility_enabled` SOS
      alert-stream gate, immutable for non-staff; #78) ·
      `20260725120000_pendant_copy_human_first.sql` (public pendant copy no
      longer says the SOS button "connects you to Isabella"; #80) ·
      `20260725130000_pendant_copy_no_clinical_claim.sql` (drops the
      "24/7 nurse-led care centre" claim). Both copy migrations are guarded on
      the old text, so an admin edit made in prod first is left alone.

### Content & brand
- [ ] Real launch-critical imagery in place (no placeholders on landing + pendant) —
      IMAGE_SPEC.md / FRONTEND_REDESIGN.md §5.
- [ ] Public output free of ICE leftovers and unverifiable claims (LAUNCH_SCOPE §7).
      **Claims sweep run 2026-07-25** across every public namespace × en/es/nl.
      Four claims contradicted our own repo and are now corrected and pinned by
      `publicClaims.test.ts`: "30-day money-back guarantee" (Terms §8.4/§9.2 give
      a 14-day cooling-off, registration fees non-refundable) · "Free next-day
      delivery to Spain" (shipping is a **€14.99** fee, `src/config/pricing.ts`,
      and checkout quotes 2–3 business days) · "**Average response time under 30
      seconds**" on /contact (Terms §3.2/§4.3 disclaim any specific response
      time) · "24/7 nurse-led care centre" in the seeded catalog (no nurse in
      `app_role`; Terms §3.2 disclaims medical care).
      **Still open for Lee:** `support.faq.cancelSubscriptionAnswer` says
      "we require 30 days' notice for cancellation" while /pendant, /landing and
      the Terms all say cancel any time — one of the two is wrong and it is a
      contractual term, so it is flagged rather than guessed.
- [ ] Favicon + meta + OG branded (LAUNCH_SCOPE §7): repo icon set is the Care Conneqt
      "v" mark (favicon.ico/16/32/48, icon-192/512, apple-touch, icon.svg) and og-image.png
      is the two-C wordmark — both on-brand, no ICE. `index.html` `<title>`, meta description,
      og:site_name/og:title/og:image and twitter:* are Care Conneqt.
      **Prod still serves the OLD icon (2026-07-22) — root cause is a stale deploy / CDN
      cache, NOT the repo** (STATE.md "Favicon" note: `dist/favicon.ico` sha256
      `d8e3315f…` = the "v" mark). To clear: **redeploy current `main`, then purge the
      Vercel edge cache**; confirm with
      `curl -s https://<prod-url>/favicon.ico | sha256sum` == `d8e3315f327b38a58f59ecfd5ac6521455368adf7c35e5ccb8dc08695d60d4d1`.
      (SW `CACHE_VERSION` v4 clears browser cache; `vercel.json` now short-caches icon paths
      so future swaps propagate.)
- [ ] **NATIVE-SPEAKER LEGAL REVIEW — Dutch Terms + Privacy Policy** *(Lee,
      2026-07-25)*. `legal.*` was **490 of 492 values untranslated English** in
      `nl.json`, so Dutch customers read the entire T&Cs and Privacy Policy in
      English. Now translated (Terms 253 values, Privacy 237) in the formal
      *u* register, with every legal citation, retention period and figure
      carried across unchanged. **Machine-drafted — a native Dutch speaker must
      review before launch**, per Lee's instruction. Guarded against regression
      by `nlTranslations.test.ts` (`legal.` namespace).
- [ ] **Privacy Policy sub-processor table — verify against reality** (found
      during the Dutch translation, all three locales):
      - **`OpenAI, LLC` was listed as the AI sub-processor. We do not use
        OpenAI** — Isabella runs on the Anthropic API (`claude-opus-4-8` via
        `_shared/anthropic.ts`). Corrected to **`Anthropic, PBC`** in en/es/nl.
        **Lee must confirm the real-world paperwork exists** (DPA / Standard
        Contractual Clauses with Anthropic) — naming a processor we have no
        agreement with is its own GDPR problem.
      - **`Google (Gmail)` is listed for email delivery.** True today, but it
        becomes **Resend** at domain cutover (#69) — this row must change in the
        same push that flips `email_settings.provider`.
      - **`MonitorLinq B.V.` (NL) is named as the device-monitoring partner**
        with ISO 27001 / NEN 7510 certification, and §3.3 says device data
        flows through them. Confirm this is the actual partner and that the
        certification claim is theirs to make, or correct it.

### Pre-launch polish (Stage 8 broken-items sweep)  *(added 2026-07-24, goal loop)*
- [x] **nl locale: legacy English values replaced with real Dutch** — 52 keys in
      `shifts.*` / `leads.*` / `covers.*` / `callCentre.members.*` were English pasted
      into `nl.json`. Fixed (formal-u register), **merged in PR #56**; regression-guarded
      by `nlTranslations.test.ts` (any nl value byte-identical to en in those namespaces
      fails, two legitimate "Status" identicals pinned).
- [x] **Portal-wide page-audit sweep, non-gated fixes (all portals × en/es/nl)** —
      inventory 2026-07-24 (16 dead buttons, ~66 missing-key sites, 1 contrast issue,
      0 broken links). All non-gated fixes are **on main**: batch 1 client/auth (#57),
      batches 2–4 partner/admin/call-centre (#58/#59/#60, relayed to main via #63 after
      the stacked-base misdirect). `i18nKeyCoverage.test.ts` harness pin is EMPTY —
      every no-default `t()` key resolves in en/es/nl, and the `t(...) || "…"`
      anti-pattern is banned repo-wide.
- [ ] **Page-audit gated leftovers (await Lee)**: call-centre emergency button
      (= WP-D reland, parked for live drill) · client emergency contact button
      (`ClientLayout.tsx`, SOS-adjacent) · SubscriptionTab Create/Change-Plan buttons
      (payments) · partner alert Acknowledge button (alerts write). Each needs Lee's
      word before a gated PR is built/merged.
- [ ] **Lovable exit, final slice**: `auth-email-hook` migration **on main** (#62 via
      relay #64 — needs deploy + Send Email hook cutover, steps in PR #64); growth-fn
      archive **PR #65 (draft)** awaiting Lee's visual approval. After #65: zero
      Lovable references outside `archive/` (pinned by `lovableDebris.test.ts` +
      `archivedFunctions.test.ts`).

## Rollout stages (see LAUNCH_SCOPE.md §10)
Stage 0 backend → Stage 1 scope locked → Stage 2 docs → Stage 3 pricing-to-DB →
Stage 4 public frontend (hide/strip/brand) → **Stage 4b redesign (FRONTEND_REDESIGN.md,
after visual sign-off)** → Stage 5 members area → Stage 6 partner portal →
Stage 7 payments hardening → Stage 8 broken-items sweep → Stage 9 prove & launch.
