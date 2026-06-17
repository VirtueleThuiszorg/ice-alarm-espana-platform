# CLAUDE.md — Care Conneqt Platform

> Operating instructions for Claude Code. **This file steers every session — keep it true.**
> Last reconciled against code: **2026-06-16** (from `AUDIT_REPORT_2026-06.md`).
> If a figure here ever disagrees with the code, the code wins — fix this file.

---

## 0. Documentation protocol (always on)

**Follow `LEARN.md` every session — it is the rule-set for keeping these docs true.**

- **At session start:** read the doc set listed in `LEARN.md`, then report (a) anything
  that drifted since last session, (b) any doc that now contradicts the code, and
  (c) 1–3 suggested improvements. Do this *without being asked*.
- **At task end (definition of done):** update the *affected* docs only — not all of
  them. A changed figure → fix it here in §3; a finished launch item →
  `LAUNCH_CHECKLIST.md`; a new gotcha or decision → append to `LEARN.md`.
- **Hard rule:** only write a fact that is verified in code or the live environment.
  Never aspirational. Append history; don't overwrite it. Flag §12 decisions for Lee.

---

## 1. What this is

Care Conneqt is a nurse-led remote-care / personal-emergency-response platform for
older and vulnerable people, primarily expats in Spain, expanding under a Netherlands
parent group. It is the rebranded successor to **ICE Alarm España** (same code, schema,
and features — only branding and infrastructure changed in the rebrand).

Tagline: **"Connected Health. Human Care."** It is a **live life-safety service** —
treat changes to alerting, Isabella, payments, and the EV07B pendant path with
corresponding caution.

## 2. Stack (real, as of 2026-06-16)

- **Front end:** React + Vite + TypeScript + Tailwind + shadcn/ui
- **Back end:** Supabase Cloud — Postgres + 89 edge functions + auth
- **Services:** `gps-gateway/` (Node TCP bridge, GT06 parser, port 5001 → EV07B endpoints);
  `render-worker/` (Docker, Remotion + FFmpeg video) — *still ICE-branded, see §11*
- **Voice:** Twilio · **Payments:** Stripe + Mollie · **AI (Isabella):** Gemini via the
  Lovable API gateway (`LOVABLE_API_KEY`)
- **Hosting:** Vercel. `main` → production. **Vercel builds from GitHub, not local.**

## 3. Size (real figures — the old CLAUDE.md was wrong)

| Asset | Count |
|---|---|
| Pages | 107 |
| Components | 290 |
| Hooks | 92 |
| Edge functions | **89** (89 deployable dirs under `supabase/functions/`, excluding `_shared`; was 87 on 2026-06-16) |
| Migrations | 123 (2026-01-21 → 2026-04-20) |
| Total TS/TSX LOC | ~154,758 |
| Tests | 226 (225 passing — see §7) |

Portals: **admin, call-centre, client, partner, staff** (+ auth, blog, join, root pages).

## 4. Infrastructure & secrets

- **Supabase projects (cutover COMPLETE — verified 2026-06-17):**
  - **`cfwnrcogikjycjcobsay` = CURRENT LIVE PRODUCTION** — Lee-owned account
    (`wakemanlee20@`); what Vercel serves. **Cutover completed 2026-06-17:** schema
    (126 migrations) + all 91 edge functions deployed; Lee bootstrapped as `super_admin`
    (`staff.id 84ccfc96-aeb0-4c75-a1b0-450c9f78d989`). The local repo is linked to this
    ref. **Source of truth.** Treat with full production caution.
  - **`crpsuhoixfdhjugprbuc` = OLD production (Lovable-managed) — no longer served.** Kept
    as a fallback during stabilisation. **Safe to delete only once Lee confirms the new
    site is stable — do NOT delete yet.**
  - **`pduhccavshrhfkfbjgmj` = DEAD ICE ref. Never touch / never resurrect** — pushing to
    it would write into the old ICE production DB.
- **Always confirm the link target before `supabase db push` / `functions deploy`** — the
  three refs above are easy to confuse; verify `supabase/.temp/project-ref` first.
- `supabase/config.toml` has **no pinned `project_id`** — the link lives in gitignored
  `supabase/.temp/`. Pinning it is a backlog item.
- **Secrets posture (reconciled — the old "all keys in `.env`" claim was wrong):**
  - **In env (`Deno.env.get`):** Twilio, Resend/Gmail, Google OAuth, Supabase
    service-role, `LOVABLE_API_KEY`, `EV07B_CHECKIN_KEY`, `WEBHOOK_SECRET`.
  - **In the DB (`system_settings` table, by design):** Stripe + Mollie keys (plus Twilio
    duplicates, Facebook tokens, and company info), written by the public `save-api-keys`
    function. Security rests on RLS on that table — **keep it locked to service-role.**
  - **AI: runs via the Lovable gateway using `LOVABLE_API_KEY` only** (env). **No Gemini /
    direct-provider key is read by any function** (verified 2026-06-16 — the earlier
    "Gemini key in `system_settings`" claim was wrong). `ai-run` + 13 other functions all
    POST to `https://ai.gateway.lovable.dev/v1/chat/completions`.
    - **Planned follow-up (AFTER cutover):** swap `ai-run` and the 13 other
      `ai.gateway.lovable.dev` callers to call **Claude directly (Anthropic API)** via a
      shared `_shared/ai-gateway.ts` helper. **Keep `LOVABLE_API_KEY` working through
      cutover so Isabella is not broken** — the provider swap is a separate code task, not
      part of the clean-start cutover.
  - No hardcoded secrets exist in the repo. Keep it that way.
