# AUDIT_FULL_2026-07.md — Full read-only repository audit

> **Date:** 2026-07-14 · **Auditor:** Claude Code (automated, read-only) · **Mode:** No code, config, migration, or DB was modified.
> **Method:** Direct code trace with `file:line` evidence + 7 parallel read-only auditors (one per dimension). Every finding cites evidence; anything not confirmable in code is marked **UNVERIFIED**.
> **Frozen snapshot** per `LEARN.md` §6 — supersede with a new dated file; do **not** edit this one.
> **Compared against:** `APP_AUDIT_2026-06.md`, `AUDIT_REPORT_2026-06.md`, `CRITICAL_VERIFICATION_2026-06.md`, `TECHNICAL_SPEC.md`.
> **Repo state:** branch `claude/full-repo-audit-2026-07-bwt11y`; last migration `20260617130000_fix_bootstrap_first_admin_is_active.sql`.

---

## 0. Executive summary

Since the June 2026 audit the platform has moved forward materially on the two things that most needed fixing:

1. **The test suite runs again.** `npx vitest run` → **349 tests passing**, 1 suite fails to *collect* (`src/test/crmEvents.test.ts` — builds a real Supabase client with no URL; test-hygiene, not a code defect). June's "0 of ~238 tests run" (nested duplicate repo) is **RESOLVED**.
2. **The Isabella enforcement gate now exists and is wired.** `supabase/functions/_shared/isabella-gate.ts` (233 lines) is imported **and enforced** by all three execution paths (`ai-run`, `ai-execute-action`, `ai-dispatch-events`). The central June/Feb finding — "the 50 admin toggles are never checked at execution; one-click pause does not hold" — is **FIXED for the three core Isabella paths**, with correct never-gated carve-outs for safety-critical and legal functions.

The **safety pipeline is provably AI-independent** — EV07B → SOS → alert → 5-level escalation runs on Postgres + Twilio + email with **zero** AI imports (traced hop-by-hop below).

But four things stand out as genuinely blocking or high-risk, **three of them new since June**:

- 🔴 **The AI trio is unauthenticated.** `ai-run`, `ai-execute-action`, `ai-dispatch-events` have `verify_jwt=false` **and no in-code auth** — anyone with the URL can trigger AI runs, inject business events, and execute approved actions. A kill-switch is only as good as the door it locks; this door is open. (NEW — §7.)
- 🔴 **Live payment secrets are readable by every staff member.** `system_settings` RLS grants SELECT to *any* active staff (`is_staff()`), not super-admin/service-role — so a call-centre agent can read `settings_stripe_secret_key`, Mollie keys, Twilio tokens in plaintext. CLAUDE.md §4's "locked to service-role" is false. (NEW — §7.)
- 🔴 **No recurring Stripe billing exists.** Stripe checkout uses `mode:"payment"` (one-time), so a `stripe_subscription_id` is never created; the June "billing-blind subscription" fix (`admin-subscription-action` + `billing.ts`) is architecturally sound but **inert for Stripe** (returns 422) and **refuses Mollie** (501). A second DB-first cancel path still exists. (NEW — §8.)
- 🟡 **The Isabella gate covers only the 3 core paths.** The **10 media/outreach content-generation call sites** (`media-draft`, `generate-ai-image`, `outreach-*`, `repurpose-content`, `generate-slot-content`, `facebook-publish`, `rate-outreach-leads`) call the Lovable gateway with **no gate** — this is the concrete target list for the feature-flag project. (§4/§5.)

**Feature-flag verdict (detail in §12):** ✅ **Safe to build on top** — the gate architecture is well-designed, unit-tested, and the safety path is isolated so flags can never endanger SOS. **But** two blockers must be closed first: authenticate the AI trio (§7), and bring the 10 ungated generative functions under the same gate (§5).

No hardcoded secrets exist in the repo (still clean). CLAUDE.md has drifted on several figures (edge-function count, test count, `robots.txt`, RLS posture) — corrections listed in §13.

---

## 1. INVENTORY (dimension 1)

| Asset | 2026-07 (now) | 2026-06 (June audit) | Δ | Notes |
|---|---|---|---|---|
| Pages (`src/pages/**/*.tsx`) | **109** | 107 | +2 | New: `PricingPage.tsx` (104 LOC), `admin/OrderDetailPage.tsx` (178 LOC) |
| Components (`src/components/**`) | **292** | 290 | +2 | |
| Hooks (`src/hooks/**`) | **93** | 92 | +1 | |
| Edge functions (dirs excl `_shared`) | **91** | 87 | +4 | CLAUDE.md §3 said 89 — now stale |
| — of which listed in `config.toml` | **59** | (all) | — | **32 functions absent from config.toml** — see §7.6 |
| Migrations (`*.sql`) | **126** | 123 | +3 | `20260616120000_bootstrap_first_admin`, `20260617120000_pricing_source`, `20260617130000_fix_bootstrap_first_admin_is_active` |
| Migration date range | 2026-01-21 → **2026-06-17** | → 2026-04-20 | | |
| LOC — `src/` TS/TSX | **134,092** | 132,528 | +1,564 | |
| LOC — edge functions TS | **22,947** | 22,230 | +717 | |
| **Total TS/TSX LOC** | **~157,039** | 154,758 | +2,281 | |
| Tests | **349 passing** (1 suite fails to collect) | 226 (225 passing) | +123 | Suite un-broken *and* grown — §10 |
| i18n locales | `en`, `es` | `en`, `es` | — | Still **no `nl`** |

**i18n (`src/i18n/locales/`):** `en.json` = 4,360 leaf keys, `es.json` = 4,352 (own counting method; the 8-key delta is the point). The **8 missing `es` keys are all `subscription.*`** — `title, subtitle, upgrade, upgradeDesc, cardEnding, expires, noActiveSubscription, contactSupport` — member-facing billing copy, unchanged since June (**STILL OPEN**). No `nl` locale (**STILL OPEN**).

