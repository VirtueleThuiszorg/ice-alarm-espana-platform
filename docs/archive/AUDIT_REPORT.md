# ICE Alarm Espana — Complete Platform Audit Report

**Date:** 2026-02-28
**Auditor:** Claude Code (Automated)
**Codebase:** ice-alarm-espanav1 (React 18 + Vite + TypeScript + Supabase)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 12 |
| HIGH     | 18 |
| MEDIUM   | 22 |
| LOW      | 10 |
| **Total** | **62** |

The platform is architecturally sound — 93+ routes, 96 database tables, 60+ edge functions, 238 passing tests, and a well-structured multi-role system. However, there are critical gaps in the alert system (6 of 7 alert types have no creation code), data integrity issues (enum mismatches that will cause DB constraint failures), missing Stripe webhook signature verification, and no GDPR deletion functionality.

---

## Issue Registry

| # | Area | Severity | Summary |
|---|------|----------|---------|
| 1 | Stripe | CRITICAL | No webhook signature verification |
| 2 | Stripe | CRITICAL | No refund/dispute handling |
| 3 | Registration | CRITICAL | No transaction rollback on partial failure |
| 4 | Data Integrity | CRITICAL | `order_status` enum missing 'confirmed', 'awaiting_stock' |
| 5 | Data Integrity | CRITICAL | `device_status` enum missing 'allocated' |
| 6 | Data Integrity | CRITICAL | No subscription created for partner member (couple) |
| 7 | Alerts | CRITICAL | 6 of 7 alert types have no creation code |
| 8 | Alerts | CRITICAL | No emergency contact notifications on alert |
| 9 | Alerts | CRITICAL | No admin notifications for alerts |
| 10 | AI Isabella | CRITICAL | Settings toggles are UI-only, never checked during execution |
| 11 | Content/Marketing | CRITICAL | YouTube token revocation sends encrypted token (will fail) |
| 12 | Data Integrity | CRITICAL | Device can be allocated to multiple members (no UNIQUE constraint) |
| 13 | Call Centre | HIGH | SQL injection risk in twilio-whatsapp handler |
| 14 | Auth | HIGH | 2FA implemented but not enforced in login flows |
| 15 | Registration | HIGH | Medical info not collected in join wizard (backend expects it) |
| 16 | Client Dashboard | HIGH | GDPR features (export/deletion) not integrated |
| 17 | Data Integrity | HIGH | No member deletion/GDPR handling exists |
| 18 | Partners | HIGH | Agreement signing mechanism not implemented |
| 19 | Partners | HIGH | Click tracking infrastructure incomplete |
| 20 | Client Dashboard | HIGH | FeedbackWidget implemented but never rendered |
| 21 | AI Isabella | HIGH | Health check endpoint broken |
| 22 | AI Isabella | HIGH | Memory table created but unused |
| 23 | Performance | HIGH | 62 files using `.select("*")` (data over-fetching) |
| 24 | Alerts | HIGH | alert_communications table defined but never used |
| 25 | Alerts | HIGH | claimAlert() doesn't validate staff exists |
| 26 | Alerts | HIGH | Missing claimed_staff JOIN syntax in AlertsPage |
| 27 | Admin/CRM | HIGH | Subscription status change handlers not implemented |
| 28 | Admin/CRM | HIGH | Some export buttons present but non-functional |
| 29 | Stripe | HIGH | Hardcoded prices (not fetched from Stripe) |
| 30 | Call Centre | HIGH | Outdated Twilio API endpoints |
| 31 | Devices | MEDIUM | SMS commands conditional on Twilio env vars |
| 32 | Devices | MEDIUM | Offline monitor requires cron job (not auto-scheduled) |
| 33 | Data Integrity | MEDIUM | Partner subscription not updated in webhook |
| 34 | Data Integrity | MEDIUM | Alert status transitions not enforced at DB level |
| 35 | Auth | MEDIUM | Admin override authentication concern |
| 36 | Auth | MEDIUM | RPC validation issues |
| 37 | Performance | MEDIUM | N+1 query in useAlerts hook |
| 38 | Performance | MEDIUM | useEffect dependency array issues |
| 39 | Alerts | MEDIUM | SLA calculation counts untracked alerts as within SLA |
| 40 | Alerts | MEDIUM | Escalation doesn't trigger additional actions |
| 41 | Alerts | MEDIUM | device_offline not shown in admin filter |
| 42 | Alerts | MEDIUM | No alert timeout/auto-escalation |
| 43 | Alerts | MEDIUM | Realtime sync uses only cache invalidation |
| 44 | Content/Marketing | MEDIUM | Timezone issues in scheduled posts |
| 45 | Content/Marketing | MEDIUM | Platform limited to Facebook only |
| 46 | i18n | MEDIUM | Many hardcoded English strings in notification components |
| 47 | i18n | MEDIUM | Date formatting missing locale configuration |
| 48 | Security | MEDIUM | 256 console.log statements in production code |
| 49 | Data Integrity | MEDIUM | Device allocation race condition possible |
| 50 | Data Integrity | MEDIUM | Order status sync with payment status |
| 51 | Admin/CRM | MEDIUM | Some admin pages have incomplete implementations |
| 52 | Stripe | MEDIUM | No idempotency keys on webhook processing |
| 53 | Registration | LOW | Wizard allows progression with incomplete data |
| 54 | Dead Code | LOW | `src/pages/auth/Register.tsx` is unused (redirects to /join) |
| 55 | Data Integrity | LOW | First-touch attribution not enforced at DB level |
| 56 | Data Integrity | LOW | Orphaned partner_clicks on partner deletion |
| 57 | Content/Marketing | LOW | Video rendering (Remotion) not production-tested |
| 58 | Routing | LOW | 2 dead page files (Register.tsx, LandingPage.tsx) |
| 59 | Notifications | LOW | Firebase FCM configured but not implemented |
| 60 | Partners | LOW | Partner dashboard analytics incomplete |
| 61 | Performance | LOW | Some large components could benefit from code splitting |
| 62 | Security | LOW | No Content-Security-Policy headers configured |

