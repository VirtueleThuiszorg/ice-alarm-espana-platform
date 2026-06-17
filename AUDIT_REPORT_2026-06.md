# Care Conneqt Platform — Audit Report

- **Date:** 2026-06-16
- **Auditor:** Claude Code (automated, read-only)
- **Scope:** Full read-only audit. No code, config, or database was modified.
- **Working dir audited:** `/Users/leewakeman/care-conneqt-platform/care-conneqt-platform`
- **Supersedes context from:** `AUDIT_REPORT.md` (2026-02-28, pre-rebrand ICE Alarm snapshot)

---

## 0. Executive summary

The platform is large and largely intact: ~155k LOC, 107 pages, 290 components,
92 hooks, 87 edge functions, 123 migrations. Typecheck and production build both
pass. The rebrand to Care Conneqt is **mostly** done — the new blue theme is in
place and the old Supabase project ref is gone from live code — but it is **not
finished**, and three things stand out as genuinely blocking:

1. **The test suite does not run at all** (0 of ~238 tests execute) because a
   duplicate copy of the entire repo sits in the parent directory and hijacks
   Vitest's root resolution. We currently have **no automated test coverage
   signal** — unacceptable for a life-safety service before launch.
2. **The prior audit's 62 findings (12 critical) are unverified.** The rebrand
   explicitly preserved all logic/schema, and no document claims any of them
   were fixed. They must be presumed open until re-checked in code.
3. **Several rebrand placeholders are still unfilled** in launch-critical paths
   (`vercel.json` sitemap, six email templates, `index.html` preconnects), and
   member-facing leftovers (old coral red in all transactional emails, an
   `icealarm.es` sitemap pointer in `robots.txt`) remain.

No hardcoded secrets were found anywhere — that part is clean. There is **no
staging environment** (prod + Vercel PR previews only), and staff onboarding has
**no bootstrap mechanism** (first admin is created by hand in the Supabase
dashboard).

A note on CLAUDE.md accuracy: several figures are stale. CLAUDE.md says "~57
edge functions" (actual 87), "~238 tests" (cannot currently be run), "Isabella
52 functions / ~15 active" (actual: 50 defined in code, 19 seeded to DB, **1
active by default**), and "i18n Spanish + English at minimum" with a Dutch
expectation (no `nl` locale exists).

---

## 1. Baseline documents

| Doc | Path | Date | What it claims |
|---|---|---|---|
| `CLAUDE.md` | repo root | undated (TODOs unfilled) | Operating instructions; many `[TODO: confirm]` placeholders never filled from the audit |
| `README.md` | repo root | 2026-04-18 | "238 tests / 57 edge functions"; backend "Supabase Cloud via Lovable"; `main`→Vercel prod |
| `AUDIT_REPORT.md` | repo root | **2026-02-28** | Pre-rebrand ICE audit: **62 issues (12 critical, 18 high, 22 med, 10 low)** |
| `REBRAND_CHECKLIST.md` | repo root | 2026-04-18 | 9-phase rebrand plan; **header ✅ but every checkbox unticked**; lists known debt |
| `BRAND_ASSETS.md` | repo root | 2026-04-18 | New brand: Deep Blue `#1e5a9c` / HSL `215 85% 35%`, Poppins/Open Sans |
| `gps-gateway/README.md` | gps-gateway/ | 2026-04-18 | GT06 TCP bridge, port 5001; already rebranded |
| `render-worker/README.md` | render-worker/ | 2026-04-18 | Remotion/FFmpeg worker; **still branded "ICE Alarm Video Hub"** |

**Not found:** `ALIGNMENT_PLAN.md`, `.lovable/plan.md` (the `.lovable/` dir was
deliberately removed in the rebrand), `ARCHITECTURE.md`, `CONTRIBUTING.md`, and
any `AUDIT_REPORT_*.md` prior to this one.

