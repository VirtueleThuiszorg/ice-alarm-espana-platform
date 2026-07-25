# AUDIT_NIGHT.md — overnight audit, 2026-07-24/25

> Part B of the overnight directive: everything found that was NOT fixed in the
> night's fix PRs, ranked. Method: six parallel read-only audits (one per
> portal + one cross-cutting client-write sweep over all 342 write sites vs the
> RLS policies in 133 migrations), plus session knowledge. Each item has a
> one-line fix. Items fixed tonight are in the fix PRs, not here.
> **GATED** = needs Lee's explicit sign-off class (SOS/alerts, payments, RLS
> policies, member deletion, email cutover). **PROD** = needs prod
> secrets/deploys — listed for Lee, not attempted.

## BLOCKER

1. **[PROD] `complete-member-registration` was never deployed** — #38 merged
   2026-07-23 but deploy CI green-skips, so /complete-registration is still
   broken on prod. Fix: include in the next `supabase functions deploy` batch.
2. **[PROD] `GMAIL_APP_PASSWORD` unset** — ~11 transactional email functions
   dead, incl. the email half of `emergency-contact-notify`. Fix: set the
   secret (Lee: tomorrow, dedicated Gmail).
3. **[GATED] `partner_alert_notifications` has NO UPDATE policy for any role**
   — partner AND admin alert acknowledgement is 100% broken; the care-home
   "we saw the SOS" confirmation loop can never close. Fix: partner UPDATE
   policy scoped to `acknowledged_at/acknowledged_by` + staff policy (or an
   edge fn) — RLS change, needs sign-off.
4. **[GATED] Partners can self-grant `alert_visibility_enabled`** — the
   own-row UPDATE policy on `partners` is column-blind with no guard trigger,
   and that flag is the sole gate on the resident SOS-alert stream
   (`partner-alert-notify` + `partner_alert_subscriptions` RLS). Fix: strip
   the field from client mutations + BEFORE UPDATE guard trigger on `partners`
   (same pattern as `guard_staff_self_update`). Security issue — recommend
   first in the review queue.
5. **[GATED] SOS action panel writes are optimistic + unchecked**
   (`SOSActionPanel.tsx:175,194,203`): "emergency services called" /
   "next of kin notified" toggles setState BEFORE the unchecked alerts write,
   and resolution-notes autosave is unchecked — the SOS audit trail can be
   fiction. Also `useSOSConference` ignores response.error on all 5 invokes
   (join/leave/mute/add-participant — a family member can silently never be
   conferenced in). Fix: check errors, revert UI on failure. SOS path —
   parked for the drill window.
6. **[PROD] Twilio still on trial** — the emergency-critical SMS channel
   can't reach unverified numbers. Fix: paid plan (already a checklist hard
   blocker).
7. **[PROD] 24h cron clean-run confirmation never done** — was due
   2026-07-23; the checklist line is still open and the clock long expired.
   Fix: re-check `cron.job_run_details` + error count, tick or investigate.

## HIGH

8. **[GATED] `ai_events` role mismatch kills the staff-scheduling event
   stream** — INSERT policy is `is_admin()`-only while holidays/covers/shifts
   admit `call_centre_supervisor` + agents; 5 sites insert silently-denied
   (useStaffHolidays ×2, useShiftCovers ×2, useStaffShifts). Isabella never
   sees agent/supervisor events. Fix: align the INSERT policy role set (RLS
   change) or emit via trigger.
9. **[GATED] Plain `admin` cannot edit staff or system settings** — staff
   UPDATE and `system_settings` writes are super_admin-only while the UI
   admits admins (StaffFormPanel edit, DevicesSettingsTab, VoiceSettings,
   PartnerPricingSettings). Fix: `is_admin()` policies for non-privileged
   columns or a server-side `staff-update` fn; also type the client `updates`
   to a column whitelist (role/is_active currently pass through the client
   payload and die on RLS/trigger).
