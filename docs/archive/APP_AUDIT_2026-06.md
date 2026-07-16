# APP_AUDIT_2026-06.md — full route completeness + link/wiring audit

> READ-ONLY audit of every route in `src/pages/**` (router: `src/App.tsx`, 108 `<Route>`s).
> Date: **2026-06-16.** Method: 6 parallel read-only auditors, one per portal group.
> Status legend: **WORKING** (real impl) · **INCOMPLETE** (partial / stubbed sub-actions)
> · **STUB** (placeholder/static-by-design). "needs-backend" = correct but untestable
> until secrets + functions are live on `cfwnrcogikjycjcobsay`.
>
> Clean-start context: nearly all domain tables are **empty** on the new project, so list/
> dashboard pages render empty states. That is expected, not a defect — every page degrades
> gracefully; **no page substitutes mocked data** except two gated admin "template preview"
> modes (PartnerDashboard, ClientDashboard) and seeded tables (products ×3, testimonials ×4,
> documentation ×10+). `blog_posts` is **not** seeded → blog is empty until authored.

---

## Summary counts

- **Routes audited:** 108 across 8 portals (admin 47, partner 14, call-centre 13, client 9, auth 7, blog 2, join 1, staff 1, public/top-level 13 + 1 catch-all).
- **Status:** ~**95 WORKING**, **~9 INCOMPLETE**, **2 STUB-by-design** (`/unauthorized`, `*` 404).
- **BROKEN (must fix):** **8** dead routes/buttons/exports.
- **INCOMPLETE (stub actions / build needed):** **9**.
- **NEEDS-BACKEND:** payments, voice/SMS, AI, EV07B, social — all correct, awaiting cutover.
- **ORPHANS:** 3 (call-centre `shift-history`, `preferences`; public `/pendant`).
- **No fully-stub pages** — the app is substantially built; defects are edge actions and a few missing drill-downs.

---

## Admin portal — operational/core (21 routes)

| route | status | broken links | data wiring / notes |
|---|---|---|---|
| members | WORKING | — | `members` (+joins). Plan filter client-side (count mismatch). |
| members/new | INCOMPLETE | — | Wizard shell; real work in step sub-components. Stripe/Mollie/EV07B in steps. |
| members/:id | WORKING | — | `members`/`subscriptions`/`devices`; `fetchDevice` uses `.maybeSingle()` → breaks for couple plan (2 devices). |
| devices, devices/:id | WORKING | — | `devices` + realtime. devices/:id has Twilio SMS command panel (EV07B). |
| finance | WORKING | — | `payments`/`subscriptions`/`orders`/`partner_commissions`. €0 on clean start. |
| **orders** | **INCOMPLETE** | **`/admin/orders/:id` route does not exist** (OrdersPage.tsx:173, :207) | Row-click + "View Details" → dead. No OrderDetailPage. |
| subscriptions | WORKING (risk) | — | **pause/resume/cancel only flip DB status — no Stripe/Mollie call** (SubscriptionsPage.tsx:116-122). Billing-blind. |
| **payments** | WORKING | **invoice btn no-op (PaymentsPage.tsx:237); search box never applied** | `payments` read. CSV works. |
| alerts | WORKING | — | `alerts`/`tasks`/`members`. Life-safety table; follow-up insert lacks error toast. |
| staff, staff/:staffId | WORKING | — | `staff`; fns `staff-register`/`staff-send-invite` (email). `staff_invites` via `as any` (type gap). |
| **reports** | **INCOMPLETE** | — | **"Export PDF" stub** (toast "coming soon", ReportsPage.tsx:88). CSV real. |
| analytics | WORKING | — | `website_events` (first-party). |
| ev07b | WORKING | — | `alerts`/`devices`/`system_settings`. EV07B. |
| products | WORKING | — | `products` full CRUD (seeded). i18n editor includes `nl` (no nl locale yet). |
| settings | WORKING | — | `system_settings`; fns `save-api-keys`/`test-twilio`. Stripe/Mollie/Twilio/Maps/FB keys. |
| **messages** | **INCOMPLETE** | **"Call" + "SMS" buttons no onClick (MessagesPage.tsx:957-964)** | `conversations`/`messages` + realtime. Otherwise working inbox. |
| tasks | WORKING | — | `tasks`/`staff`/`members`, paginated. |
| tickets | WORKING | — | `internal_tickets`; gated on `currentStaffId` (admin w/o staff row → empty). |
| notifications | WORKING | — | `notifications`. |
| **leads** | WORKING | — | `leads` CRUD. **ICE leftover:** mailto subject "Complete Your ICE Alarm Registration" (LeadsPage.tsx:1112) — member-facing, §11 fix. |