**Key caveat:** The 2026-02-28 audit predates the rebrand and audited the ICE
codebase. The rebrand's stated golden rule was "features/code/schema stay 100%
intact; only branding + infrastructure change." **Therefore all 62 prior
findings should be treated as still-open until individually re-verified.** This
audit did not re-verify all 62 (that is a larger exercise) — see §3 and the
recommendation in §8.

---

## 2. Inventory

| Asset | Count | Notes |
|---|---|---|
| Pages (`src/pages/**`) | 107 | Areas: admin, auth, blog, call-centre, client, join, partner, staff + 13 root pages |
| Components (`src/components/**`) | 290 | |
| Hooks (`src/hooks/**`) | 92 (93 incl. one elsewhere) | |
| Edge functions (`supabase/functions/*`) | 87 | + `_shared/` lib |
| Migrations (`supabase/migrations/*.sql`) | 123 | 2026-01-21 → 2026-04-20 |
| LOC — `src/` (TS/TSX) | 132,528 | |
| LOC — edge functions (TS) | 22,230 | |
| **Total TS/TSX LOC** | **154,758** | |

### i18n completeness

- **Locales present:** `en`, `es` only (in `src/i18n/locales/`). **No `nl`
  (Dutch)** — despite Mobile-Care being a Netherlands group.
- `en.json`: 4,627 leaf keys / 86 sections. `es.json`: 4,619 keys / 86 sections.
- **Spanish is a genuine, near-complete translation — NOT an English fallback.**
  Only 2.8% of values are identical, and those are legitimately untranslated
  (SOS, IMEI, WhatsApp, OK, etc.). Sampled values are real Spanish prose.
- **Gap:** 8 keys exist in EN but are missing from ES, all in `subscription.*`
  (`title`, `subtitle`, `upgrade`, `upgradeDesc`, `cardEnding`, `expires`,
  `noActiveSubscription`, `contactSupport`) — member-facing billing copy that
  will fall back to English for Spanish members.

---

## 3. Status of prior-audit fixes

| # | Item | Verdict | Detail |
|---|------|---------|--------|
| 1 | Vite fallback | **Still present** (de-fanged) | `vite.config.ts:20-31` still has a silent Supabase fallback, but values are now harmless placeholders (`YOUR_SUPABASE_PROJECT_REF`). A missing `.env` still fails silently rather than loud. `index.html:23-27` also has unresolved `<YOUR_NEW_SUPABASE_REF>` preconnect placeholders. (The `vercel.json` SPA fallback correctly excludes `/api/` — that part is fine.) |
| 2 | CORS lockdown | **Mostly fixed** | Shared `_shared/cors.ts` enforces an origin allowlist (no `*`). 82 of 84 browser functions use it. **1 wildcard holdout:** `auth-email-hook/index.ts:13,84` (server-side webhook, low-risk). 6 functions have no CORS (non-browser webhooks). |
| 3 | Server-side validation | **Partial** | Shared zod layer (`_shared/validation.ts`) covers the highest-risk public write paths (registration, checkout, partner/staff register + invite, send-email) — ~11 functions. The other ~70 rely on API-key/token gating + manual checks, not schema validation. Defensible but uneven. |
| 4 | Staging environment | **Does not exist** | No `.env.staging` (only a gitignore entry). CI (`.github/workflows/ci.yml`) runs lint/typecheck/build/test on `main` with dummy env; no deploy-to-staging job. **Production + Vercel PR previews only.** |
| 5 | `.env.example` complete | **Partial** | Exists, grouped by integration, but documents **only frontend `VITE_*` vars**. Every server-side edge-function secret is absent (Twilio, Resend/Gmail, Google OAuth, `LOVABLE_API_KEY`, `EV07B_CHECKIN_KEY`, `WEBHOOK_SECRET`, etc.). Note: Stripe/Mollie/Gemini keys are stored in a DB table by design, not env — so CLAUDE.md §8's "all keys go in `.env`" does not match reality and should be reconciled. |
| 6 | Staff bootstrap | **Still ad hoc** | No seed script, no `scripts/` dir, no bootstrap migration/endpoint. All staff-creation paths require an existing active admin (chicken-and-egg). First admin must be created manually via Supabase dashboard/SQL. |
| 7 | Isabella active functions | **1 active by default** | State lives in DB table `public.isabella_settings`, column `enabled` (default false), seeded in migration `20260213142641_*.sql`. Seed enables **exactly 1**: `chat_widget`. The admin UI registry (`src/pages/admin/IsabellaOperationsPage.tsx`, `FUNCTION_KEY_MAP`) lists **50** functions; only 19 are seeded to the DB, 1 enabled. State is admin-toggleable at runtime via `src/hooks/useIsabellaSettings.ts`. **Live DB may differ — confirm against production before relying on this number.** |