10. **[GATED] Member activation path can skip PHI** — admin wizard
    `PaymentStep.tsx:93,109`: `medical_information` + `emergency_contacts`
    inserts unchecked; "Payment processed successfully!" shows regardless — a
    member can go live with no medical record and no emergency contacts.
    (Also still violates golden rule #4 client-side activation — the pinned
    product decision.) Fix: check both errors + fail the step; long-term
    server-side activation.
11. **Admin portal has ZERO query-error states (systemic)** — 0 of 48 admin
    pages branch on `isError`; every failed load renders as a normal empty
    state ("No members found"). Fix: one shared `<QueryError onRetry>` +
    `isError` branch before empty checks; generalize from LeadsPage's toast.
12. **DNC/suppression false success** (`OutreachLeadDetailDialog.tsx:55-66`):
    do-not-contact + suppression writes unchecked, success toast
    unconditional — a failed write keeps emailing someone who opted out
    (GDPR/CAN-SPAM exposure). Fix: check both errors before the toast.
13. **Outreach caps under-count on failure** (`useOutreachCaps.ts:175,180`):
    unchecked daily-usage increment silently defeats send caps. Fix: throw
    into the mutation's onError.
14. **Qualified-but-never-queued leads** (`useOutreachRawLeads.ts:331`):
    unchecked `outreach_queued_tasks` insert before a checked status update —
    silent pipeline black hole. Fix: `if (error) throw`.
15. **Admin "view member dashboard" eye icon dead-ends** (`MembersPage.tsx:330`
    → `/dashboard?memberId=` but ProtectedRoute requireMember bounces admins
    to /complete-registration). Fix: implement admin-view mode in ClientLayout
    like PartnerLayout:19 does.
16. **Money-state transition client-side** (`CommissionsPage.tsx:150`,
    `PartnerDetailPage.tsx:306`): mark-commission-paid runs in the browser
    under a blanket `is_staff` policy — any agent can mark commissions paid.
    Fix: edge fn with role check + eligibility validation (payments-adjacent
    → review carefully).
17. **`is_staff` FOR ALL policies act as privilege flattener (systemic)** —
    members.status, partners.status/partner_type, partner_commissions.status
    are all writable by ANY staff row via hand-crafted requests; admin-ness is
    only a UI route guard. Fix: tighten to `is_admin()`/role sets for
    privileged columns + guard triggers (RLS change — gated).
18. **Anonymous Isabella chat transcripts are unpersistable** — the
    2026-02-13 migration dropped anon INSERT on `conversation_messages` and
    the `conversations` INSERT policy can't match `member_id NULL`; all 4
    writes in useAIChat fail for anon visitors (now at least logged). Fix:
    persist transcripts server-side from `ai-run` (service role) — design
    choice, recommend with the Isabella rule-#5 work.
19. **Partner storage path bug orphans uploads** (`PartnerMarketingPage.tsx:
    143-160`): admin-view uploads land in the ADMIN's uid folder while the
    row is keyed to the partner — the partner can never sign a URL for their
    own file. Fix: key storage path on partner_id + align storage policy
    (storage RLS — gated).
20. **Members activatable with divergent auth email** (`PartnerSettingsPage`):
    partners can rewrite `email`/`payout_iban` client-side, unaudited, and
    `partners.email` diverges from auth. Fix: route through a verifying edge
    fn (payout data — review carefully).