## Admin portal — CRM/AI/marketing/ops (24 routes)

| route | status | broken links | data wiring / notes |
|---|---|---|---|
| partners | WORKING | — | `partners`/`partner_invites`/`partner_commissions`; fn `partner-admin-delete`. |
| partners/new | WORKING | — | fn `partner-admin-create` (email). |
| **partners/:id** | **INCOMPLETE** | **"Generate Invoice" no-op** (PartnerDetailPage.tsx:397-399); "Set Pricing" via fragile `querySelector().click()` | "Mark Paid" = DB status only. |
| partners-qa | WORKING | — | Diagnostic. RLS self-test only checks staff CAN read, never asserts partner DENIED (weak). |
| commissions | WORKING (risk) | — | **"Mark Paid"/"Process Pending" = DB status only, no Stripe/Mollie payout.** fn `process-commissions`. |
| crm-import | WORKING (risk) | — | **Non-transactional browser import; writes placeholder `sim_phone_number:'TBD'`, synthetic emails into real member/medical/contact records.** |
| crm-import/batches, crm-contacts, crm-contacts/:id | WORKING | — | `crm_*`. Lists capped 100; convert-to-member writes placeholder email. |
| ai | WORKING | — | `ai_*`/`isabella_settings`; fns `ai-run`/`ai-execute-action`. Toggle no-ops if `ai_agents` row absent. |
| ai/agents/:agentKey | WORKING | — | `ai_*` + storage avatars; `ai-run` simulator. |
| ai/operations | WORKING | — | `isabella_settings` toggles (the 52-function admin UI). |
| media-manager | WORKING | — | `social_posts`; fns `media-draft`/`generate-ai-image` (Gemini), `facebook-publish`. |
| ai-outreach | WORKING | — | 10 `outreach_*` tables; 5 outreach edge fns (Gemini + email). Empty on clean start. |
| video-hub | WORKING | — | `video_projects`; YouTube OAuth fns + `video-render-queue` (render-worker, **ICE-branded §11**). |
| communications | WORKING | — | Aggregation dashboard; `video-render-queue` retry. |
| **partner-pricing** | **INCOMPLETE** | — | **Default prices hardcoded** in bundle (DEFAULT_PRICING_TEMPLATES:30-46); UI saves only overrides. |
| blog | WORKING | — | `blog_posts` CRUD. **"Tags" field accepts input, never persisted** ("coming soon", :446-448). |
| audit-log | WORKING | — | **CSV export only exports current 25-row page, not full filtered set** (:181-217) — misleading audit trail. |
| sla | WORKING | — | `alerts`. **Alerts without `claimed_at` counted within-SLA** (:183-185) — inflates compliance. |
| feedback | WORKING | — | Reads `activity_logs` (entity=feedback); inert until a writer populates. No dedicated table. |
| testimonials | WORKING | — | `testimonials` CRUD (seeded). |
| rota | WORKING | — | `staff_*`/`ai_events` (Isabella event bus). `shift_escalation_chain` via `as any` (type gap). |
| holidays | WORKING | — | `staff_holidays*`/`ai_events`. Full approve/reject/cover. |

## Partner portal (14 routes)

| route | status | broken links | data wiring / notes |
|---|---|---|---|
| /partner | WORKING | — | Inserts `partners` (status pending); fn `notify-admin`. Typo "an Care Conneqt". |
| /partner/join | WORKING | — | fn `partner-register` (Gmail SMTP verify email). |
| /partner/verify | WORKING | — | fn `partner-verify` (token). |
| /partner/login | WORKING | — | auth + `partners.status` gate. |
| /partner/invite | WORKING | — | fns `partner-validate-invite`/`partner-complete-invite`. |
| /partner-dashboard (index) | WORKING | — | Live data; `MOCK_PARTNER/STATS` only in gated admin preview mode. |
| invites | WORKING | — | `partner_invites`/`partner_presentations`; fn `partner-send-invite` (**Twilio** SMS/WhatsApp + email). |
| marketing | WORKING | — | `partner_presentations` + Storage bucket. |
| commissions | WORKING | — | `partner_commissions` read-only ledger. |
| agreement | WORKING | — | `partner_agreements`; signing in blocking modal. |
| settings | WORKING | — | `partners` updates. **Bug:** preferences form fires `updatePayoutMutation` → wrong toast (:769); region shows raw `labelKey` (:449). |
| members | WORKING (gated) | — | Hooks; gated to care/residential types. |
| alerts | WORKING (gated) | — | Hook; gated residential + flag. fn `partner-alert-notify` (Resend + Twilio). |
| **support** | **INCOMPLETE** | **3 dead `href="#"`** (PartnerSupportPage.tsx:38,43,48 — Guide/Materials/FAQ) | Static page. |