**Important on item 7:** the 2026-02-28 audit's critical finding was that
"Isabella settings toggles are UI-only and never checked at execution." This
audit located *where* state is stored and that defaults are safe (1 enabled),
but did **not** verify that the execution paths (`ai-run`, `ai-execute-action`,
`ai-dispatch-events`) actually read `isabella_settings.enabled` before acting.
That enforcement check should be confirmed before activating any further
functions — it bears directly on CLAUDE.md §5's "one-click pause" guarantee.

---

## 4. Rebrand integrity

### Confirmed NEW (good)
- **Theme `#1e5a9c` / HSL `215 85% 35%`** is in place: `index.html:8`,
  `public/manifest.json:8`, `public/sw.js:184,191`, `src/index.css` (light+dark
  tokens), `src/components/ui/logo.tsx`, `src/assets/care-conneqt-logo.svg`.
- **Old Supabase ref `pduhccavshrhfkfbjgmj`** is gone from live code (only a note
  in `REBRAND_CHECKLIST.md:142`). Clean.

### Stale / still to fix
- **New Supabase ref `crpsuhoixfdhjugprbuc` appears nowhere in tracked code.**
  Wiring is env-placeholder-based. The CLI *is* linked to the new project (seen
  in gitignored `supabase/.temp/project-ref`), but `vercel.json` still contains
  the literal `YOUR_SUPABASE_PROJECT_REF` placeholder in its sitemap rewrite
  (**unfilled — breaks the sitemap**), and there is no `project_id` in
  `supabase/config.toml`.
- **Old coral red NOT fully purged** (member-facing):
  - `#E74C3C` — 12 hits: all six transactional email templates
    (`_shared/email-templates/*.tsx`), `src/hooks/useBrandedImageGenerator.ts:20`,
    `src/components/OnboardingTour.tsx:335,441,455`.
  - HSL `4 78% 57%` — `tailwind.config.ts:129,130` (`glow` / `glow-lg` shadows).
- **`icealarm.es`** — `public/robots.txt:1` still points the sitemap at
  `https://icealarm.es/sitemap.xml` (live, SEO-facing).
- **`render-worker` un-rebranded** — `IceAlarmVideo` component
  (`render-worker/src/remotion/IceAlarmVideo.tsx`, referenced in
  `src/remotion/index.ts:2,10,11` and `src/index.ts:108`), headline
  `"ICE Alarm España"` (`remotion/index.ts:17`), README title and Docker image
  name `ice-video-render-worker`.
- **`ai-run` prompt** — `supabase/functions/ai-run/index.ts:52` contains
  `ICE ALARM SERVICE KNOWLEDGE` (live AI system prompt → member-facing).
- **`ICE-` order-number prefix** —
  `supabase/migrations/20260302120000_submit_registration_atomic.sql:261` (live
  order numbering — likely intentional continuity; **confirm with Lee** per
  CLAUDE.md §12).
- **`X-ICE-*` email headers** — across `send-email`, `send-test-email`,
  `email-inbound-webhook` (functional plumbing matched on send + inbound;
  rename only as a matched pair).