21. **staff-register "Add Staff" failure (Lee's live repro)** — no code bug
    provable from source: payload/coercion valid, role enum matches, caller
    RLS path exists, rollback correct. Decision tree: log shows createUser
    "already registered" → duplicate/orphan auth account (dup-class, not
    code); 403 "staff record not found" → caller staff row inactive; 400 →
    validation; no invocation → client-side pre-call. #71 (merged) surfaces
    the real message on the next attempt. Waiting on Lee's log paste.

## MEDIUM

22. **Call-centre realtime channels have no error/status callbacks** (~19
    subscriptions incl. the ops dashboard) — a CHANNEL_ERROR silently ends
    live updates on a monitoring surface. Fix: `.subscribe((status)=>…)` +
    stale badge. (Alerts-hook channels are SOS-gated.)
23. **MessagesPanel stale closure** (`:82`): realtime INSERT handler captures
    `selectedConversation === null` forever — open thread never live-updates.
    Fix: ref or dependency.
24. **"undefined..." conversation previews** (`MessagesPanel.tsx:152`,
    call-centre `MessagesPage.tsx:249`): `+` binds before `||`. Fix: guard
    before concatenating.
25. **CRM bulk import: 12 unchecked child writes** (`CRMImportPage.tsx`) incl.
    `medical_information` + `emergency_contacts` — partial imports report
    success. Fix: collect per-row errors into the batch result.
26. **DeviceTab has_pendant desync** (3 sites): checked device write + 
    unchecked subscription sync. Fix: check + partial-failure toast.
27. **Member-facing notification bodies hardcoded English** (call-centre +
    member messages, holiday notifications; `[Internal Note]` marker) — es/nl
    members get English notifications. Fix: store type+params, translate at
    render.
28. **JoinWizard step-1 validation + PartnerJoin org-labels i18n** — the
    partner-join page has ~124 hardcoded literals (9 type cards, 30 org
    labels, 7 zod messages, all placeholders); PartnerSettings ~71,
    PartnerInvites ~32, PartnerAlerts ~25, PartnerMembers ~13 (+ English-only
    CSV headers). Plus whole missing namespaces (partner.residential ~90,
    partner.care ~40, partnerInvite ~50 call sites) where inline English
    defaults always win. Fix: dedicated partner-i18n day job — one PR, key
    trees + 3 locales (~400 values).
29. **Admin i18n debt**: 66 of 182 admin files have zero useTranslation
    (LeadsPage 65 literals, PartnerDetailPage 60, StaffFormPanel 44,
    AnalyticsPage 41, AddPartnerPage 41…). Fix: mechanical batch per file
    cluster; extract shared enum-label maps.
30. **EmailTemplatesTab preview invisible in dark mode** (`:265` bg-white +
    inherited theme foreground). Fix: `text-black` or iframe isolation.
31. **SalesCommandStrip shows authoritative zeros during load/error**. Fix:
    skeletons + error pill.
32. **Deep-link params ignored** — TicketsPage `?action=create`, SettingsPage
    `?tab=`, PartnerDetailPage `?edit/?tab`, OrdersPage `?highlight`,
    DevicesPage `?status` (5 admin surfaces + EV07B settings button). Fix:
    read searchParams per page.
33. **8 orphaned admin routes** (audit-log, blog, crm-import(+batches),
    crm-contacts, feedback, notifications, sla) reachable only by URL. Fix:
    sidebar "Data & Insights" group.
34. **`send-email` provider fallback mismatch** — fn defaults to "resend"
    when settings row is missing while the shared helper falls back to Gmail.
    Fix: align to gmail fallback.
35. **`partner-alert-notify` silently skips email without RESEND_API_KEY**
    (G2 violation, alerts-adjacent → gated). Fix: loud log + notify-admin on
    skip; move to shared transport at cutover.
36. **`email-inbound-webhook` is a stub** ("simplified handler") — inbound
    replies aren't actually parsed. Fix: implement Resend inbound format at
    cutover, or disable the endpoint.
37. **Member medical/contacts/device pages: isError renders as empty state**
    ("No Emergency Contacts" on a failed load of a life-safety list — invites
    re-entering data that exists). Fix: isError branches (member follow-up
    batch; partly deferred from tonight's PR).
38. **EmergencyContactsPage zod messages hardcoded English** (+ ForgotPassword/
    ResetPassword/StaffPreferences same class). Fix: t() in schemas like
    ProfilePage does.
39. **Locale-unaware dates across call-centre** (~10 sites format() without
    dateLocale; hardcoded 'en-GB' clock fixed tonight). Fix: pass { locale }.
40. **partner_members INSERT missing for partners** — pairs with the gated
    ResidentialDashboard members insert (orphaned member rows). Fix: same
    server-side partner-add-resident design (gated, needs product decision).
41. **Dead code holding latent RLS bugs**: communicationLogger (4 write
    paths, 0 callers), useAgentHandoff (would be denied if wired),
    usePushNotifications (admin-only policy vs member surface),
    usePartnerDistribution write mutations (no consumers). Fix: delete or
    move to phase2/.
42. **Unreachable public pages still shipped**: ProductsPage,
    ProductDetailPage (wholly untranslated), auth/Register (all route-orphaned
    or redirected). Fix: delete or gate behind launch flag.
43. **StaffPreferencesPage role display misses `call_centre_supervisor`**
    (falls through to raw enum) + notification switches were unwired (removed
    tonight). Fix: add the case.

## LOW

44. Raw DB enums shown untranslated in call-centre tables (task.priority,
    alert.status, plan_type…). Fix: shared label maps.
45. `bg-*-100 text-*-800` badges without dark: variants across partner/
    call-centre (ReferralPipeline commissionColors, ResidentialDashboard,
    LeadsPage/DocumentsPage chips); raw `text-*-600` stat numerals. Fix:
    tokens/dark variants (partner pipeline fixed tonight).
46. WhatsApp brand green `#25D366` + white label ~2.8:1 in member/public
    surfaces. Fix: darker base or dark label.
47. Charts: 12 raw hex colors duplicated across 3 admin dashboards. Fix: one
    CSS-variable palette.
48. `useAdminIdeas` admins can see but not triage others' ideas (own-rows
    UPDATE/DELETE only). Fix: is_admin manage policy (RLS — gated, trivial).
49. Blog/KnowledgeBase dates in English month format regardless of locale.
    Fix: date-fns locale.
50. PricingPage footer missing /terms + /privacy links; PartnerSupportPage
    placeholder contact numbers (+34 965 123 456) still live. Fix: real
    numbers or hide cards.
51. LanguageSelector members write: try/catch can't catch supabase {error}.
    Fix: destructure.
52. Heartbeat/presence writes fire-and-forget (staff_presence) — stale
    presence affects alert routing visibility. Fix: log once on failure.
53. 60 pre-existing eslint warnings (exhaustive-deps + react-refresh; the
    useAlerts one is SOS-gated). Fix: dedicated pass with behavior review.
54. sosEscalation e2e latency probe still skipped (<1s assertion TODO) —
    G1 measurement owed at the drill.
55. [PROD] `qkfvojbcxaptufsepupo` project deletion; favicon CDN purge; key
    rotation at go-live (all checklist items, Lee's side).

## PROD action list for Lee (consolidated)

- `supabase secrets set GMAIL_APP_PASSWORD=… SENDER_EMAIL=…` (tomorrow)
- Deploy batch: `member-self-service` (NEW, PR 1/5), `complete-member-registration`
  (NEVER deployed, #38), `ai-run` (#55), `auth-email-hook` (#62/#64 + dashboard
  hook cutover + SEND_EMAIL_HOOK_SECRET), `staff-send-invite` (#67),
  `partner-apply` (#68), `partner-register`, `send-member-update-request`,
  `notify-admin` (cors)
- Delete archived functions from prod: the 9 growth fns + `outreach-followup-runner`
  (#61/#65)
- SOS functions (`sos-alert-resolve`, `sos-drill`, `sos-alert-escalate`):
  deploy at the drill window, not before
- Check RESEND_API_KEY presence (your secrets list); confirm Email Settings
  provider toggle reads Gmail
- 24h cron clean-run re-check (overdue since 2026-07-23)
- Paste the staff-register log (item 21)