**Orphans:** none (all 8 authed routes in sidebar; 5 public routes intentionally not).

## Call-centre portal (13 routes + index)

| route | status | broken links | data wiring / notes |
|---|---|---|---|
| / (index) StaffDashboard | WORKING | — | Staff landing. |
| alerts | WORKING | **"Call Emergency" button has no onClick** (CallCentreDashboard.tsx:242-245) | `useAlerts` (alerts + joins) + realtime; conversations count. Safety queue. |
| sos-alert | WORKING (safety-critical) | — | `useSOSTakeover`/`useSOSConference` + realtime; fns `sos-conference-join/leave`, `sos-alert-resolve` (all exist). **Twilio** browser voice. |
| members, members/:id | WORKING | — | members/:id reuses admin MemberDetailPage (context-aware). |
| shift-notes, shift-history | WORKING | — | `shift_notes`/`staff`. |
| preferences | WORKING | — | `staff`; notification prefs local-only (not persisted). |
| messages | WORKING | — | `conversations`/`messages` + realtime. |
| **tasks** | WORKING | **re-exports admin TasksPage → member links hardcode `/admin/members/:id`** (TasksPage.tsx:468,522) | Sends call-centre staff into admin portal. |
| tickets | WORKING | — | `internal_tickets` + realtime. |
| leads | WORKING | — | `leads` + realtime. |
| documents | WORKING | — | `documentation`; renders HTML via `dangerouslySetInnerHTML` (XSS surface). |
| holidays | WORKING | — | Self-service holiday flow. |

**Orphans:** `shift-history` (no nav link), `preferences` (no nav link). `sos-alert`/`members/:id` intentionally not in nav.

## Client (member) portal — `/dashboard/*` (9 routes)

| route | status | broken links | data wiring / notes |
|---|---|---|---|
| /dashboard (index) | WORKING | — | members/devices/subscriptions/contacts/alerts/conversations. MOCK_* only in gated admin preview. |
| profile | WORKING | — | `members` update; GDPR section. |
| medical | WORKING | — | `medical_information` CRUD. |
| contacts | WORKING | — | `emergency_contacts` CRUD (cap 3). |
| device | WORKING | — | `devices`/`subscriptions` + realtime (EV07B). Pendant price hardcoded €151.25/€14.99; upgrade = WhatsApp link. |
| **subscription** | **INCOMPLETE** | — | **Upgrade / update payment / download invoice all `toast.info("contact support")`** (:178,222,281). Stripe/Mollie not wired into member portal. |
| alerts | WORKING | — | `alerts` history. |
| support | WORKING | — | `conversations`/`messages`/`documentation`; **Isabella** `ai-run` (member_specialist). "Ask AI" uses brittle DOM `querySelector().click()`. |
| messages | WORKING | — | Two-way member↔staff. |

**Orphans:** none. **Flag:** `ClientLayout` SOS/emergency button has no onClick (life-safety UI; real paths are tel:/WhatsApp links) — confirm intentional. ICE-named i18n/localStorage keys present (documented continuity).

## Public / auth / blog / join / staff (24 routes)

| route | status | notes |
|---|---|---|
| / (LandingPage) | WORKING | products/testimonials/blog(empty)/AI agent. Footer "How It Works"/"Pricing" use bare `#` anchors (only work on `/`; header uses `/#pricing` — inconsistent). |
| how-it-works, terms, privacy | WORKING | i18n static. |
| products, products/:slug | WORKING | `products` (3 seeded). |
| pendant | WORKING (orphaned) | Not in header/footer nav; superseded by product catalog. Hardcoded prices. |
| contact | WORKING | `leads.insert`; Isabella chat. |
| blog, blog/:slug | WORKING | `blog_posts` **0 seeded → empty until authored**. |
| join | WORKING | fns `submit-registration`/`save-registration-draft`; **Stripe `create-checkout` / Mollie `create-mollie-checkout`**. |
| login, forgot-password, reset-password, staff/login, staff/invite | WORKING | Supabase Auth (+ MFA for staff). |
| register | WORKING | redirect → /join. |
| complete-registration | WORKING | `members.insert`. |
| help | WORKING | `documentation` (10+ seeded). |
| member-update | WORKING | token fns. |
| /r/:partnerCode(/:postSlug) | WORKING | referral tracking fn. |
| /unauthorized, * (404) | STUB (by design) | static error pages. |