- **`iceAlarm*` i18n / localStorage keys** — `iceAlarmLanguageSelected`
  (`src/App.tsx:293,301`), `callIceAlarm`/`contactIceAlarm` (locale files +
  `ClientLayout.tsx:355`), `iceAlarmGpsPendant`/`yourIceAlarmPendant`
  (`DevicePage.tsx`). Display values already say "Care Conneqt"; keys preserved
  intentionally per the checklist.
- **Provenance comments** — `src/index.css:9,13,32,176`, `logo.tsx:14`
  (intentionally kept per checklist).

Per CLAUDE.md §12, the items above are flagged, **not** silently renamed. The
member/SEO-facing ones (coral emails, `robots.txt`, `ai-run` prompt,
`render-worker` headline) are the ones that matter for launch; the i18n keys and
comments are cosmetic internal debt.

---

## 5. Configuration & infrastructure

- **Supabase link:** `supabase/config.toml` has **no `project_id`** (not pinned
  in version control). The CLI link state (gitignored `supabase/.temp/`) points
  to the **new** project `crpsuhoixfdhjugprbuc` (pooler region `eu-west-1`).
  Runtime URL/keys come from env (`VITE_SUPABASE_URL` /
  `VITE_SUPABASE_PUBLISHABLE_KEY`) — nothing hardcoded. **Confirm the deployed
  Vercel env vars point at the new project too** (not visible from the repo).
- **Edge functions:** 87 directories. Every function listed in `config.toml` has
  `verify_jwt = false` (public, 60+), including `stripe-webhook`,
  `mollie-webhook`, the EV07B life-safety endpoints (auth via `x-api-key` /
  `EV07B_CHECKIN_KEY`), the Isabella AI surface (`ai-run`, `ai-execute-action`,
  `ai-dispatch-events`), and `save-api-keys`. Each relies on **in-function**
  auth rather than the platform JWT gate — a large surface worth a dedicated
  review (especially `save-api-keys` and the AI endpoints).
- **Secrets — clean.** No hardcoded credentials found anywhere (scanned for
  `sk_live`/`pk_`, Twilio SIDs, Mollie keys, `AIza…`, long JWTs → zero hits).
  - Twilio, Resend/Gmail, Google OAuth, Supabase service-role, `LOVABLE_API_KEY`
    (Gemini via Lovable gateway) → **env** (`Deno.env.get`).
  - **Stripe & Mollie live keys → plaintext rows in the `system_settings` DB
    table**, written by the public `save-api-keys` function. Not a leak, but the
    security posture rests entirely on RLS on `system_settings` + the
    in-function staff check. **Confirm RLS locks that table to service-role.**
- **GPS gateway** (`gps-gateway/`): Node TCP bridge, GT06 parser, forwards to
  `ev07b-checkin`/`ev07b-sos-alert`. Config via env only (`SUPABASE_URL`,
  `EV07B_CHECKIN_KEY`, `GATEWAY_PORT`, `HTTP_PORT`). No `.env.example` in the
  gateway dir. No hardcoded secrets.