**New DB surface since June** (from the 3 new migrations): `pricing_plans` + `pricing_settings` (single source of truth for pricing, public-read/admin-write RLS — `20260617120000_pricing_source.sql:28-41`); a `bootstrap_first_admin` mechanism (addresses June's "no staff bootstrap" — verify against live before relying on it).

---

## 2. ROUTES (dimension 2)

`src/App.tsx` declares **116 `<Route>` elements** (~108 navigable across 8 portals + redirects + catch-all). Full walk below; per-element BROKEN/no-op detail is in §3.

**Structural changes vs June:**
- ✅ **`/admin/orders/:id` now exists** (`App.tsx:373` → `OrderDetailPage`, real detail page reading the order by id — `OrderDetailPage.tsx:30-36`). June BROKEN #1 **FIXED**.
- ✅ **`/pricing`** is a new public route (`App.tsx:337` → `PricingPage`).
- ✅ **`/pendant`** now `<Navigate to="/products/pendant" replace>` (`App.tsx:340`) — June orphan resolved (redirect, not dead).
- `/register` → `/join` redirect (`App.tsx:352`); `/pendant`, `/register` are redirects, not pages.

**ORPHANS (route defined, reachable only by typing the URL — no nav/link anywhere in `src/`):**

| Route | Element | Evidence | Status vs June |
|---|---|---|---|
| `/admin/blog` | `BlogManagerPage` | 0 linkers in `src` (not in `AdminSidebar.tsx`, static 32-item nav) | **NEW / not flagged in June** |
| `/admin/audit-log` | `AuditLogPage` | 0 linkers | **NEW** |
| `/admin/sla` | `SLADashboardPage` | 0 linkers | **NEW** |
| `/admin/feedback` | `FeedbackDashboardPage` | 0 linkers | **NEW** |

These four admin pages are fully built and working (June marked them WORKING) but **unreachable from the admin sidebar or any other nav** — only via direct URL. June's orphan list did not include them.

**Formerly-orphan, now FIXED:** call-centre `shift-history` and `preferences` are now linked from `CallCentreHeader.tsx:315,324` (June orphans). `/pendant` resolved (redirect).

**Reachable-but-not-in-main-sidebar (not true orphans):** `/admin/notifications` (via `NotificationBell.tsx`), `/admin/crm-import` + `/admin/crm-contacts` (via `member-detail/CRMTab.tsx` + `GlobalSearch.tsx`). `/call-centre/sos-alert`, `/*/members/:id`, `/*/:id` detail routes are drill-down targets (intentionally not in nav).

---

## 3. DEAD INTERACTIONS (dimension 3)

### 3.1 Verification of the 13 June items

| # | Portal | Element / location | Verdict |
|---|---|---|---|
| 1 | admin | Orders drill-down `/admin/orders/:id` | **FIXED** — real page (`OrderDetailPage.tsx:30-36`); rows navigate (`OrdersPage.tsx:173,205-207`) |
| 2 | call-centre | TasksPage member links → `/admin/members/:id` | **STILL OPEN** — `call-centre/TasksPage.tsx` is a 4-line re-export of `admin/TasksPage`, inheriting `/admin/...` links verbatim |
| 3 | call-centre | **"Call Emergency" button** | **STILL OPEN** — no `onClick` (`CallCentreDashboard.tsx:242-245`). ⚠️ life-safety dead button |
| 4 | admin | Messages Call / SMS buttons | **FIXED** — `tel:`/`sms:` handlers with phone guards (`MessagesPage.tsx:962-965,975-978`) |
| 5 | admin | Payments invoice no-op + search | **FIXED** — search applied via `ilike` (`PaymentsPage.tsx:65-67`), export real (`:114-139`); invoice cell is display text, not a button |
| 6 | partner | Support 3 dead `href="#"` | **FIXED** — now disabled "(coming soon)" cards (`PartnerSupportPage.tsx:39,44,49,150-164`); contact methods real `mailto:`/`tel:`/`wa.me` |
| 7 | admin | Partner "Generate Invoice" no-op | **FIXED (honest placeholder)** — now `disabled title="Coming soon"` (`PartnerDetailPage.tsx:397-401`) |
| 8 | admin | Audit-log CSV exports only current page | **FIXED** — re-runs query without `.range()`, all filters applied (`AuditLogPage.tsx:181-239`) |
| 9 | admin | Reports "Export PDF" stub | **STILL OPEN** — `onClick={() => toast.info("PDF export coming soon")}` (`ReportsPage.tsx:87-92`); CSV export is real |
| 10 | admin | Blog "Tags" never persisted | **STILL OPEN** — field bound to `editor.tags` but `tags` absent from `BlogPostFormData`/create/update (`useBlogEditor.ts:24-35,95-149`); reset on edit (`BlogManagerPage.tsx:133`) |
| 11 | client | Subscription upgrade/payment/invoice | **STILL OPEN (×3)** — all `toast.info(...)` placeholders (`SubscriptionPage.tsx:178,222,281`) |
| 12 | client | **ClientLayout SOS/emergency button** | **STILL OPEN** — no `onClick` (`ClientLayout.tsx:347-356`); label still ICE-branded `dashboard.contactIceAlarm` (:355). ⚠️ life-safety dead button |
| 13 | partner | Settings preferences mutation + region | **SPLIT** — Region: **STILL OPEN**, renders raw `{region.labelKey}` not `{t(...)}` (`PartnerSettingsPage.tsx:448`). Preferences: **PARTIAL** — `onSubmit` fires `updatePayoutMutation` (`:769`) which persists language but also rewrites payout IBAN and shows misleading "Payout settings updated" toast (`:196-205`) |

**June-item score:** 6 FIXED (#1,#4,#5,#6,#7,#8) · 7 STILL OPEN (#2,#3,#9,#10,#11,#12,#13-region) · 1 PARTIAL (#13-mutation).

### 3.2 New dead / no-op interactions

| Portal | File:line | Element | Why dead |
|---|---|---|---|
| admin | `member-detail/MessagesTab.tsx:537` | "SMS" button | `toast.info("SMS integration coming soon")` |
| admin | `member-detail/MessagesTab.tsx:541` | "WhatsApp" button | `toast.info("WhatsApp integration coming soon")` |
| admin | `member-detail/MessagesTab.tsx:545` | "Email" button | `toast.info("Email integration coming soon")` |
| admin | `member-detail/MessagesTab.tsx:549` | "Log Call" button | `toast.info("Call logging coming soon")` |
| call-centre | `CallCentreDashboard.tsx:175-177` | Filter icon button | no `onClick` — decorative |
| client | `ClientLayout.tsx:443-449` | Header search `<Input>` | no `value`/`onChange`/form — typing does nothing |

**Excluded (not dead):** `PartnerDetailPage.tsx:390-391` `querySelector(...).click()` is a working (brittle) tab-switch; `useGdprExport.ts:101` "contact support" is a genuine error toast; "Coming Soon" strings in product/landing pages are content labels/image placeholders. No `href="#"` or `onClick={() => {}}` anti-patterns remain in `src/`.

⚠️ **Highest priority:** #3 and #12 are **emergency/SOS buttons that do nothing on click** on a live PERS service. Real emergency paths exist elsewhere (tel:/WhatsApp, and the pendant hardware path), but these dead UI buttons must be wired or removed before member-facing launch.

---

## 4. AI SURFACE MAP (dimension 4)

*Completeness target for the feature-flag project. Every AI-touching artifact below.*

### 4.1 Edge functions that POST to the Lovable AI gateway (`ai.gateway.lovable.dev`) — 11 functions, 13 call sites

| Function | Purpose | Gateway POST (file:line) | `LOVABLE_API_KEY` (file:line) | Gated? |
|---|---|---|---|---|
| `ai-run` | Core Isabella runner (chat/voice/event) | `987`, `1168`, `1440` | `801` | chat **YES**; event **YES**; **voice NO** (implicit) |
| `generate-ai-image` | AI image gen | `318` | `279` | **NO** |
| `media-draft` | Social/media draft copy | `411` | `307` | **NO** |
| `generate-slot-content` | Scheduled-slot content | `121` | `19` | **NO** |
| `repurpose-content` | Repurpose content (2 calls) | `40`, `106` | `12` | **NO** |
| `facebook-publish` | FB publish + AI intro | `45` | `31` | **NO** |
| `outreach-topic-insights` | B2B topic insights | `47` | `12` | **NO** |
| `outreach-enrich-lead` | Enrich outreach lead | `97` | `17` | **NO** |
| `outreach-generate-drafts` | Outreach email drafts | `162` | `14` | **NO** |
| `outreach-followup-runner` | Follow-up copy | `64` | `14` | **NO** |
| `rate-outreach-leads` | AI lead scoring | `162` | `48` | **NO** |

**False positive:** `auth-email-hook` reads `LOVABLE_API_KEY` (`:92,133`) as a **webhook/bearer secret**, not for AI — it never POSTs to the gateway. Exclude from the AI target list.

### 4.2 AI-orchestration / AI-adjacent functions (no gateway call of their own)

`ai-dispatch-events` (maps events→agents, calls `ai-run` at `108,206`), `ai-execute-action` (executes approved `ai_actions`, switch at `79`), `voice-handler` (Twilio inbound TwiML → `ai-run source:voice_call` at `606`), `twilio-voice` (wrapper), `isabella-voice-handler` (SOS-conference TwiML + assessment notes), `isabella-assessment-log` (writes `isabella_assessment_notes`), `outreach-pipeline-runner` (orchestrates outreach fns). **Non-generative but UI-grouped with AI:** `generate-content-plan`, `generate-courtesy-calls` (deterministic scheduling, no LLM).

### 4.3 Frontend hooks → AI functions

`useAIChat.ts:291`→`ai-run`; `useAIAgents.ts:381,410`→`ai-run`/`ai-execute-action`; `useAIAgentHealth.ts:49`→`ai-run`; `useMediaDraft.ts:51`→`media-draft`; `useScheduledContent.ts:74`→`generate-slot-content`; `useAIImageGenerator.ts:70`→`generate-ai-image`; `useOutreachPipeline.ts:53,70`→`outreach-enrich-lead`/`outreach-generate-drafts`; `useLeadTopicInsights.ts:21`→`outreach-topic-insights`; `useOutreachRawLeads.ts:235`→`rate-outreach-leads`; `useIsabellaSettings.ts` (reads/writes the 50 toggles).

### 4.4 Frontend components / pages / libs

- **Chat widgets:** `components/chat/AIChatWidget.tsx` + per-portal entry buttons (`HeaderChatButton`, `AdminHeaderChatButton`, `StaffHeaderChatButton`, `MemberChatButton`).
- **AI admin UI:** `admin/media/RepurposeDialog.tsx:43`→`repurpose-content`; `admin/media/strategy/ContentPlanner.tsx:82`→`generate-content-plan`; `admin/outreach/OutreachControlPanel.tsx:55`→`rate-outreach-leads`; `admin/dashboard/AISalesDesk.tsx`, `IsabellaStatusBanner.tsx`; `admin/ai/DeadSwitch.tsx` (kill control), `BehaviorDetailPanel.tsx`, `AIAvatarUpload.tsx`.
- **SOS console (shows Isabella live assessment/takeover):** `call-centre/sos/SOSIsabellaFeed.tsx`, `SOSTakeoverScreen.tsx`, `SOSSituationPanel.tsx`, `SOSTimeline.tsx`, `SOSParticipantStrip.tsx`, `SOSCallControls.tsx`, `SOSAlertBar.tsx`.
- **Pages:** `admin/IsabellaOperationsPage.tsx` (50-function registry + toggles), `admin/AIBehaviorsPage.tsx`, `admin/AdminDashboard.tsx`, `call-centre/SOSAlertPage.tsx`; marketing refs in `LandingPage.tsx`, `HowItWorksPage.tsx`, `partner/PartnerOnboarding.tsx`.
- **Libs:** `src/lib/isabella-function-config.ts` (canonical trigger map, mirrored in `isabella-gate.ts`), `src/hooks/useIsabellaSettings.ts`.

### 4.5 DB tables storing AI state (`src/integrations/supabase/types.ts`)

`ai_actions` (:125), `ai_agent_configs` (:172), `ai_agents` (:225), `ai_events` (:264), `ai_memory` (:297), `ai_runs` (:341), `isabella_settings` (:1980 — **now read by the gate**), `isabella_assessment_notes` (:1945); media set: `media_content_calendar/audiences/goals/image_styles/publishing_history/schedule_settings/topic_goals/topics`; outreach set: `outreach_campaigns/crm_leads/daily_usage/email_drafts/email_threads/queued_tasks/raw_leads/run_logs/settings/suppression`; `leads` (:2028), `video_outreach_links` (:6044).

### 4.6 Admin nav → AI pages (`AdminSidebar.tsx`)

`aiBehaviors`→`/admin/ai` (:151); `isabellaOperations`→`/admin/ai/operations` (:152); `aiOutreach`→`/admin/ai-outreach` (:125); `mediaManager`→`/admin/media-manager` (:124).

---

## 5. ISABELLA GATE STATUS (dimension 5)

**`supabase/functions/_shared/isabella-gate.ts` EXISTS** (233 lines, verified in full). Design:
- **Never-gated, no DB read** — safety-critical set (`sos_button_triage`, `fall_detection_triage`, `emergency_escalation_alert`, `bulk_offline_alert`, `device_offline_response`, `inactivity_check`, `inbound_phone_calls` — `:42-50`) and legal set (`gdpr_deletion_request`, `gdpr_export_request` — `:53-56`) are decided in code **before** any DB access (`:195-200`). They can never be suppressed.
- **Discretionary** → consults `isabella_settings.enabled` via `maybeSingle()` (`:204-208`): `true`→allow, explicit `false`→block, **no row→block** (default-off/opt-in, `:218-219`), **lookup error/throw→ALLOW + log** (fail-open on infra error, `:210-215,225-231`).
- Also `isActionNeverGated` (escalate/request_human always run — `:169-171`) and `functionKeyForTrigger` (~70-entry trigger→function map, `:79-145`).

**Imported AND enforced by all three execution paths:**

| Path | Import | Enforcement call sites (blocks on `!allowed`) |
|---|---|---|
| `ai-run` | `:4` | chat-widget gate `:857-875` (before POST `:987`); event gate `:1274-1300` (before POST `:1440`) |
| `ai-execute-action` | `:4` | `:50-73` — sets `ai_actions.status="skipped"` before the action `switch` (`:79`) |
| `ai-dispatch-events` | `:4` | `:84-99` (single dispatch) **and** `:160-174` (batch loop) — the immediate path June flagged as ungated is now gated |

### 5.1 Paths that reach the gateway WITHOUT the gate

1. **`ai-run` voice-call path** (`:1041-1216`, POST `:1168`) — no `isIsabellaFunctionAllowed` call. Mitigated because voice maps to `inbound_phone_calls`, which is never-gated by design — but this is **structural omission, not an explicit decision** (latent gap if the voice source is reused for a discretionary function).
2. **All 10 media/outreach generative call sites** (§4.1 rows marked NO) — `generate-ai-image`, `media-draft`, `generate-slot-content`, `repurpose-content` (×2), `facebook-publish`, `outreach-topic-insights`, `outreach-enrich-lead`, `outreach-generate-drafts`, `outreach-followup-runner`, `rate-outreach-leads`. **None import the gate.** An Isabella "pause" does not stop them. **This is the concrete feature-flag target list.**

### 5.2 Reconciliation vs `CRITICAL_VERIFICATION_2026-06.md`

| June claim | Verdict | Evidence |
|---|---|---|
| No `_shared/isabella-gate.ts` | **FIXED** | file exists, 233 lines |
| No edge function reads `isabella_settings` | **FIXED** | `isabella-gate.ts:205`; invoked by 3 paths |
| No shared server-side gate | **FIXED** | imported `ai-run:4`, `ai-execute-action:4`, `ai-dispatch-events:4` |
| 50 admin toggles unenforced at execution | **PARTIALLY FIXED** | enforced for chat/event/action; **still open** for voice POST (implicit) + 10 media/outreach call sites |
| `ai_agents.enabled` bypassed for chat_widget/voice_call | **STILL OPEN (unchanged), now supplemented** | `ai-run:841` still skips `agent.enabled` for chat/voice; chat now has a *separate* `isabella_settings` gate at `:857`; voice does not |

---

## 6. SAFETY PIPELINE (dimension 6) — **CONFIRMED AI-INDEPENDENT**

End-to-end trace; no function in the path imports/calls `ai-run`, `ai-dispatch-events`, `ai-execute-action`, the Lovable gateway, `LOVABLE_API_KEY`, or the Isabella gate.

- **Hop 1 — `gps-gateway/`** (Node TCP, port 5001): frames GT06 packets (`src/server.js:35-69`), parses type/alarm (`src/gt06-parser.js:112-121,157`), forwards alarm→`ev07b-sos-alert` (`server.js:201-209`) and login/heartbeat/location→`ev07b-checkin` (`:139,158-162,179-184`); targets `forwarder.js:57,79`, HMAC-signed (`:27-35`). **Zero third-party deps, zero AI refs.**
- **Hop 2 — `ev07b-checkin`**: auth (`index.ts:68`), device lookup by IMEI (`:101-105`), telemetry update (`:131-161`); can create alerts for sos/fall/geofence/low-battery via `createAlertIfNew` → `alerts` insert (`:202-214`) → fans out to `emergency-contact-notify` (`:222`), `partner-alert-notify` (`:236`), `notify-admin` (`:260`). Imports only `_shared/ev07b-auth.ts`, `_shared/cors.ts`.
- **Hop 3 — `ev07b-sos-alert`**: auth (`:63-78`), alarm→type map (`:15-20`), device guard (`:103-130`), 5-min dedup (`:132-154`), **`alerts` insert** (`:168-181`), then `emergency-contact-notify` first (`:196-208`), `partner-alert-notify` (`:214-225`), `notify-admin` (`:243-266`). Imports only `cors.ts` + `ev07b-auth.ts`.
- **Hop 4 — `ev07b-offline-monitor`** (device offline→alert→notify) & **`ev07b-stock-sync`** (inventory). Both AI-free.
- **Hop 5 — escalation** (NEW since June): `sos-escalation-runner` (cron, 5 timed levels `:24-40`): L1 browser (:147-156), L2 on-shift staff via `shift_escalation_chain` (:167-172), L3 supervisors, L4 admins, L5 emergency contacts (:301-322); Twilio calls via `placeEscalationCall` (:53-67) with TwiML from `sos-escalation-mobile`. All notification fns (`emergency-contact-notify`, `partner-alert-notify`, `notify-admin`) are provider-based (Twilio/Resend), AI-free.

**Only false-positive grep hits:** `isabella_assessment_notes` **table name** in `sos-alert-resolve.ts:12,130-131` (plain `.insert()`, no AI call) and `*.lovable.app` CORS regex in `_shared/cors.ts:10-11` (dev-preview host allowlist, not the AI gateway). **Verdict: CONFIRMED.** An Isabella/gateway outage or kill-switch has **no effect** on SOS ingestion, alert creation, notification, or escalation. Notably, `isabella-gate.ts:16-18` documents this rule explicitly ("must never be imported there").

---

## 7. SECURITY (dimension 7)

### 7.1 RLS coverage
~110 `CREATE TABLE` statements; **every one has a matching `ENABLE ROW LEVEL SECURITY`** — no sensitive table lacks RLS in the migration source of truth. Life-safety/PII/financial tables all covered (`20260121143325_*.sql:311-321`, etc.). *(UNVERIFIED at runtime — confirms source, not the live `cfwnrcogikjycjcobsay` DB, and "enabled" ≠ "correct" — see next.)*

### 7.2 🔴 `system_settings` secrets readable by ALL staff — **CRITICAL, NEW**
`system_settings` holds Stripe/Mollie/Twilio/Facebook secrets in plaintext (keys confirmed at `stripe-webhook/index.ts:24,49`, `mollie-webhook/index.ts:56`, `create-checkout/index.ts:53`). RLS SELECT policies OR-combine, and one grants read to **any active staff**:
- `20260203185605_*.sql:34-39` — `"Staff can view all settings" FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))`
- `is_staff()` = any active staff row, **any role** (`20260121143325_*.sql:280`).

**Impact:** any call-centre agent can `SELECT settings_stripe_secret_key, settings_mollie_api_key, Twilio tokens` in plaintext. Write is correctly super-admin-only (`:42-48`); **read is over-broad.** CLAUDE.md §4's "locked to service-role" is **false**. Tighten the SELECT policy to super_admin/service-role. **June "RLS unconfirmed" → STILL OPEN, worse than assumed.**

### 7.3 🔴 `verify_jwt=false` high-risk functions

| Function | In-code auth | file:line | Verdict |
|---|---|---|---|
| `save-api-keys` | JWT → `getClaims` → super_admin + active check before service-role write | `:13-51,57-76` | **SECURED** |
| `stripe-webhook` | Stripe signature `constructEvent` vs `settings_stripe_webhook_secret`; rejects missing sig | `:35-72` | **SECURED** |
| `mollie-webhook` | No sig (Mollie sends only id); re-fetches payment from Mollie API | `:70-76` | WEAK (Mollie-standard; relies on idempotency) |
| `ev07b-checkin` / `ev07b-sos-alert` | HMAC `x-ev07b-signature` OR legacy `x-api-key`==`EV07B_CHECKIN_KEY` | `checkin:53-83`, `sos:48-71` | SECURED — but `enforceHmacOnly` defaults **false** (`checkin:58`, `sos:53`), static key still accepted |
| `create-checkout` | No user auth; rate-limit only; **client-supplied amounts** | `:35-41,78-87` | WEAK |
| `submit-registration` | No auth (public join); rate-limit 5/min + schema | `:205` | WEAK-by-design |
| **`ai-run`** | **NONE** (service-role internally; only outbound auth) | `:987,1168,1440` | **UNPROTECTED** |
| **`ai-execute-action`** | **NONE** (parses `{actionId}`, acts service-role) | `:8-34,104` | **UNPROTECTED** |
| **`ai-dispatch-events`** | **NONE** (parses body, acts service-role) | `:48-60,112,210` | **UNPROTECTED** |

🔴 **The AI trio is publicly callable with no authentication.** Anyone with the URL can trigger AI runs, inject fabricated business events (`ai-dispatch-events:9-46` maps `sale.created`, `alert.created`, `member.support_request`, …), and execute already-approved actions by id (`ai-execute-action:38`). This **is the load-bearing blocker for the feature-flag project** — the Isabella gate is enforced, but the endpoints in front of it are open. **June "in-function auth everywhere" → STILL OPEN / partial regression.**

### 7.4 `dangerouslySetInnerHTML` (24 sites)
- 🟡 **Unsanitized, data-driven:** `client/SupportPage.tsx:818` and `call-centre/DocumentsPage.tsx:169` render `documentation.content` with no DOMPurify. Blast radius bounded (documentation write RLS = admin/super_admin only, `20260203084425_*.sql:49-52`), so admin-authored stored HTML → lower severity, but a shared sanitizer (`@/lib/sanitize`) exists and simply isn't used here. **STILL OPEN.**
- ✅ **Properly sanitized:** `admin/outreach/OutreachInboxTab.tsx:151-158` (inbound email HTML, highest risk — DOMPurify with FORBID script/iframe/on*), `admin/settings/EmailTemplatesTab.tsx:267-273`.
- Low/no risk: i18n `t()` output (Terms/Privacy/agreement pages), `BlogPostPage.tsx:43` JSON-LD, `ui/chart.tsx:70` theme CSS.

### 7.5 Secrets in code — ✅ CLEAN
Grep for `sk_live/sk_test/pk_live/AIza/AC[0-9a-f]{32}/live_/test_/eyJ…` → only UI **placeholder** strings (`SettingsPage.tsx:881,884,895,910`). Zero JWTs, zero real keys. Secrets come from `Deno.env` or `system_settings`. **June clean → still clean.**

### 7.6 🟡 `_shared/rate-limit.ts` is in-memory / per-instance
Sliding window resets on every cold start and isn't shared across instances (`rate-limit.ts:5`) — best-effort speed bump only. Coverage: `submit-registration:205` (5/60s), `save-registration-draft:18` (20/15m), `create-checkout:35` / `create-mollie-checkout:57` (10/60s), `send-email:88` (10/60s), `twilio-call-me` (own). **No limiter (nor auth):** the `ai-*` trio, `outreach-send-email`, `partner-register`/`staff-register`, `submit-member-update`.

### 7.7 🟡 32 functions absent from `config.toml` — deployment risk, UNVERIFIED
Only 59 of 91 function dirs are in `config.toml`. Supabase defaults **absent** functions to `verify_jwt=true`. Among the 32 absent are **public webhooks that must be reachable unauthenticated**: `sos-inbound-router` (Twilio TwiML, form-data — `serve` at `:36`, no visible bearer), `sos-escalation-mobile` (Twilio TwiML for SOS press-1-to-join), `track-referral-click` (public). If these were deployed with the default `verify_jwt=true`, inbound Twilio/tracking calls would be rejected before reaching the handler — **breaking the SOS voice-escalation join and referral tracking.** `video-render-webhook` self-guards via `WEBHOOK_SECRET` (`:5,16`) and `twilio-outbound` checks `Authorization` (`:13`), so those are internally fine. **UNVERIFIED** from the repo whether the absent functions are deployed with an explicit `--no-verify-jwt` flag — **must be confirmed against the live project before launch** (it is safety-relevant for `sos-*`).

### 7.8 Reconciliation vs `AUDIT_REPORT_2026-06.md` §5
| June claim | Verdict |
|---|---|
| No hardcoded secrets | **FIXED / still clean** |
| Stripe/Mollie keys in `system_settings`, RLS unconfirmed | **STILL OPEN — worse (readable by all staff)** |
| All fns `verify_jwt=false` with in-function auth | **STILL OPEN — AI trio has no auth** |
| `documentation.content` via `dangerouslySetInnerHTML` | **STILL OPEN (2 unsanitized sinks)** |

---

## 8. MONEY PATHS (dimension 8)

### 8.1 Checkout
- **Stripe `create-checkout`:** key from `system_settings` (`:50-54`), validated (`:72-73`), rate-limited (`:35`), session created with **`mode:"payment"`** (`:93`) — **one-time, no `recurring`**. Only stamps the existing `payments` row (`:117-123`).
- **Mollie `create-mollie-checkout`:** creates a customer (`:103-109`), writes `mollie_customer_id` (`:113-116`), first payment `sequenceType:"first"` to establish a recurring **mandate** (`:122-144`). **No input schema validation** (`:93` raw `req.json()`) — hardening gap vs Stripe.

### 8.2 Webhooks
- **`stripe-webhook`:** signature verified (`:46-72`), idempotent via `webhook_events` (`:77-96`), handles `checkout.session.completed`/`payment_intent.*`/`customer.subscription.*`/`invoice.*`. **But** `stripe_subscription_id` is only set `if (session.subscription)` (`:108`) — always null for one-time checkout — so the `customer.subscription.*` and `invoice.*` branches are **effectively dead in practice**.
- **`mollie-webhook`:** no sig (re-fetches from Mollie — standard, `:112`), idempotent on payment id (`:89-109`); first payment → creates real recurring **subscription** + `mollie_subscription_id` (`:139-165`); recurring → inserts `payments` (`:200-225`). Sub-creation failure is swallowed (`:182-185`) → mandate can exist without `mollie_subscription_id` (reconciliation gap).

### 8.3 🔴 Subscription lifecycle
- **Admin `SubscriptionsPage.tsx` — FIXED (but inert):** pause/resume/cancel now call `admin-subscription-action` (`:117-125`), which uses `_shared/billing.ts` — **Stripe-first, DB only after Stripe succeeds** (`billing.ts:113-142`), with "RECONCILE MANUALLY" on post-Stripe DB failure (`:134-140`); unit-tested (`src/test/billingActions.test.ts`). **June finding (a) FIXED for this path.** But: no `stripe_subscription_id` ever exists (§8.1) → returns **422** for Stripe members (`billing.ts:104-110`); and it **refuses Mollie with 501** (`billing.ts:96-102`). So in practice this admin control does nothing for either gateway.
- 🔴 **Second cancel path still DB-first:** `member-detail/SubscriptionTab.tsx:71-101` calls `cancel-mollie-subscription` only if a Mollie id exists, **ignores Stripe** (`:86`), and **always writes `subscriptions.update({status})`** (`:89-92`) — even when the Mollie cancel fails ("DB updated locally", `:83`). DB can say `cancelled` while the provider keeps charging. **The exact June-class risk, surviving in a second location.**
- **Asymmetry:** `SubscriptionsPage` covers Stripe / refuses Mollie; `SubscriptionTab` covers Mollie / ignores Stripe. There is a working `cancel-mollie-subscription` (`:77-97`) but **no `cancel-stripe-subscription`**.
- **Client portal `SubscriptionPage.tsx`:** upgrade/payment/invoice all `toast.info` (`:178,222,281`); no cancel control. **STILL OPEN** (feature gap, no mismatch).

### 8.4 Commissions / payouts — STILL OPEN (DB-only)
`process-commissions` only flips status approved/cancelled (`:52-168`) — **no payout call**. `CommissionsPage.tsx:150-153` "Mark Paid" and `PartnerDetailPage.tsx:304-307` are DB-only. Marking "paid" moves **no money** (may be intentional out-of-band bank transfer — Lee to confirm).

### 8.5 Refunds
No refund edge function and **no `stripe.refunds`/Mollie refund call anywhere**. `refunded` status is *read* (`process-commissions:94-106`, `PaymentsPage.tsx` badges) but **no app code writes it** — UNVERIFIED whether any admin action sets it out-of-band.

### 8.6 Money risk table (ranked)
| # | Flow | Evidence | Verdict | Severity |
|---|---|---|---|---|
| 1 | Stripe one-time checkout → no recurring subscription → admin Stripe pause/cancel always 422; **no recurring Stripe revenue** | `create-checkout:93`; `stripe-webhook:108`; `billing.ts:104-110` | DB/PROVIDER MISMATCH | **CRITICAL** |
| 2 | Second cancel path DB-first, ignores Stripe, writes DB even on Mollie failure | `SubscriptionTab.tsx:83,86,89-92` | DB-ONLY | **HIGH** |
| 3 | `SubscriptionsPage` refuses Mollie (501); Mollie subs can't be cancelled there | `billing.ts:96-102`; `cancel-mollie-subscription:77-97` | ASYMMETRY | **HIGH** |
| 4 | Commission "Mark Paid"/"Process Pending" move no money | `CommissionsPage.tsx:150-153`; `process-commissions:132-168` | DB-ONLY | MEDIUM (maybe intended) |
| 5 | Member upgrade/payment/invoice = "contact support"; no cancel | `SubscriptionPage.tsx:178,222,281` | Feature gap | MEDIUM |
| 6 | Partner "Generate Invoice" no-op (disabled) | `PartnerDetailPage.tsx:397-401` | No-op | LOW |
| 7 | `refunded` consumed but never written; no provider refund path | `process-commissions:94-106` | UNVERIFIED | LOW |
| 8 | `create-mollie-checkout` lacks input validation (Stripe has it) | `create-mollie-checkout:93` | Hardening | LOW |

**June reconciliation:** (a) admin sub lifecycle DB-only → **FIXED for SubscriptionsPage**, partial-regression via SubscriptionTab; (b) commission payouts → **STILL OPEN**; (c) member self-service → **STILL OPEN**; (d) Generate Invoice → **STILL OPEN** (now honestly disabled).

---

## 9. BRANDING LEFTOVERS (dimension 9)

### 9.1 MEMBER/SEO-facing — must fix (STILL OPEN)
| Item | Location |
|---|---|
| `ai-run` prompt "ICE ALARM SERVICE KNOWLEDGE" | `ai-run/index.ts:54` |
| Coral `#E74C3C` in 6 email templates | `_shared/email-templates/{invite:79,81; magic-link:72; reauthentication:66; email-change:87,89; signup:86,88; recovery:73}.tsx` |
| Coral `#E74C3C` branded-image gen | `useBrandedImageGenerator.ts:20` |
| Coral `#E74C3C` onboarding tour | `OnboardingTour.tsx:335,441,455` |
| Coral glow HSL `4 78% 57%` | `tailwind.config.ts:131,132` |
| `vercel.json` sitemap `YOUR_SUPABASE_PROJECT_REF` | `vercel.json:5` |
| Email logo placeholder `YOUR_SUPABASE_PROJECT_REF` (×6) | `email-templates/{invite:35,magic-link:32,email-change:37,signup:37,reauthentication:27,recovery:32}.tsx` |
| render-worker "ICE Alarm España" / `IceAlarmVideo` / `#E63946` | `render-worker/src/remotion/index.ts:2,10,11,17,22`, `IceAlarmVideo.tsx:12,24`, `src/index.ts:87,108` |
| render-worker Docker image `ice-video-render-worker` | `render-worker/README.md:32,44,151` |

**NEW member-facing leftovers not in CLAUDE.md §11:**
- **`icehealthsync.com` email sender domain** — `auth-email-hook/index.ts:39-41` (`SENDER_DOMAIN="notify.icehealthsync.com"`, `ROOT/FROM_DOMAIN="icehealthsync.com"`). This is the **From address on all auth emails** — member-facing.
- **"Complete Your ICE Alarm Registration"** mailto subject — `LeadsPage.tsx:1112`.

### 9.2 FIXED since June
- ✅ `public/robots.txt` — now `Sitemap: https://care-conneqt-platform.vercel.app/sitemap.xml` (was `icealarm.es`). CLAUDE.md §11 stale.
- ✅ `index.html` preconnects — now reference live `cfwnrcogikjycjcobsay.supabase.co` (`:24-28`); hero preloads commented out with TODO (`:31-36`).

### 9.3 Documented continuity (intended — do NOT change without a §12 decision)
`ICE-` order prefix (`20260302120000_submit_registration_atomic.sql:261`); `X-ICE-*` headers (send: `send-email/index.ts:239,243,246,297` + `send-test-email`; inbound match: `email-inbound-webhook/index.ts:85-92` — rename as a pair); `iceAlarm*` localStorage/i18n keys (`App.tsx:294,302`; `en.json:1256,1267`/`es.json:1248,1259`; `DevicePage.tsx:182,248,260`; `ClientLayout.tsx:355`) — display text already says "Care Conneqt". `grep -i icealarm public/` = 0 hits.

---

## 10. TYPE GAPS & TESTS (dimension 10)

**`as any`:** 75 occurrences across 41 files in `src/`. Many benign (DOM/enum casts). **Supabase-schema-drift casts** cluster on tables missing from the generated `Database` type: **`shift_escalation_chain`** (`useEscalationChain.ts:18,42`), **`staff_invites`** (`useStaffInvites.ts:13,68`), **`notification_log`** (`useNotifications.ts:62,83,126,145`, `utils/notifications.ts:25`), **`notification_settings`** (`usePushNotifications.ts:33,66`), **`sms_command_log`** (`useDeviceSmsCommands.ts:147,167`), **`provisioning_checklist`** (`useDeviceProvisioning.ts:125,157,182`), plus `usePricing.ts:30,31`, `PricingPlansEditor.tsx:43`, `OrderDetailPage.tsx:38`. → **the checked-in Supabase types are out of sync with the deployed schema**; regenerate types post-cutover.

**Tests:** `npx vitest run` → **Test Files 1 failed | 19 passed (20); Tests 349 passed (349)**, 6.66s. The one failing *suite* is `src/test/crmEvents.test.ts` (`Error: supabaseUrl is required` — builds a real client instead of mocking; `client.ts:11`). Zero *tests* fail. **June "0 of ~238 run (nested duplicate repo)" → RESOLVED** (suite runs and grew to 349). CLAUDE.md §3/§7 (226/225) now stale.

**Typecheck:** no `typecheck` npm script (CLAUDE.md §7 correct); `npx tsc --noEmit` → **0 errors** (partly because the `as any` casts suppress the schema-drift errors). CI runs lint + `tsc --noEmit` + build + test on `main`/PRs (`.github/workflows/ci.yml`); note `npm run lint` historically reported ~400 problems (mostly `no-explicit-any` in `supabase/functions/**`) — CI lint status current-count **UNVERIFIED**.

---

## 11. DEPENDENCIES (dimension 11)

- **Root:** `npm audit` → **24 vulns (2 critical, 13 high, 8 moderate, 1 low)**. **Not all dev-toolchain** (contra June): **`protobufjs` (critical, prod** via `firebase@12.10.0`→grpc), **`@grpc/grpc-js` (high, prod)**, **`react-router-dom@6.30.1` (high, prod direct** — XSS/open-redirect), **`dompurify@3.3.1` (moderate, prod direct** — XSS). Dev-only: `vitest<3.2.6` (critical), rollup/vite/esbuild/ws/yaml/postcss/lodash/etc. **REGRESSION vs June's "all dev/build toolchain"** — prioritize `react-router-dom` + `dompurify` (both user-facing XSS in a life-safety app) and the firebase→protobufjs chain.
- **`gps-gateway/`:** `dependencies: {}` (Node built-ins only) → **0 vulnerabilities**. Good posture for the safety bridge.
- **`render-worker/`:** no committed lockfile; generated resolution → **1 moderate** (`uuid<11.1.1`, `GHSA-w5hq-g745-h8pq`; fix is breaking `uuid@14`). Deep Remotion transitives may be under-counted.

---

## 12. Prioritised defect list

### 🔴 BROKEN / CRITICAL
1. **AI trio unauthenticated** — `ai-run`/`ai-execute-action`/`ai-dispatch-events` have no in-code auth (§7.3). Anyone can trigger AI, inject events, execute approved actions.
2. **`system_settings` live secrets readable by all staff** — RLS SELECT via `is_staff()` (§7.2). Stripe/Mollie/Twilio keys exposed to every call-centre login.
3. **No recurring Stripe billing** — one-time `mode:"payment"` checkout; admin Stripe pause/cancel always 422 (§8.6 #1).
4. **Second DB-first cancel path** (`SubscriptionTab.tsx`) writes `cancelled` even when the provider cancel fails (§8.6 #2).
5. **Dead SOS/emergency buttons** — call-centre "Call Emergency" (`CallCentreDashboard.tsx:242-245`) and client SOS (`ClientLayout.tsx:347-356`) have no `onClick` (§3). Life-safety UI.
6. **32 functions absent from `config.toml`** incl. `sos-inbound-router`/`sos-escalation-mobile` — if deployed with default `verify_jwt=true`, SOS voice-escalation join breaks (§7.7). **UNVERIFIED — confirm against live before launch.**

### 🟡 INCOMPLETE / RISK
7. **10 media/outreach AI functions ungated** (§5.1) — feature-flag target list; also unauthenticated (no `verify_jwt` entry / no in-code auth for most).
8. **AI voice-call path ungated by omission** (`ai-run:1168`) — mitigated by never-gated `inbound_phone_calls`, but make it explicit (§5.1).
9. **`SubscriptionsPage` refuses Mollie** (501) — Mollie subs uncancellable from the main admin page (§8.6 #3).
10. **Commission payouts DB-only** (§8.4); **member self-service billing** all "contact support" (§8.3); **Reports PDF**, **Blog Tags**, admin **MessagesTab** 4 buttons, partner **region labelKey** + preferences-mutation (§3).
11. **2 unsanitized `documentation` HTML sinks** (`SupportPage.tsx:818`, `DocumentsPage.tsx:169`) — sanitizer exists, unused (§7.4).
12. **Rate limiter in-memory only** (§7.6); AI trio + outreach-send-email + register paths unlimited.
13. **Supabase types out of sync with schema** — 6+ tables cast via `as any` (§10). Regenerate.
14. **Prod-runtime dependency vulns** — `react-router-dom`, `dompurify`, firebase→protobufjs (§11).
15. **4 admin orphan pages** — `blog`/`audit-log`/`sla`/`feedback` unreachable from nav (§2).
16. **`create-mollie-checkout` no input validation** (§8.2); **EV07B static `x-api-key` still accepted** (§7.3).

### 🔵 COSMETIC / DEBT
17. Member-facing ICE leftovers: `ai-run` prompt, coral `#E74C3C`/`#E63946`, `icehealthsync.com` sender, "ICE Alarm Registration" mailto, `vercel.json`/email-logo placeholders, render-worker branding (§9.1).
18. 8 missing `subscription.*` Spanish keys; no `nl` locale (§1). `crmEvents.test.ts` collection error (§10).
19. Call-centre `TasksPage` re-export sends staff to `/admin/...` links; brittle `querySelector().click()` in `PartnerDetailPage` (§3).

---

## 13. "Safe to build feature-flags on top" — VERDICT

✅ **YES, the architecture is safe to build on — with two blockers to clear first.**

**Why it's safe:**
- The gate (`_shared/isabella-gate.ts`) is a clean, dependency-free, unit-tested single source of truth, already enforced by the 3 core execution paths, with correct never-gated carve-outs for safety-critical + legal functions (§5).
- The **safety pipeline is provably AI-independent** (§6) and the gate is explicitly documented as forbidden there — so **no feature flag can ever disable or degrade the SOS/EV07B path.** This is the property that matters most for a life-safety service, and it holds.
- The trigger→function map and the 50-function admin registry already exist front and back; extending flags is additive, not a rewrite.

**Blockers that MUST be fixed BEFORE the feature-flag work starts:**
1. **🔴 Authenticate the AI trio (§7.3).** A per-function kill-switch is meaningless while `ai-run`/`ai-execute-action`/`ai-dispatch-events` accept anonymous calls. Add a shared-secret/service-role check (or `verify_jwt=true` where callers are internal) as the foundation the flags sit on.
2. **🟡 Bring the 10 media/outreach generative call sites under the same gate (§5.1).** They are the concrete target list; today an Isabella "pause" leaves them running. Wire each to `isIsabellaFunctionAllowed` (and give the voice-call path an explicit never-gated decision rather than relying on structural omission).

**Strongly recommended in the same change window (not strict blockers):** lock `system_settings` SELECT to super-admin (§7.2) and confirm the `config.toml` deployment posture for the `sos-*` webhooks (§7.7) — both are safety/secret-sensitive and cheap to verify.

**Not blockers for the flag work** (track separately): the money-path findings (§8), branding leftovers (§9), dependency vulns (§11), and the dead UI buttons (§3) — except the two dead **SOS buttons** (§12 #5), which should be fixed before any member-facing launch regardless of the flag project.

---

## 14. CLAUDE.md drift to reconcile (per LEARN.md task-end protocol)

- **§3 counts:** edge functions 89→**91** (59 in config.toml); pages 107→**109**; components→**292**; hooks→**93**; migrations 123→**126**; tests "226 (225 passing)"→**349 passing (1 suite collection error)**.
- **§4 secrets:** "`system_settings` … keep it locked to service-role" is **false** — SELECT is open to all staff (§7.2). Fix the claim and the policy.
- **§5 Isabella:** "treat the admin per-function switches as advisory until enforcement is added" — **enforcement IS now added** for the 3 core paths (§5); update to reflect the gate exists and the remaining ungated surface (voice POST + 10 media/outreach fns).
- **§7 tests:** the suite runs (349) — the "previously non-functional / nested duplicate repo" note is now historical.
- **§11 branding:** `robots.txt` is **FIXED** (no longer `icealarm.es`); add the two new member-facing leftovers (`icehealthsync.com` sender, "ICE Alarm Registration" mailto).

---

*End of AUDIT_FULL_2026-07.md. No files were modified during this audit. Runtime/live-DB claims are marked UNVERIFIED where the repo alone cannot confirm them (notably: live RLS on `cfwnrcogikjycjcobsay`, deployed `verify_jwt` flags for config-absent functions, and the production Isabella enabled-set).*