**Orphans:** `/pendant` (not in primary nav). **ICE leftover:** `public/robots.txt` sitemap → `icealarm.es` (§11). All payment/registration/referral/AI integrations wired to existing edge functions.

---

## Prioritised defect list

### BROKEN — must fix (8)
1. **Admin orders drill-down dead** — `/admin/orders/:id` route doesn't exist; OrdersPage.tsx:173,207 navigate to it. No OrderDetailPage. (Primary drill-down 404s.)
2. **Call-centre `tasks` member links go to `/admin/...`** — admin TasksPage (re-exported) hardcodes `/admin/members/:id` (:468,522); call-centre staff bounced into admin portal.
3. **Call-centre alerts "Call Emergency" button** — no onClick (CallCentreDashboard.tsx:242-245). Dead primary action on the safety queue.
4. **Admin Messages "Call"/"SMS" buttons** — no onClick (MessagesPage.tsx:957-964).
5. **Admin Payments invoice button** — no-op (PaymentsPage.tsx:237); **search box** never applied to query.
6. **Partner Support 3 resource links** — `href="#"` dead (PartnerSupportPage.tsx:38,43,48).
7. **Partner "Generate Invoice" button** — no-op toast (PartnerDetailPage.tsx:397-399).
8. **Audit-log CSV export** — exports only the current 25-row page, not the full filtered set (misleading compliance artifact).

### INCOMPLETE — stub action / build needed (9)
1. **Member self-service billing** (client subscription) — upgrade/payment/invoice all "contact support". Stripe/Mollie not wired into member portal. (Likely beta-intentional; confirm for launch.)
2. **Subscription lifecycle billing-blind** (admin) — pause/resume/cancel don't call the payment provider; customer keeps being charged. **Highest money-risk.**
3. **Commission payouts** (admin) — "Mark Paid" is DB-only, no provider payout (confirm if intentional/out-of-band).
4. **Reports "Export PDF"** — stub.
5. **Blog "Tags"** — visible field, never persisted.
6. **Partner pricing defaults** — hardcoded in bundle; only overrides editable.
7. **Admin members/new wizard** — shell; completeness depends on step components.
8. **Admin order detail** — needs a page (pairs with BROKEN #1).
9. **CRM import** — non-transactional + writes placeholder data into real life-safety records (data-integrity risk; harden before bulk use).

### NEEDS-BACKEND — correct, untestable until cutover (secrets + deploy)
- **Stripe/Mollie:** join checkout, finance, subscriptions, payments.
- **Twilio:** SOS browser voice + conference (call-centre), partner invite SMS/WhatsApp, alert notifications.
- **Isabella AI (`ai-run` + gateway):** public/contact/support chat widgets, media-manager, ai-outreach, admin AI pages.
- **EV07B + gps-gateway:** devices, alerts, SOS pipeline (verified Isabella-independent).
- **Facebook** (media publish), **YouTube** (video-hub), **render-worker** (video; still ICE-branded §11).
- **Email Resend/Gmail:** invites, notifications. ⚠️ **Provider inconsistency** — partner invites use Gmail SMTP, partner alert notifications use Resend.

### ORPHANS (3)
- Call-centre **`shift-history`** and **`preferences`** — defined + working but absent from `CallCentreSidebar` nav (only reachable if a header/avatar menu links them).
- Public **`/pendant`** — not in header/footer; superseded by the product catalog. Decide: surface or fold in.

### Cross-cutting / launch (not route defects)
- **ICE→Care member-facing leftovers** (§11): `LeadsPage` mailto "ICE Alarm Registration"; `robots.txt` → icealarm.es; client device/layout ICE i18n keys; render-worker branding.
- **Isabella enforcement** (§5): admin/support/widget pages call `ai-run` directly; the new gate (`feat/isabella-gate`, merged to main, **not yet deployed**) governs this once Step D runs.
- **Type gaps:** `staff_invites`, `shift_escalation_chain` accessed via `as any` (regenerate Supabase types post-cutover).
- **XSS surface:** `documentation.content` rendered via `dangerouslySetInnerHTML` (admin-authored; ensure sanitisation).