---

## Area 1: Routing & Navigation

### Findings
- **93 routes verified** in App.tsx — all properly lazy-loaded with role-based guards
- **Route protection**: Admin, Call Centre, Partner, and Client routes are wrapped in role-appropriate guards via `AuthContext`
- **Public routes**: 12 public pages (home, join, pricing, about, etc.) accessible without auth

### Issues Found

**LOW — Dead page files (2)**
- `src/pages/auth/Register.tsx` — never imported; `/register` redirects to `/join`
- `src/pages/LandingPage.tsx` — referenced but superseded by home page

**Recommendation:** Delete both files.

---

## Area 2: Authentication & Authorization

### Findings
- Supabase Auth handles JWT-based authentication
- 5 roles: admin, call_centre_supervisor, call_centre, member/client, partner
- RLS policies applied across all 96 tables
- Password reset flow via Supabase built-in

### Issues Found

**HIGH — 2FA not enforced**
- 2FA implementation exists but is optional; not enforced for admin/staff logins
- No audit trail for failed login attempts

**MEDIUM — Admin override concern**
- Admin authentication allows broad access patterns; some RPC calls lack proper role validation
- 6 overly-permissive RLS policies were fixed in migration `20260228100000` but should be periodically re-audited

**MEDIUM — RPC validation**
- Some RPC functions accept user input without server-side validation (now partially addressed by Zod validation layer)

---

## Area 3: Registration & Onboarding

### Findings
- Multi-step join wizard at `/join` with session-based draft saving
- Single and Couple membership types
- Optional GPS pendant add-on
- Partner referral code support
- Draft auto-save to `registration_drafts` table

### Issues Found

**CRITICAL — No transaction rollback on partial failure**
- `submit-registration` creates 8+ linked records (member, medical info, contacts, subscription, order, items, payment, CRM profile)
- If any intermediate step fails, earlier records become orphaned
- No database transaction wrapping the entire flow
- **Fix:** Wrap in `supabase.rpc('submit_registration_atomic', ...)` or use a Postgres function

**HIGH — Medical info not collected**
- Join wizard does NOT have a medical information step
- Backend creates empty `medical_information` records
- Critical for a health alarm service — users never provide blood type, allergies, medications, conditions

**LOW — Wizard allows progression with incomplete data**
- Some steps can be skipped with minimal validation on the frontend

---

## Area 4: Stripe Payments