- **No staging environment** — production + Vercel PR previews only.

## 5. Isabella — the safety-critical bit

- State lives in DB table **`public.isabella_settings`**, column **`enabled`**
  (default `false`), seeded in migration `20260213142641_*.sql`.
- **50 functions defined in code**, **19 seeded to the DB**, **1 enabled by default**
  (`chat_widget`). The admin UI (`src/pages/admin/IsabellaOperationsPage.tsx`,
  `FUNCTION_KEY_MAP`) lists all 50; toggling is runtime via
  `src/hooks/useIsabellaSettings.ts`.
- **⚠️ VERIFIED 2026-06-16 (`CRITICAL_VERIFICATION_2026-06.md`): the per-function
  `isabella_settings.enabled` toggles are NOT enforced at execution.** `ai-run`,
  `ai-execute-action`, and `ai-dispatch-events` do not read `isabella_settings` at all —
  the table is referenced only in frontend code, with no shared server-side gate. So the
  "one-click pause" guarantee does **not** hold for the 50 admin toggles. A *separate*,
  coarser flag — `ai_agents.enabled` (agent-level) — IS partly checked
  (`ai-run/index.ts:839`, `ai-dispatch-events/index.ts:159`), but it is bypassed for the
  `chat_widget` and `voice_call` sources and is not the same as the Isabella toggles.
  **Treat the admin per-function switches as advisory until enforcement is added.** Still
  confirm the *production* enabled-set before relying on the counts above.

## 6. Working rules

- **Small, reversible commits — one logical change at a time.** Never batch unrelated
  fixes.
- **Never push migrations or deploy functions without confirming the link target is
  `cfwnrcogikjycjcobsay` (see §4).** Since the 2026-06-17 cutover this ref **is live
  production** — every `db push` / `functions deploy` hits real production, so verify
  `supabase/.temp/project-ref` first and treat each one with full production caution.
  Never target the old `crpsuhoixfdhjugprbuc` or the dead `pduhccavshrhfkfbjgmj`.
- This was a **rebrand, not a rewrite**: features/logic/schema stay intact. ICE→Care
  leftovers are flagged, **not silently renamed** — see §11 and §12.
- Audits drift (a Feb 2026 audit went un-actioned). Re-audit each quarter; keep this
  file and `LAUNCH_CHECKLIST.md` current.

## 7. Tests

- Run with `npx vitest run`. **226 tests, 225 passing** as of 2026-06-16.
- The suite was previously **non-functional** because a duplicate copy of the repo
  nested in the parent directory hijacked Vitest's root resolution. Fixed 2026-06-16 by
  de-nesting; old copy parked at `~/care-conneqt-platform-OLD`.
- The 1 known failure (`src/test/crmEvents.test.ts`) is a test-hygiene issue — it builds
  the real Supabase client without a URL instead of mocking it. Not a code defect.
- There is **no `typecheck` npm script** (run `tsc --noEmit` directly). `eslint .`
  reports ~400 problems, mostly `no-explicit-any` in `supabase/functions/**`.

## 8. i18n

- Locales present: **`en` and `es` only.** Spanish is a genuine, ~99.8%-complete
  translation (not an English fallback).
- 8 `subscription.*` keys are missing from `es.json` (member-facing billing copy).
- **No `nl` (Dutch) locale exists yet** — despite the Netherlands parent. Add when the
  Dutch UI is needed.

## 9. Brand

- **Deep Blue `#1e5a9c` / HSL `215 85% 35%`**, Teal secondary, Poppins + Open Sans,
  two-C interlocking logo. Defined in `BRAND_ASSETS.md`.
- Functional alert tokens (`--alert-sos`, `--alert-fall`, etc.) are **states, not
  brand** — leave them.

## 10. Launch

- **Public launch target: 1 August 2026.** ICE → Care Conneqt migration runs May–July.
- 4-step rollout: **(1) Rebrand → (2) Internal team launch → (3) Beta to selected
  existing clients (no new hardware) → (4) Full rollout with pendants/devices.**
- See `LAUNCH_CHECKLIST.md` for the live blocker list.

## 11. Known ICE→Care leftovers (member/SEO-facing = fix; internal = documented debt)

**Fix before launch (member/SEO-facing):**
- Old coral `#E74C3C` in all six transactional email templates, `OnboardingTour.tsx`,
  `useBrandedImageGenerator.ts`, and `tailwind.config.ts` glow shadows (`4 78% 57%`).
- `public/robots.txt` sitemap still points at `icealarm.es`.
- `ai-run/index.ts` system prompt still says "ICE ALARM SERVICE KNOWLEDGE".
- `render-worker` still branded "ICE Alarm Video Hub" (`IceAlarmVideo` component,
  Docker image `ice-video-render-worker`).
- Unfilled placeholders: `vercel.json` sitemap (`YOUR_SUPABASE_PROJECT_REF`), six email
  template logo URLs, `index.html` preconnects.

**Documented continuity (do NOT change without a decision — see §12):**
- `ICE-` order-number prefix (live order numbering).
- `X-ICE-*` email headers (matched send + inbound — rename only as a pair).
- `iceAlarm*` i18n / localStorage keys (display values already say "Care Conneqt").

## 12. Decisions that need Lee, not Claude Code

Flag and ask — never silently resolve: the `ICE-` order prefix, the `X-ICE-*` headers,
whether to migrate the `iceAlarm*` keys or keep them as permanent continuity, and
anything touching legal entity / domains / Dutch product scope.
