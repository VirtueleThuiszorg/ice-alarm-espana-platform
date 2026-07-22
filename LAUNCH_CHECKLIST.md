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

### Payments  *(human gate — CLAUDE.md)*
- [ ] Stripe + Mollie **live** keys entered in Admin → Settings; webhook secret set.
- [ ] Webhook-**only** activation proven end-to-end on prod (no client-side bypass).
- [ ] Per-line IVA correct at checkout (plans 10% / devices 21%) — LAUNCH_SCOPE §1.

### Safety & security  *(human gate)*
- [ ] SOS → operator path signed off (E2E, measured latency).
- [ ] RLS isolation tests green on every table.
- [ ] Isabella tool-permission gate verified (hard-blocked tools unreachable).
- [ ] Twilio on a **PAID** plan (trial can't reach real emergency contacts).
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

### Backend  *(Stage 0 — STATE.md)*
- [ ] Supabase Stage 0 verification complete on `crpsuhoixfdhjugprbuc`
      (migration diff, deployed-function diff, Postgres error-spike root cause) —
      **needs a `SUPABASE_ACCESS_TOKEN`** for the LifeLink Sync org.
- [ ] Empty project `qkfvojbcxaptufsepupo` deleted.

### Content & brand
- [ ] Real launch-critical imagery in place (no placeholders on landing + pendant) —
      IMAGE_SPEC.md / FRONTEND_REDESIGN.md §5.
- [ ] Public output free of ICE leftovers and unverifiable claims (LAUNCH_SCOPE §7).

## Rollout stages (see LAUNCH_SCOPE.md §10)
Stage 0 backend → Stage 1 scope locked → Stage 2 docs → Stage 3 pricing-to-DB →
Stage 4 public frontend (hide/strip/brand) → **Stage 4b redesign (FRONTEND_REDESIGN.md,
after visual sign-off)** → Stage 5 members area → Stage 6 partner portal →
Stage 7 payments hardening → Stage 8 broken-items sweep → Stage 9 prove & launch.