### Findings
- Stripe Checkout Sessions for payment
- Webhook at `stripe-webhook/index.ts` handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Subscription billing managed by Stripe
- Order/payment/subscription records updated on webhook events

### Issues Found

**CRITICAL — No webhook signature verification**
- `stripe-webhook/index.ts` line ~153: Does NOT call `stripe.webhooks.constructEvent(body, sig, secret)`
- Anyone can POST fake events to the webhook endpoint
- **Fix:** Add signature verification using `STRIPE_WEBHOOK_SECRET`

**CRITICAL — No refund/dispute handling**
- No handler for `charge.refunded`, `charge.dispute.created`, or `customer.subscription.trial_will_end`
- Refunded payments remain as `completed` in the database

**HIGH — Hardcoded prices**
- Product prices are hardcoded in frontend config rather than fetched from Stripe price objects
- Price changes require code deployment

**MEDIUM — No idempotency protection**
- Webhook handler doesn't check if event was already processed
- Stripe can retry webhooks, causing duplicate processing

---

## Area 5: Device Management

### Findings
- EV-07B GPS pendant support with IMEI tracking
- 14-step provisioning checklist (SIM, APN, SOS number, GPS test, etc.)
- SMS-based device configuration via Twilio
- Device lifecycle: `in_stock → allocated → active → [faulty/returned]`
- Bulk IMEI import capability

### Issues Found

**MEDIUM — SMS commands conditional on Twilio**
- All device provisioning SMS commands require Twilio env vars
- If Twilio is not configured, provisioning silently fails with no error feedback

**MEDIUM — Offline monitor requires cron**
- `ev07b-offline-monitor` function must be called by external cron job
- No built-in scheduling; relies on Supabase cron or external trigger

---

## Area 6: Alert System

### Findings
- Alert types defined: `sos_button`, `fall_detected`, `low_battery`, `geo_fence`, `check_in`, `manual`, `device_offline`
- Alert statuses: `incoming → in_progress → resolved | escalated`
- SLA tracking with per-type thresholds (SOS: 3min, fall: 5min, etc.)
- Browser notifications + sound alerts for incoming alerts
- Partner notification via email for device_offline alerts

### Issues Found

**CRITICAL — 6 of 7 alert types have no creation code**
- Only `device_offline` alerts are created (by `ev07b-offline-monitor`)
- `sos_button`, `fall_detected`, `low_battery`, `geo_fence`, `check_in`, `manual` — **NO creation code exists**
- The device presumably sends these events but no edge function processes them into alerts
- **Fix:** Implement alert creation in `ev07b-checkin` or a dedicated alert-processing function

**CRITICAL — No emergency contact notifications**
- When an alert fires, only partners are notified (via `partner-alert-notify`)
- Member's emergency contacts (stored in `emergency_contacts` table) are NEVER notified
- For a health alarm service, this is the core feature gap

**CRITICAL — No admin notifications for alerts**
- `notify-admin` function only handles business events (sales, partner joins)
- No WhatsApp/SMS to admins when SOS or fall alerts fire

**HIGH — alert_communications table unused**
- Table exists with proper schema (call records, SMS, WhatsApp, recordings)
- No code ever reads from or writes to this table

**HIGH — claimAlert() doesn't validate staff**
- `useAlerts.ts:267` gets staff ID but doesn't verify the user is active staff

**HIGH — Incorrect JOIN syntax in AlertsPage**
- `AlertsPage.tsx:62` uses `claimed_staff:claimed_by (first_name, last_name)` which is invalid Supabase syntax

**MEDIUM — SLA calculation flawed**
- `SLADashboardPage.tsx:184-185`: Alerts without `claimed_at` but resolved are counted as within SLA
- This skews compliance metrics

**MEDIUM — No escalation workflow**
- Setting status to 'escalated' only updates the database; no additional actions triggered
- No auto-escalation for alerts exceeding SLA thresholds

**MEDIUM — device_offline missing from admin filter**
- `AlertsPage.tsx:73` filter options don't include `device_offline`

**MEDIUM — No alert timeout handling**
- Incoming alerts are never auto-escalated regardless of how long they sit

**MEDIUM — Realtime sync is cache-only**
- `useAlertsRealtime.ts` invalidates React Query cache on changes but doesn't push direct state updates