- **Render worker** (`render-worker/`): Docker Remotion+FFmpeg. Config via env
  only (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_SECRET`, `PORT`).
  No hardcoded secrets. Still ICE-branded (see §4).

---

## 6. Health checks

| Check | Result | Detail |
|---|---|---|
| Typecheck (`tsc --noEmit`) | **PASS** | 0 errors. (No `typecheck` npm script exists; ran tsc directly.) |
| Lint (`eslint .`) | **FAIL** | 400 problems (338 errors, 62 warnings). 311 are `no-explicit-any`, concentrated in `supabase/functions/**`. 1 hard parse error: `render-worker/src/remotion/index.ts:8` (JSX in a `.ts` file — should be `.tsx`). |
| Build (`vite build`) | **PASS** | ~40s. Only chunk-size warnings (largest chunk 982 kB / 296 kB gz → code-split opportunity). |
| Tests (`vitest run`) | **FAIL** | **0 of ~238 tests run.** All 10 test files fail to collect: `Cannot find module '/Users/leewakeman/care-conneqt-platform/src/test/setup.ts'`. Vitest resolves the root to the **parent** dir (one level too high) because of the duplicate repo (see below). Not an assertion failure — the suite is simply not executing. |
| `npm audit` | **24 vulns** | 2 critical, 14 high, 7 moderate, 1 low — **all dev/build/test toolchain** (vitest <3.2.6 CRITICAL, protobufjs CRITICAL via firebase, rollup HIGH, ws HIGH, esbuild/vite HIGH, react-router HIGH). `npm audit fix` likely clears most without major bumps. No production-runtime criticals identified. |

### Dead / duplicated code
- **Duplicate repo (significant):** the parent dir
  `/Users/leewakeman/care-conneqt-platform/` is a **second git repo with a
  near-complete copy** of the project (its own `src/`, configs, `package.json`,
  `src/test/setup.ts`, a stray `.DS_Store`). This is what breaks Vitest's root
  resolution and zeroes out test coverage. **Decide which copy is canonical and
  remove/relocate the other.**
- `node_modules` was absent on entry; the health agent ran `npm install` (700
  packages) to enable checks. No source was modified.
- No tracked `.bak/.old/.orig` files. 8 unused-import lint hits (minor).

---

## 7. Prioritised fix list

### 🔴 Critical — fix before any launch activity
1. **Restore the test suite.** Resolve the duplicate parent-directory repo so
   Vitest resolves root correctly, then run `vitest run` and confirm the ~238
   tests are green. We have **zero test signal** today on a life-safety service.
   (§6)
2. **Re-verify the 12 prior critical findings in code.** The 2026-02-28 audit's
   criticals (Stripe webhook signature verification, alert-creation code for 6
   of 7 alert types, emergency-contact notifications, Isabella settings actually
   enforced at execution, device-allocation UNIQUE constraint, GDPR deletion,
   etc.) are unverified post-rebrand. Confirm each in code before launch. (§1, §3)
3. **Confirm Isabella enforcement.** Verify `ai-run`/`ai-execute-action`/
   `ai-dispatch-events` actually check `isabella_settings.enabled` before acting,
   and confirm the **production** DB has only the intended functions enabled.
   This underpins CLAUDE.md §5's safety policy. (§3)
4. **Fill the launch-critical rebrand placeholders:** `vercel.json` sitemap ref
   (`YOUR_SUPABASE_PROJECT_REF` → real), the six email-template logo URLs
   (`YOUR_SUPABASE_PROJECT_REF`), and `index.html` preconnect refs. Email and
   sitemap are broken until these are filled. (§4)
5. **Confirm RLS on `system_settings`.** Stripe/Mollie live keys sit in plaintext
   there, written by a public edge function. Verify the table is locked to
   service-role and that `save-api-keys`' staff check is sound. (§5)

### 🟡 Should-fix — before public launch (Aug 1)
6. **Stand up a staging environment.** Prod + PR previews is not enough to
   rehearse the ICE→Care Conneqt member migration safely. (§3)
7. **Purge member-facing old coral red:** email templates, onboarding tour,
   branded-image generator, tailwind glow shadows → new blue. (§4)
8. **Fix `public/robots.txt`** — sitemap still points to `icealarm.es`. (§4)
9. **Rebrand the live `ai-run` system prompt** ("ICE ALARM SERVICE KNOWLEDGE")
   and the `render-worker` headline/component if it produces member/marketing
   video. (§4)
10. **Complete `.env.example`** — add all server-side edge-function secrets,
    grouped by integration, and reconcile CLAUDE.md §8 (which wrongly says all
    keys live in `.env`; Stripe/Mollie/Gemini live in the DB). (§3)
11. **Add a one-shot staff bootstrap** (seed script or guarded bootstrap
    endpoint) so first-admin creation isn't manual SQL. (§3)
12. **Triage `npm audit`** — run `npm audit fix`, re-test, and pin the vitest /
    rollup / ws / esbuild advisories. (§6)
13. **Translate the 8 missing `subscription.*` Spanish keys.** (§2)
14. **Decide the `verify_jwt=false` posture** — document why each public function
    is public and confirm in-function auth, prioritising `save-api-keys` and the
    AI endpoints. (§5)

### 🟢 Nice-to-have — post-launch / cleanup
15. Rename `render-worker/src/remotion/index.ts` → `.tsx` (clears the lint parse
    error) and rebrand `IceAlarmVideo` / `ice-video-render-worker`. (§4, §6)
16. Drive down the 311 `no-explicit-any` lint errors in `supabase/functions/**`
    (CLAUDE.md §9 typing debt).
17. Code-split the 982 kB main chunk. (§6)
18. Pin `project_id` in `supabase/config.toml` so the link target is in version
    control. (§5)
19. Decide whether to migrate the intentional `iceAlarm*` i18n/localStorage keys,
    `ICE-` order prefix, and `X-ICE-*` headers, or formally document them as
    permanent continuity. (§4)
20. Add a Dutch (`nl`) locale if Mobile-Care NL needs a Dutch UI. (§2)
21. Update CLAUDE.md's stale figures (edge fn count, test count, Isabella
    numbers, backend description). (§0)

---

## 8. Launch-readiness gap list — mapped to rollout & Aug 1 target

> **Note:** No explicit "4-step rollout" document was found in the repo. CLAUDE.md
> describes an ICE Alarm → Care Conneqt migration over **May–July 2026** with
> **public launch 1 Aug 2026**. The four stages below are an inferred,
> conservative reading of that timeline — **please confirm the actual rollout
> steps** so this mapping can be corrected.

**Stage 1 — Infrastructure cutover (should already be done; partially open)**
- ❌ Fill `vercel.json` / email-template / `index.html` Supabase placeholders
  (Critical #4).
- ❌ Confirm Vercel env vars point at new project `crpsuhoixfdhjugprbuc`; pin
  `project_id` in config (§5).
- ❌ Confirm `system_settings` RLS (Critical #5).
- ⚠️ No staging environment to rehearse cutover (Should-fix #6).

**Stage 2 — Data / member migration (~100 members ICE → Care Conneqt)**
- ❌ No staff bootstrap → first admin on the new project is manual (Should-fix #11).
- ❌ Test suite not running → migrations/data integrity changes can't be
  regression-tested (Critical #1).
- ⚠️ EV07B life-safety endpoints are public + API-key-gated; verify the key is
  provisioned on the new project and the gateway points at it before any
  pendant traffic cuts over (§5).

**Stage 3 — Member-facing launch prep**
- ❌ Old coral red in all transactional emails; `robots.txt` → `icealarm.es`;
  `ai-run` prompt still says "ICE ALARM" (Should-fix #7, #8, #9).
- ❌ 12 prior critical findings (Stripe sig verification, alert creation,
  emergency-contact notifications, GDPR deletion) unverified — all directly
  member-safety/billing facing (Critical #2).
- ⚠️ 8 untranslated Spanish billing strings (Should-fix #13).
- ⚠️ T&Cs need legal review (flagged in REBRAND_CHECKLIST).

**Stage 4 — Go-live (1 Aug 2026)**
- ❌ Confirm Isabella enforcement + production enabled-function set (Critical #3).
- ❌ Green test suite as a release gate (Critical #1).
- ⚠️ npm audit toolchain vulns cleared (Should-fix #12).

**Bottom line for Aug 1:** the blockers are concentrated in **Critical #1–#5**.
None is large in isolation, but #1 (no test signal) and #2 (12 unverified
criticals on a life-safety service) are the ones that should gate the date. With
~6 weeks to launch, the sequence I'd recommend is: fix the duplicate-repo/test
issue first (unblocks everything else), then re-verify the prior criticals, then
finish the rebrand placeholders and the member-facing cosmetic leftovers.

---

*End of report. No files were modified during this audit.*