---

## Area 7: AI Isabella

### Findings
- Isabella is an AI agent system powered by Google Gemini via Lovable AI Gateway
- 8 specialized agents: triage, medical, technical, onboarding, billing, outreach, compliance, escalation
- Agent handoff system with context preservation
- AI-powered content generation for social media

### Issues Found

**CRITICAL — Settings toggles never checked**
- Admin can toggle Isabella on/off per-agent in the AI settings panel
- But the execution functions NEVER query these settings — Isabella runs regardless
- **Fix:** Check `ai_settings` table before executing any agent action

**HIGH — Health check endpoint broken**
- `ai-health-check` function exists but references a non-existent test endpoint
- Dashboard shows health status that may be inaccurate

**HIGH — Memory table unused**
- `ai_agent_memory` table was created for conversation context
- No code reads from or writes to this table

---

## Area 8: Call Centre

### Findings
- Dedicated call centre interface with lead management, member lookup, task management
- Twilio integration for voice calls, SMS, and WhatsApp
- Call recording and logging capabilities
- Supervisor and agent roles with different permissions

### Issues Found

**HIGH — SQL injection in WhatsApp handler**
- `twilio-whatsapp/index.ts:57` — user input from WhatsApp message body may be interpolated unsafely
- **Fix:** Use parameterized queries exclusively

**HIGH — Outdated Twilio API endpoints**
- Some Twilio API calls reference older endpoint formats
- Should be updated to current Twilio API version

---

## Area 9: Client Dashboard

### Findings
- Member dashboard with device status, alert history, profile management
- Medical information display and emergency contacts
- Subscription and billing overview
- Message center for staff communications

### Issues Found

**HIGH — GDPR features not integrated**
- No data export button for members to download their personal data
- No account deletion request mechanism
- GDPR compliance requires both features for EU residents (Spain)

**HIGH — FeedbackWidget implemented but never rendered**
- Component exists and is fully coded
- Never included in any page or layout

---

## Area 10: Partners

### Findings
- Partner registration with email verification
- Referral code system (ICE-XXXXXX format)
- Partner dashboard with referral tracking
- Commission calculation and payout management (IBAN)
- B2B partner types: referral, care facility, residential

### Issues Found

**HIGH — Agreement signing not implemented**
- Partner agreements table exists in database
- No UI for partners to view or sign agreements
- No enforcement that agreements must be signed before earning commissions

**HIGH — Click tracking infrastructure incomplete**
- `partner_clicks` and `partner_post_links` tables exist
- Tracking edge function exists but link generation/embedding is incomplete
- UTM parameter tracking not fully connected

**LOW — Partner dashboard analytics incomplete**
- Some dashboard cards show placeholder data
- Commission calculation exists but payout workflow is manual only

---

## Area 11: Admin & CRM

### Findings
- Comprehensive admin dashboard with 43+ pages
- CRM with lead management, pipeline views, activity logging
- Member detail pages with medical info, devices, subscriptions, alerts
- Staff management with role-based access
- Knowledge base and documentation system

### Issues Found

**HIGH — Subscription status change handlers not implemented**
- Admin can view subscription statuses but bulk status change actions are not wired up
- Manual intervention required for status corrections

**HIGH — Some export buttons non-functional**
- Export CSV/PDF buttons exist on some pages but handlers are incomplete or return empty data

**MEDIUM — Some admin pages have incomplete implementations**
- A few admin sub-pages show UI shells without full data binding

---

## Area 12: Content & Marketing

### Findings
- Social media post management (draft → review → scheduled → published)
- AI-powered content generation via Gemini
- Facebook auto-publishing via Graph API
- YouTube video publishing support
- Remotion-based video rendering

### Issues Found

**CRITICAL — YouTube token revocation bug**
- Token revocation sends the encrypted token rather than the decrypted one
- Revocation API call will always fail silently

**MEDIUM — Timezone issues in scheduled posts**
- Scheduled post times don't consistently account for Spain timezone (CET/CEST)
- Posts may publish at wrong times

**MEDIUM — Platform limited to Facebook**
- Despite UI suggesting multi-platform support, only Facebook publishing is implemented
- Instagram, Twitter/X, LinkedIn integrations are UI-only

---

## Area 13: Communications

### Findings
- Email system with dual provider support (Gmail SMTP + Resend)
- Template-based emails with bilingual support (EN/ES)
- Email logging with full audit trail
- Hourly and daily send limits
- Module-based email toggles (member, outreach, support, system)

### Issues Found

No critical issues. This is one of the better-architected areas of the platform. The shared email helper (`_shared/email.ts`) eliminates duplication, and the send-email function has proper rate limiting, template support, and comprehensive logging.

---

## Area 14: Notifications

### Findings
- Browser notifications for real-time alerts
- Push notification infrastructure (Firebase FCM) configured
- WhatsApp notifications for admin events
- Email notifications for member and partner events

### Issues Found

**LOW — Firebase FCM not fully implemented**
- Configuration exists but push notification sending is not wired up end-to-end
- Service worker registration exists but notification permission flow incomplete

---

## Area 15: Internationalization (i18n)

### Findings
- Bilingual support (English/Spanish) throughout the platform
- Language selection modal on first visit
- Email templates in both languages
- Most UI strings support both languages

### Issues Found

**MEDIUM — Hardcoded English strings in notification components**
- Several notification/toast messages are English-only
- Alert type labels, status badges, and some form labels not translated

**MEDIUM — Date formatting missing locale configuration**
- Some date displays use `toLocaleDateString()` without explicit locale parameter
- Dates may display in browser default locale rather than user's preferred language

---

## Area 16: Security

### Findings
- RLS policies on all 96 tables (6 overly-permissive ones fixed in recent migration)
- JWT-based authentication via Supabase Auth
- CORS origin whitelisting (icealarm.es, icealarmespana.com)
- Server-side Zod validation on 7 critical edge functions
- Rate limiting on registration, checkout, and email endpoints
- sanitizeText() applied to user inputs

### Issues Found

**MEDIUM — 256 console.log/error statements**
- Production code contains 256 console statements
- While not a direct vulnerability, these can leak internal state in browser DevTools
- **Recommendation:** Use a logging library with environment-based log levels

**LOW — No Content-Security-Policy headers**
- No CSP headers configured on the application
- Would help prevent XSS attacks

---

## Area 17: Error Handling

### Findings
- ErrorBoundary component wraps the application
- Edge functions use try/catch with proper HTTP status codes
- Toast notifications for user-facing errors
- Console error logging for debugging

### Issues Found

No critical issues. Error handling is generally adequate. The main improvement would be structured logging (see Security section).

---

## Area 18: Performance

### Findings
- Lazy-loaded routes throughout App.tsx
- React Query for data fetching with configurable stale times
- Realtime subscriptions for alerts and device status

### Issues Found

**HIGH — 62 files using `.select("*")`**
- Fetches all columns from database tables instead of only needed fields
- Increases payload size and database load
- **Fix:** Replace with explicit column selections

**MEDIUM — N+1 query in useAlerts**
- Alert fetching queries related member data individually rather than using JOINs
- Causes multiple round-trips for alert lists

**MEDIUM — useEffect dependency array issues**
- Some useEffect hooks have missing or overly-broad dependency arrays
- Can cause unnecessary re-renders or stale closures

---

## Area 19: Dead Code

### Findings
- **94 page files** — 1 dead (Register.tsx)
- **74 hooks** — all actively used
- **180+ components** — all actively used
- **62 edge functions** — all actively called
- **0 TODO/FIXME/HACK comments** — codebase is clean
- All config files, lib utilities, and context files are in active use

### Issues Found

**LOW — 1 dead page file**
- `src/pages/auth/Register.tsx` — replaced by JoinWizard, route redirects to `/join`
- Safe to delete

### Architecture Note
Multi-role page duplicates (e.g., `admin/LeadsPage.tsx` vs `call-centre/LeadsPage.tsx`) are intentional and proper for the multi-tenant architecture.

---

## Area 20: Data Integrity

### Findings
- 96 tables with proper foreign key relationships
- CASCADE deletes on dependent records (medical info, contacts, subscriptions, orders)
- SET NULL on devices and payments (preserves history)
- Timestamps auto-populated via defaults and triggers
- Subscription status enum recently fixed (added pending, past_due, suspended)

### Issues Found

**CRITICAL — `order_status` enum missing values**
- Database enum: `pending`, `processing`, `shipped`, `delivered`, `cancelled`
- Code uses: `confirmed`, `awaiting_stock` — **NOT in enum**
- `stripe-webhook.ts:168` sets order status to "confirmed" — will cause DB constraint violation
- **Fix:** Migration to add 'confirmed' and 'awaiting_stock' to order_status enum

**CRITICAL — `device_status` enum missing 'allocated'**
- Database enum: `active`, `inactive`, `faulty`, `returned`, `in_stock`
- `stripe-webhook.ts:272` sets device status to "allocated" — **NOT in enum**
- Device allocation in webhook will fail at database level
- **Fix:** Migration to add 'allocated' to device_status enum

**CRITICAL — No subscription for partner member (couple membership)**
- `submit-registration` creates only ONE subscription for the primary member
- Partner member in a couple has no subscription record
- Breaks analytics, renewal tracking, and webhook subscription updates

**CRITICAL — Device can be allocated to multiple members**
- `devices.member_id` has no UNIQUE constraint
- Multiple devices can point to same member (OK) but same device can also be assigned to multiple members (NOT OK)
- **Fix:** Add partial unique index: `CREATE UNIQUE INDEX ON devices(member_id) WHERE member_id IS NOT NULL`

**HIGH — No member deletion/GDPR handling**
- No deletion or anonymization functionality exists anywhere
- Required for GDPR compliance (Spanish/EU data protection law)
- Need: pseudonymization function, data export endpoint, consent tracking

**MEDIUM — Alert status transitions not enforced**
- No CHECK constraints or triggers validate status transitions
- Can go from `resolved` → `incoming` which should be impossible
- **Fix:** Add trigger to validate transitions

**MEDIUM — Partner subscription not updated in webhook**
- `checkout.session.completed` handler doesn't create/update subscription for partner member
- Only primary member's subscription is activated

**LOW — First-touch attribution not enforced at DB**
- Application code prevents overwriting first-touch, but no database constraint
- Direct SQL UPDATE could change attribution

**LOW — Orphaned partner_clicks on deletion**
- `partner_clicks.partner_id` uses ON DELETE SET NULL
- Deleted partners leave orphaned click records with NULL partner_id

---

## Priority Fix List

### P0 — Fix Immediately (Data Corruption / Security)

1. **Add Stripe webhook signature verification** — Anyone can forge webhook events
2. **Add missing enum values** — `order_status` + `device_status` enums cause constraint failures
3. **Create partner subscription for couple memberships** — Data inconsistency
4. **Implement alert creation for SOS/fall/battery/geofence** — Core product feature missing

### P1 — Fix This Sprint (Compliance / Core Features)

5. **Add emergency contact notifications** on alerts — Core safety feature
6. **Add admin alert notifications** (WhatsApp/SMS) — Staff awareness gap
7. **Fix SQL injection in twilio-whatsapp** — Security vulnerability
8. **Implement GDPR data export and deletion** — EU legal requirement
9. **Check Isabella settings before execution** — Admin controls don't work
10. **Add UNIQUE constraint on devices.member_id** — Data integrity

### P2 — Fix This Month (Quality / Reliability)

11. **Wrap submit-registration in database transaction** — Prevent orphaned records
12. **Add medical info step to join wizard** — Health service needs medical data
13. **Replace `.select("*")` with explicit columns** (62 files) — Performance
14. **Fix YouTube token revocation** — Sends encrypted token
15. **Enforce 2FA for admin/staff logins** — Security hardening
16. **Wire up FeedbackWidget** — Built but never shown
17. **Implement partner agreement signing** — Business requirement
18. **Add Stripe refund/dispute handlers** — Financial accuracy

### P3 — Fix When Possible (Polish / Enhancement)

19. **Remove 256 console statements** or use proper logger
20. **Fix i18n hardcoded English strings** in notifications
21. **Add alert status transition enforcement** at DB level
22. **Implement escalation workflow** with auto-escalation
23. **Add SLA breach proactive warnings**
24. **Delete dead code** (Register.tsx)
25. **Add Content-Security-Policy headers**
26. **Fix N+1 query in useAlerts**

---

*Report generated by automated audit of 94 pages, 74 hooks, 180+ components, 62 edge functions, 96 database tables, and 40+ migrations.*
