# ICE Alarm España — Complete Technical Specification

Reference document for the application as it currently exists. Generated 2026-06-16.
Use this to diff a rebuild against the live codebase. Every section cites source files.

---

## 1. Overview & Architecture

- **Stack:** React 18 + Vite 5 + TypeScript 5, Tailwind CSS v3, shadcn/ui, TanStack Query, react-router-dom, i18next (EN/ES). See `package.json`, `vite.config.ts`, `tailwind.config.ts`.
- **Backend:** Lovable Cloud (Supabase project `pduhccavshrhfkfbjgmj`). Postgres + Auth + Storage + Edge Functions + Realtime + pg_cron + pg_net.
- **Auxiliary services:** `gps-gateway/` Node.js TCP server for EV-07B GT06 protocol; `render-worker/` Docker Remotion/FFmpeg worker for Video Hub.
- **Portals (5):** Public, Client/Member (`/dashboard`), Partner (`/partner-dashboard`), Call-Centre/Staff (`/call-centre`), Admin (`/admin`). Routes wired in `src/App.tsx` (498 lines).
- **Auth model:** Supabase Auth users + role-resolution via `public.get_user_role_info(uuid)` returning `{is_staff, staff_role, is_partner, partner_id, member_id}`. Multi-role accounts supported (staff + member + partner simultaneously). Roles enum `app_role`: `super_admin | admin | call_centre_supervisor | call_centre | partner | member` (`src/config/constants.ts`).
- **Route protection:** `src/components/auth/ProtectedRoute.tsx` with flags `requireStaff`, `requireAdmin`, `requireMember`, `requirePartner`.
- **Auth context:** `src/contexts/AuthContext.tsx` exposes user, session, role flags, member/partner IDs. Session idle timeout 30 min, warning 5 min before (`src/config/constants.ts`).
- **Languages:** English + Spanish. Selection modal on first visit (`src/components/LanguageSelectionModal.tsx`). i18n config `src/i18n/index.ts`.
- **Test admin login:** `admin@test.com` / `test1234` (changed from `leewakeman@hotmail.co.uk`).

---

## 2. Routes & Pages

All routes defined in `src/App.tsx` lines 330–490. Lazy-loaded via `lazyWithRetry`.

### 2.1 Public routes

| Path | Component | Purpose |
|---|---|---|
| `/` | `pages/Index.tsx` → `LandingPage.tsx` | Marketing home: hero, pendant features, pricing, testimonials, CTA to `/join`. |
| `/how-it-works` | `pages/HowItWorksPage.tsx` | Service explainer with EV-07B flow. |
| `/pendant` | `pages/PendantPage.tsx` | EV-07B product spec page (battery, fall detection, GPS, IP67, SIM). |
| `/contact` | `pages/ContactPage.tsx` | Contact form → `leads` table + `notify-admin` edge fn. |
| `/terms` | `pages/TermsPage.tsx` | Terms of service (`components/legal/TermsContent.tsx`). |
| `/privacy` | `pages/PrivacyPage.tsx` | GDPR-compliant privacy policy. |
| `/blog` | `pages/blog/BlogListPage.tsx` | Published blog index. Data: `blog_posts` (status=published). |
| `/blog/:slug` | `pages/blog/BlogPostPage.tsx` | Article view, JSON-LD, partner referral attribution. |
| `/help` | `pages/KnowledgeBasePage.tsx` | Public FAQ from `documentation` table. |
| `/join` | `pages/join/JoinWizard.tsx` | 7-step signup wizard. Persists to `registration_drafts` after every step. Final step → `submit-registration` → Stripe/Mollie checkout. |
| `/member-update` | `pages/MemberUpdatePage.tsx` | Token-validated public form for members to update profile/medical info without login. |
| `/r/:partnerCode` and `/r/:partnerCode/:postSlug` | `pages/ReferralRedirect.tsx` | Tracks partner-share click (`increment_partner_link_clicks`, sets `partner_referral` localStorage for 30 days), redirects to `/join` or blog post. |
| `*` | `pages/NotFound.tsx` | 404. |

### 2.2 Auth routes

| Path | Component | Notes |
|---|---|---|
| `/login` | `pages/auth/Login.tsx` | Email/password + Google OAuth. Post-login redirects by role: admin→`/admin`, call_centre→`/call-centre`, partner→`/partner-dashboard`, member→`/dashboard`. |
| `/register` | redirect → `/join` | Legacy. |
| `/forgot-password` | `pages/auth/ForgotPassword.tsx` | Sends reset email via `auth-email-hook`. |
| `/reset-password` | `pages/auth/ResetPassword.tsx` | Password reset landing. |
| `/complete-registration` | `pages/auth/CompleteRegistration.tsx` | Forces incomplete members to finish profile. |
| `/staff/login` | `pages/auth/StaffLogin.tsx` | Separate branded staff login. |
| `/staff/invite` | `pages/staff/StaffInvitePage.tsx` | Token-based staff onboarding (`staff-validate-invite` + `staff-complete-invite`). |
| `/unauthorized` | `pages/auth/Unauthorized.tsx` | RBAC reject. |

### 2.3 Client/Member portal (`/dashboard`, guarded by `requireMember`)

Layout: `components/layout/ClientLayout.tsx` (sidebar nav, header w/ language + notifications + chat).

| Path | Component | Shows / Actions |
|---|---|---|
| `/dashboard` | `pages/client/ClientDashboard.tsx` | Subscription status, device status (battery/last-seen via `useDeviceRealtime`), recent alerts, messages, quick actions. |
| `/dashboard/profile` | `pages/client/ProfilePage.tsx` | Edit personal info, address, language preference. Mutates `members`. |
| `/dashboard/medical` | `pages/client/MedicalInfoPage.tsx` | Medical conditions, medications, blood type, allergies. Mutates `medical_information`. |
| `/dashboard/contacts` | `pages/client/EmergencyContactsPage.tsx` | Up to 3 emergency contacts (`LIMITS.EMERGENCY_CONTACTS`). CRUD on `emergency_contacts`. |
| `/dashboard/device` | `pages/client/DevicePage.tsx` | Pendant IMEI, SIM, battery, location map (`components/maps/LocationMap.tsx`), assignment status. |
| `/dashboard/subscription` | `pages/client/SubscriptionPage.tsx` | Plan, renewal date, billing frequency, cancel/upgrade. Calls `cancel-mollie-subscription`. |
| `/dashboard/alerts` | `pages/client/AlertHistoryPage.tsx` | List of past SOS/fall alerts with resolution notes. |
| `/dashboard/support` | `pages/client/SupportPage.tsx` | Open tickets (`internal_tickets`), AI chat widget, FAQ search. |
| `/dashboard/messages` | `pages/client/MessagesPage.tsx` | Realtime chat with staff via `conversations` + `messages`. |

### 2.4 Partner portal (`/partner-dashboard`, guarded by `requirePartner`)

Layout: `components/layout/PartnerLayout.tsx` + `PartnerSidebar.tsx` + `PartnerHeader.tsx`. Agreement gate via `AgreementRequiredModal.tsx`.

Public partner routes: `/partner` (`PartnerOnboarding`), `/partner/join` (`PartnerJoin`), `/partner/verify` (`PartnerVerify`, email token), `/partner/login` (`PartnerLogin`), `/partner/invite` (`PartnerInvitePage`, admin-initiated token onboarding).

| Path | Component | Shows / Actions |
|---|---|---|
| `/partner-dashboard` | `pages/partner/PartnerDashboard.tsx` | Stats (referrals, commissions, active members), care/residential dashboards (`components/partner/CareDashboard.tsx`, `ResidentialDashboard.tsx`), recent leads pipeline. |
| `/partner-dashboard/invites` | `pages/partner/PartnerInvitesPage.tsx` | Manage `partner_invites` (send invite, copy link, view conversions). |
| `/partner-dashboard/marketing` | `pages/partner/PartnerMarketingPage.tsx` | Shared blog posts, tracked links, copy caption/WhatsApp/Email share, stats per link from `partner_post_links` + `partner_clicks` + `partner_attributions`. |
| `/partner-dashboard/commissions` | `pages/partner/PartnerCommissionsPage.tsx` | List of `partner_commissions` (pending, pending_release, approved, paid). |
| `/partner-dashboard/agreement` | `pages/partner/PartnerAgreementPage.tsx` | View / accept `partner_agreements` (content from `src/content/partnerAgreementTerms.ts`). |
| `/partner-dashboard/settings` | `pages/partner/PartnerSettingsPage.tsx` | Org profile, contact, payout details, partner_type. |
| `/partner-dashboard/members` | `pages/partner/PartnerMembersPage.tsx` | Residential partner roster (`partner_members`). CRUD residents. |
| `/partner-dashboard/alerts` | `pages/partner/PartnerAlertsPage.tsx` | Real-time SOS feed for residents (`usePartnerAlertNotifications`, `partner_alert_notifications`). |
| `/partner-dashboard/support` | `pages/partner/PartnerSupportPage.tsx` | Tickets + presentations (`partner_presentations` private bucket, signed URLs). |

### 2.5 Call-Centre / Staff portal (`/call-centre`, guarded by `requireStaff`)

Layout: `components/layout/CallCentreLayout.tsx` + `CallCentreSidebar.tsx` + `CallCentreHeader.tsx` (presence heartbeat via `useStaffHeartbeat`).

| Path | Component | Shows / Actions |
|---|---|---|
| `/call-centre` | `pages/call-centre/StaffDashboard.tsx` | Personal dashboard: my shifts, my tasks, my tickets, holiday balance, pending covers. |
| `/call-centre/alerts` | `pages/call-centre/CallCentreDashboard.tsx` | Live alerts queue (incoming, in_progress) with realtime subscription `useAlertsRealtime`. |
| `/call-centre/sos-alert` | `pages/call-centre/SOSAlertPage.tsx` | Active SOS takeover screen: `SOSTakeoverScreen`, `SOSVitalsStrip`, `SOSSituationPanel`, `SOSMedicalPanel`, `SOSActionPanel`. Uses `useSOSConference`, `useSOSTakeover`, `useEscalationChain`. Actions: accept, join conference, escalate, resolve, false-alarm. |
| `/call-centre/members` | `pages/call-centre/MembersPage.tsx` | Member search (`MemberQuickSearch`) + list. |
| `/call-centre/members/:id` | `pages/admin/MemberDetailPage.tsx` (shared) | Full member view: profile, medical, alerts, device, notes, interactions. |
| `/call-centre/shift-notes` | `pages/call-centre/ShiftNotesPage.tsx` | `shift_notes` CRUD for handover. |
| `/call-centre/shift-history` | `pages/call-centre/ShiftHistoryPage.tsx` | Past shifts worked. |
| `/call-centre/preferences` | `pages/call-centre/StaffPreferencesPage.tsx` | Notification + display prefs. |
| `/call-centre/messages` | `pages/call-centre/MessagesPage.tsx` | Realtime chat with members. |
| `/call-centre/tasks` | `pages/call-centre/TasksPage.tsx` | `tasks` assigned to staff. |
| `/call-centre/tickets` | `pages/call-centre/TicketsPage.tsx` | `internal_tickets` queue with comments (`ticket_comments`). |
| `/call-centre/leads` | `pages/call-centre/LeadsPage.tsx` | Inbound `leads` qualification. |
| `/call-centre/documents` | `pages/call-centre/DocumentsPage.tsx` | KB / SOPs (`documentation` table). |
| `/call-centre/holidays` | `pages/call-centre/HolidaysPage.tsx` | Request leave, view balance, accept covers (`staff_holidays`, `staff_shift_covers`). |

### 2.6 Admin portal (`/admin`, guarded by `requireStaff requireAdmin`)

Layout: `components/layout/AdminLayout.tsx` + `AdminSidebar.tsx` + `AdminHeader.tsx`.

| Path | Component | Purpose |
|---|---|---|
| `/admin` | `AdminDashboard.tsx` | KPIs from `get_admin_dashboard_stats()` + `get_sales_command_stats()`: active members, new 30d, active alerts, devices, pending orders, monthly revenue, expiring subs. |
| `/admin/members` | `MembersPage.tsx` | Full member CRUD, filters, export. |
| `/admin/members/new` | `AddMemberWizard.tsx` | 7-step admin-driven member creation. |
| `/admin/members/:id` | `MemberDetailPage.tsx` | Tabs: Overview, Medical, Emergency Contacts, Subscription, Device, Alerts, Notes, Interactions, Communications, GDPR. |
| `/admin/devices` | `DevicesPage.tsx` | EV-07B inventory + assignments. |
| `/admin/devices/:id` | `DeviceDetailPage.tsx` | Device telemetry, SMS commands, provisioning. |
| `/admin/ev07b` | `EV07BPage.tsx` | Stock sync from supplier (`ev07b-stock-sync`), bulk import. |
| `/admin/finance` | `FinanceDashboard.tsx` | Revenue charts, MRR/ARR, churn. |
| `/admin/orders` | `OrdersPage.tsx` | All orders + items, status updates (delivered triggers commission). |
| `/admin/subscriptions` | `SubscriptionsPage.tsx` | All subscriptions, cancel/refund. |
| `/admin/payments` | `PaymentsPage.tsx` | Stripe + Mollie payment log. |
| `/admin/alerts` | `AlertsPage.tsx` | Historical alert search/export. |
| `/admin/staff` | `StaffPage.tsx` | Staff list, invite (`staff-send-invite`), activate/deactivate. |
| `/admin/staff/:staffId` | `StaffDetailPage.tsx` | HR profile, documents, activity log. |
| `/admin/rota` | `RotaPage.tsx` | Shift scheduling grid (`staff_shifts`, `check_shift_coverage`). |
| `/admin/holidays` | `HolidaysPage.tsx` | Approve/deny holiday requests. |
| `/admin/reports` | `ReportsPage.tsx` | Export reports (PDF/CSV via `useReportExport`). |
| `/admin/analytics` | `AnalyticsPage.tsx` | Web analytics (`website_events`, `useMarketingAnalytics`). |
| `/admin/settings` | `SettingsPage.tsx` | `system_settings` (Twilio, Stripe, Mollie, Gmail, Resend keys, company info). |
| `/admin/messages` | `MessagesPage.tsx` | Global message inbox. |
| `/admin/tasks` | `TasksPage.tsx` | Task assignment & tracking. |
| `/admin/tickets` | `TicketsPage.tsx` | Internal ticket triage. |
| `/admin/notifications` | `NotificationsPage.tsx` | `notification_settings` + `notification_log`. |
| `/admin/leads` | `LeadsPage.tsx` | Inbound leads pipeline. |
| `/admin/partners` | `PartnersPage.tsx` | All partners; status filter (active, invited, pending, suspended). |
| `/admin/partners/new` | `AddPartnerPage.tsx` | Admin direct partner creation. |
| `/admin/partners/:id` | `PartnerDetailPage.tsx` | Partner profile, members, commissions, agreement, presentations. |
| `/admin/partners-qa` | `PartnersQAPage.tsx` | Partner verification queue. |
| `/admin/commissions` | `CommissionsPage.tsx` | All `partner_commissions`, mark as paid. |
| `/admin/partner-pricing` | `PartnerPricingSettingsPage.tsx` | Bespoke tiers (`partner_pricing_tiers`). |
| `/admin/crm-import` | `CRMImportPage.tsx` | CSV upload, mapping, validation (`crm_import_batches`, `crm_import_rows`). |
| `/admin/crm-import/batches` | `ImportBatchesPage.tsx` | Batch history. |
| `/admin/crm-contacts` | `CRMContactsPage.tsx` | All CRM contacts list. |
| `/admin/crm-contacts/:id` | `CRMContactDetailPage.tsx` | Contact detail + events timeline. |
| `/admin/ai` | `AIBehaviorsPage.tsx` | List of 5 AI agents with edit access. |
| `/admin/ai/agents/:agentKey` | `AIAgentDetail.tsx` | Edit system prompt, model, mode (`draft_only` / `auto_act`). |
| `/admin/ai/operations` | `IsabellaOperationsPage.tsx` | 50 capability toggles, 10 categories, JSON config viewer (see §6.2). |
| `/admin/media-manager` | `MediaManagerPage.tsx` | Content calendar (`media_content_calendar`), Facebook publishing, partner distribution. |
| `/admin/ai-outreach` | `AIOutreachPage.tsx` | B2B outreach Kanban (12 stages), campaign controls, dry run. |
| `/admin/video-hub` | `VideoHubPage.tsx` | Video projects, templates, renders, exports, YouTube publishing. |
| `/admin/communications` | `CommunicationsDashboardPage.tsx` | Email/SMS/voice/WhatsApp activity. |
| `/admin/blog` | `BlogManagerPage.tsx` | Blog editor, scheduling, partner distribution. |
| `/admin/audit-log` | `AuditLogPage.tsx` | `activity_logs` + `staff_activity_log`. |
| `/admin/sla` | `SLADashboardPage.tsx` | SLA metrics, breaches. |
| `/admin/feedback` | `FeedbackDashboardPage.tsx` | NPS / feedback submissions. |
| `/admin/testimonials` | `TestimonialsPage.tsx` | Manage `testimonials`. |

---

## 3. Database Schema (105 tables)

Live schema in Supabase project `pduhccavshrhfkfbjgmj`. Tables grouped by domain. Source: migrations `supabase/migrations/*.sql` (120 files).

### 3.1 Core operations

- **members** (27 cols, 4 policies) — user_id (FK auth.users), names, NIE, DOB, address, language, status (`active|inactive|suspended|deleted`), partner_id (attribution), created_at. PK id (uuid).
- **medical_information** (11 cols, 5 policies) — member_id, blood_type, conditions[], medications[], allergies[], doctor_name, doctor_phone, notes.
- **emergency_contacts** (11 cols, 4 policies) — member_id, name, relationship, phone, email, priority (1-3), authorized_for_health_info.
- **devices** (26 cols, 3 policies) — imei (unique), sim_number, sim_iccid, model (EV-07B), status (`in_stock|assigned|active|inactive|faulty`), member_id, battery_level, last_seen_at, last_location (lat/lng), firmware, sim_expiry_date.
- **subscriptions** (14 cols, 3 policies) — member_id, plan (`single|couple`), billing_frequency (`monthly|annual`), amount, status, start_date, renewal_date, mollie_customer_id, stripe_subscription_id.
- **orders** (21 cols, 3 policies) — member_id, status (`pending|processing|shipped|delivered|cancelled|refunded`), total, shipping_address, tracking, payment_provider.
- **order_items** (13 cols, 3 policies) — order_id, product_id, name, qty, unit_price, tax_rate.
- **payments** (13 cols, 3 policies) — order_id, member_id, amount, currency (EUR), status (`pending|completed|failed|refunded`), provider, stripe_payment_id, mollie_payment_id, paid_at.
- **products** (11 cols, 4 policies) — name, sku, price_net, tax_rate, type (membership/device/shipping).
- **registration_drafts** (14 cols, 4 policies) — IP-rate-limited progressive save during `/join`. Includes session_id, step, data (jsonb).
- **member_update_tokens** (8 cols, 1 policy) — single-use tokens for `/member-update`.
- **activity_logs** (9 cols, 2 policies) — generic actor/action/entity audit.

### 3.2 CRM & communications

- **crm_contacts** (23 cols, 2 policies) — unified contact (lead/member/partner), source, attribution.
- **crm_profiles** (10 cols) — enriched profile data.
- **crm_events** (6 cols, 3 policies) — event log (sale.paid, partner.created, etc.) feeding Main Brain.
- **crm_import_batches / crm_import_rows** — CSV import staging.
- **conversations** (15 cols, 5 policies) — member↔staff chat thread.
- **conversation_messages / messages** — message bodies (legacy + new tables).
- **conversation_calls** — call records per conversation.
- **member_notes** (11 cols) — staff notes on members.
- **member_interactions** — timeline events.
- **member_contact_methods** — preferred channels.
- **internal_tickets** (13 cols, 4 policies) — support tickets w/ comments table `ticket_comments`.
- **tasks** (13 cols, 2 policies) — assignable tasks.
- **leads** (19 cols, 4 policies) — inbound contact-form leads + outreach-sourced.
- **notification_log / notification_settings** — in-app notifications targeted by `admin_user_id` (null=all staff).
- **email_log / email_settings / email_templates** — outbound email (Gmail SMTP + Resend).
- **inbound_email_log** — email-inbound-webhook captures.
- **documentation** (15 cols, 3 policies) — KB articles (categories: emergency, device, staff, general, member_guide, partner).
- **testimonials** (12 cols, 5 policies) — public testimonials.
- **admin_ideas** (11 cols, 5 policies) — Lee's ideas backlog.

### 3.3 Partner ecosystem

- **partners** (37 cols, 4 policies) — user_id, organization_name, partner_type (referral/care/residential), partner_code, CIF/NIF, contact, payout details, status (`pending|invited|active|suspended|deleted`), agreement_accepted_at.
- **partner_admin_invites** (9 cols, 1 policy) — admin-initiated invite tokens (status `pending|completed|expired|revoked`).
- **partner_invites** (13 cols, 4 policies) — referral invite tokens that partners send to leads.
- **partner_verification_tokens** — email verification.
- **partner_members** (8 cols, 2 policies) — residents under a residential partner.
- **partner_pricing_tiers** (14 cols, 2 policies) — bespoke pricing per partner.
- **partner_agreements** (14 cols, 3 policies) — signed agreements.
- **partner_commissions** (14 cols, 3 policies) — €50 gross commissions, status (`pending|pending_release|approved|paid|cancelled`), order_id link, release_at.
- **partner_post_links** (13 cols, 3 policies) — tracked share URLs (`/r/<code>/<slug>`).
- **partner_clicks** (9 cols, 3 policies) — click events per tracked link.
- **partner_attributions** (9 cols, 3 policies) — attribution at signup/purchase.
- **partner_presentations** (9 cols, 4 policies) — sales decks, private bucket, 1h signed URLs.
- **partner_alert_subscriptions** — which partner gets which member alerts.
- **partner_alert_notifications** (8 cols, 3 policies) — alert delivery log to partners.

### 3.4 AI & SOS response

- **alerts** (22 cols, 3 policies) — member_id, type (`sos_button|fall_detected|low_battery|offline|inactivity`), status (`incoming|in_progress|resolved|cancelled`), severity, created_at, accepted_by (staff_id), accepted_at, resolved_at, resolution_notes, is_false_alarm, conference_id, member_responded, member_response_at.
- **conference_rooms** (9 cols, 1 policy) — Twilio conference per alert (`sos-<alert_id>`), status `active|ended`, ended_at.
- **conference_participants** (12 cols, 1 policy) — type (`member|staff|ai|emergency_contact`), name, phone, joined_at, left_at, join_method.
- **alert_escalations** (10 cols, 1 policy) — 5 escalation levels: Browser → Mobile → Supervisor → Admin → Emergency Contacts. Tracks triggered_at, acknowledged_at, escalated_to.
- **alert_communications** (13 cols) — comm log per alert (SMS/voice/WhatsApp).
- **isabella_assessment_notes** (6 cols, 1 policy) — note_type (`triage_decision|member_response|flag|observation`), content, is_critical.
- **isabella_settings** (8 cols, 2 policies) — 50 function toggles (see §6.2). Cols: id, function_key, enabled, enabled_at, enabled_by, config (jsonb), created_at, updated_at.
- **ai_agents** (10 cols, 3 policies) — 5 agents (see §6.1). Cols: agent_key, name, description, mode (`draft_only|auto_act`), avatar_url, instance_count, enabled.
- **ai_agent_configs** (12 cols, 2 policies) — versioned system prompts: agent_id, system_instruction, business_context, tool_policy, language_policy, read_permissions, write_permissions, triggers, version, is_active.
- **ai_actions** (10 cols, 2 policies) — proposed/pending/approved AI actions.
- **ai_runs** (11 cols, 2 policies) — agent execution log.
- **ai_events** (8 cols, 2 policies) — trigger event log.
- **ai_memory** (9 cols, 2 policies) — persistent memory per agent/entity.
- **voice_call_sessions** (13 cols, 2 policies) — Twilio call sessions.

### 3.5 Staff & scheduling

- **staff** (38 cols, 2 policies) — user_id, names, NIE, social_security, position, contract_type, role (app_role), is_active (generated), personal_mobile, escalation_priority (1-5), is_on_call, address, emergency contacts.
- **staff_shifts** (11 cols, 2 policies) — staff_id, shift_date, shift_type (`morning|afternoon|night`), status.
- **staff_shift_covers** (13 cols, 3 policies) — cover requests with expiration.
- **staff_holidays** (12 cols, 4 policies) — leave requests with annual balance.
- **staff_presence** (6 cols, 2 policies) — heartbeat (last_ping_at) for on-duty monitoring.
- **shift_alert_log** (7 cols, 1 policy) — dedup log for staff-shift-monitor alerts.
- **shift_notes** (7 cols, 2 policies) — handover notes per shift.
- **staff_documents** (8 cols, 2 policies) — contracts, CVs, NIE copies (private bucket `staff-documents`).
- **staff_activity_log** (6 cols, 2 policies) — staff profile/login audit.

### 3.6 Media & video hub

- **media_content_calendar** (28 cols) — scheduled bilingual posts.
- **media_topics / media_audiences / media_goals / media_topic_goals / media_image_styles / media_schedule_settings / media_publishing_history** — strategy config.
- **social_posts** (23 cols, 5 policies) — posts (blog + Facebook + IG), status (`draft|approved|scheduled|published|failed`), partner_distribution (none/all/selected).
- **social_post_metrics / social_post_research** — engagement + AI research notes.
- **blog_posts** (16 cols, 2 policies) — slug, title_en/es, content, status, partner_distribution.
- **video_projects / video_templates / video_renders / video_exports / video_brand_settings / video_outreach_links** — Video Hub (Remotion worker pipeline).
- **website_images** (9 cols, 2 policies) — managed image catalogue (bucket `website-images`).
- **website_events** (24 cols, 2 policies) — analytics events.

### 3.7 Outreach pipeline

- **outreach_raw_leads** (24 cols) — discovered raw leads.
- **outreach_crm_leads** (31 cols) — enriched leads in 12-stage Kanban.
- **outreach_campaigns** (23 cols) — campaign config.
- **outreach_email_drafts / outreach_email_threads** — AI-drafted emails + threads.
- **outreach_queued_tasks** — runner queue.
- **outreach_settings** (6 cols, 3 policies) — stage toggles, caps, dry-run.
- **outreach_suppression** (6 cols, 3 policies) — unsubscribe list.
- **outreach_daily_usage** — rate limits.
- **outreach_run_logs** (10 cols, 2 policies) — runner execution log.

### 3.8 Billing & integrations

- **system_settings** (5 cols, 4 policies) — key/value config. Prefix `settings_`. Keys: `settings_twilio_account_sid`, `settings_twilio_auth_token`, `settings_twilio_phone_number`, `settings_twilio_whatsapp_number`, `settings_stripe_secret_key`, `settings_stripe_webhook_secret`, `settings_mollie_api_key`, `settings_gmail_user`, `settings_resend_api_key`, `settings_company_*`, `settings_youtube_*`. Public SELECT on non-sensitive `settings_company_*`.
- **system_integrations** (16 cols, 4 policies) — integration status/health.
- **operational_costs** (11 cols, 4 policies) — recurring costs ledger.
- **feedback** — NPS submissions.

### 3.9 Database functions & triggers

SECURITY DEFINER functions (`search_path=public`):
- `is_staff(_user_id)`, `is_admin(_user_id)`, `is_partner(_user_id)` — RLS helpers.
- `has_role(_user_id, _role)` — role-table check (anti-recursion pattern).
- `get_staff_role(_user_id)` → `app_role`.
- `get_member_id(_user_id)`, `get_partner_id(_user_id)` → uuid.
- `get_user_role_info(_user_id)` → json (multi-role bundle, used by AuthContext).
- `get_admin_dashboard_stats()` → json.
- `get_sales_command_stats()` → json.
- `get_todays_birthdays()` → setof members.
- `check_shift_coverage(p_start, p_end)` → table.
- `expire_pending_covers()` → int.
- `generate_ticket_number()` → trigger.
- `increment_partner_link_clicks(link_id)` → void.
- `update_updated_at_column()`, `update_staff_updated_at()`, `update_video_updated_at()` — triggers.

No `auth`/`storage` schema triggers (Lovable Cloud rule).

---

## 4. Edge Functions (89)

All under `supabase/functions/<name>/index.ts`. Default `verify_jwt = false` per `supabase/config.toml`. Shared helpers in `_shared/`: `cors.ts` (whitelist CORS), `email.ts` (Gmail SMTP), `rate-limit.ts` (IP throttle), `validation.ts` (Zod schemas), `post-payment.ts` (shared Stripe+Mollie success handler).

### 4.1 AI orchestration

| Function | Trigger | External |
|---|---|---|
| `ai-run` | Inbound events from `ai-dispatch-events`, voice handler, cron. Reads `ai_agents` + `ai_agent_configs` system prompts, injects member/device/emergency-contact context, calls Lovable AI Gateway. | Lovable AI |
| `ai-dispatch-events` | Called when CRM events fire. Routes to `ai-run` per `isabella_settings.function_key`. | – |
| `ai-execute-action` | Executes approved `ai_actions` (e.g. send SMS, create task). | Twilio, internal |
| `notify-admin` | Sends WhatsApp/email to admin. Used by Main Brain. | Twilio WhatsApp, Resend |
| `notify-staff-whatsapp` | Staff WhatsApp blast (shift alerts). | Twilio WhatsApp |
| `isabella-assessment-log` | Writes to `isabella_assessment_notes`. Called by voice handler + safety logic. | – |
| `isabella-voice-handler` | Generates TwiML for Isabella inside SOS conferences (action, alert_id, member_name, attempt). | Twilio Voice |
| `generate-courtesy-calls` | Daily cron 06:00. Queues courtesy calls for eligible members. | – |

### 4.2 SOS / emergency

| Function | Purpose |
|---|---|
| `sos-inbound-router` | Routes inbound SOS triggers (pendant, app) to conference creation. |
| `sos-conference-create` | Idempotent. Creates `conference_rooms` row, updates `alerts.conference_id`, inserts member + Isabella AI participants. Returns conference_name `sos-<alert_id>`. |
| `sos-conference-join` | Adds staff/emergency contact to conference, dials Twilio. |
| `sos-conference-leave` | Marks participant `left_at`. |
| `sos-conference-status` | Returns active participants + status. |
| `sos-escalation-runner` | Walks 5-level escalation chain (Browser→Mobile→Supervisor→Admin→Emergency Contacts) per `alert_escalations`. |
| `sos-escalation-mobile` | Push notifications to staff mobile (FCM via `firebase-messaging-sw.js`). |
| `sos-alert-resolve` | Staff-initiated alert resolution. |
| `sos-false-alarm-resolve` | Isabella-initiated false alarm. Safety gates: ≥2 member responses required, no staff in conference. Logs to `isabella_assessment_notes` if refused. |
| `emergency-contact-notify` | Dials/SMSes emergency contacts on escalation L5. |

### 4.3 EV-07B pendant

| Function | Purpose |
|---|---|
| `ev07b-checkin` | Heartbeat/location/battery from device or `gps-gateway`. Updates `devices.last_seen_at`, `battery_level`, `last_location`. |
| `ev07b-sos-alert` | SOS button / fall webhook from gateway. Inserts `alerts` row, triggers conference creation. |
| `ev07b-offline-monitor` | Detects devices offline >X min, raises `alert.device_offline`, applies bulk_offline_alert threshold. |
| `ev07b-stock-sync` | Public endpoint (no JWT). Bulk import IMEI/SIM stock from supplier. |

### 4.4 Twilio voice / SMS / WhatsApp

| Function | Trigger |
|---|---|
| `voice-handler` | Twilio "A call comes in" webhook. Hardened, returns safe TwiML on any error. Default action = `incoming`. |
| `twilio-voice` | Thin wrapper that forwards to `voice-handler` (preserves legacy webhook URL). |
| `twilio-outbound` | Staff-initiated outbound calls. |
| `twilio-call-me` | Public "Call Me Back" widget from website (`CallMeModal.tsx`). |
| `twilio-sms` | Inbound SMS webhook. |
| `twilio-whatsapp` | Inbound WhatsApp webhook. |
| `twilio-token` | Issues capability tokens for browser softphone (`useTwilioDevice`). |
| `test-twilio` | Settings page "Test Connection" button. |

### 4.5 Stripe / Mollie / payments

| Function | Purpose |
|---|---|
| `create-checkout` | Stripe Checkout session from `/join` final step. Uses `settings_stripe_secret_key`. |
| `stripe-webhook` | Stripe events (checkout.session.completed → `_shared/post-payment.ts`). |
| `create-mollie-checkout` | Mollie first-payment with `sequenceType=first` to establish mandate. |
| `mollie-webhook` | Mollie payment status updates. Handles recurring. |
| `cancel-mollie-subscription` | Member-initiated subscription cancel. |
| `submit-registration` | Final step of `/join`: creates auth user, member, subscription, order, payment row; calls checkout. |
| `process-commissions` | Daily cron 02:00. Auto-approves `pending_release` commissions after 7 days if account active. |

### 4.6 Email

| Function | Purpose |
|---|---|
| `send-email` | Generic Gmail SMTP send (`_shared/email.ts`). |
| `send-test-email` | Settings test. |
| `auth-email-hook` | Supabase Auth hook. Renders branded React Email templates (`_shared/email-templates/`) for signup, recovery, magic-link, invite, email-change, reauthentication. Uses `notify.icealarm.es`. |
| `email-inbound-webhook` | Inbound email parser → `inbound_email_log`. |
| `send-member-update-request` | Sends `/member-update` token email. |
| `validate-member-update-token` / `submit-member-update` | Public token validation + submit. |

### 4.7 Partner lifecycle

`partner-admin-invite`, `partner-admin-create`, `partner-admin-delete`, `partner-send-invite`, `partner-validate-invite`, `partner-complete-invite`, `partner-register`, `partner-verify`, `partner-alert-notify`, `track-invite-view`, `track-referral-click`.

### 4.8 Staff lifecycle

`staff-register`, `staff-send-invite`, `staff-validate-invite`, `staff-complete-invite`, `staff-shift-monitor` (cron every 2 min — heartbeat check + WhatsApp alert), `shift-daily-reminders` (cron 19:00 — tomorrow's shift reminders + cover expiry).

### 4.9 Outreach

`outreach-pipeline-runner` (orchestrates), `outreach-enrich-lead`, `rate-outreach-leads`, `outreach-generate-drafts`, `outreach-send-email` (Gmail SMTP w/ unsubscribe footer), `outreach-followup-runner`, `outreach-topic-insights`, `outreach-unsubscribe` (public).

### 4.10 Content & media

`generate-content-plan`, `generate-slot-content`, `generate-ai-image` (Lovable AI image), `media-draft`, `repurpose-content`, `publish-scheduled`, `facebook-publish`, `facebook-metrics`, `facebook-unpublish`, `generate-sitemap`.

### 4.11 Video Hub

`video-render-queue` (enqueues to Remotion worker), `video-render-webhook` (worker callback).

### 4.12 YouTube

`youtube-oauth-start`, `youtube-oauth-callback`, `youtube-integration-status`, `youtube-disconnect`, `youtube-publish` — channel `UCT9_R7Czan0lPFvq5XyV5kg`.

### 4.13 GDPR & admin

`gdpr-delete-member` (compliance window 30d), `save-registration-draft` (rate-limited 20/15min, 50KB cap), `save-api-keys`.

---

## 5. Integrations

### 5.1 Twilio

- **Credentials:** Account SID + Auth Token (API Keys deprecated). Stored in `system_settings` as `settings_twilio_account_sid`, `settings_twilio_auth_token`, `settings_twilio_phone_number`, `settings_twilio_whatsapp_number`.
- **Voice — inbound:** Webhook → `voice-handler`. Wrapped by `twilio-voice` for legacy URL. Uses standard `alice` voice for TwiML fallback. Hardened with global try/catch returning safe TwiML.
- **Voice — outbound (staff):** `twilio-outbound`. Separate path to avoid coupling with AI logic.
- **Voice — public callback:** `twilio-call-me` from website CallMeModal.
- **Voice — Isabella TwiML:** `isabella-voice-handler` generates speech for in-conference Isabella, bilingual (EN/ES), max attempts logic.
- **Conferences:** SOS conference rooms named `sos-<alert_id>`. Lifecycle: create → member dialed → Isabella joins → staff joins on accept → emergency contacts on L5 escalation → end. Tracked in `conference_rooms` + `conference_participants`.
- **SMS:** Inbound webhook `twilio-sms`. Outbound from `ai-execute-action`, payment reminders, shift alerts.
- **WhatsApp:** Inbound `twilio-whatsapp`. Outbound primarily from Main Brain for `sale.paid` events (admin only, English), bulk_offline, emergency escalations, shift monitor alerts.
- **Browser softphone:** `useTwilioDevice` hook + `twilio-token` capability tokens for staff dashboard.

### 5.2 Stripe (BYOK, legacy)

- Secret: `settings_stripe_secret_key`, `settings_stripe_webhook_secret`.
- Flow: `/join` → `create-checkout` → Stripe Checkout → `stripe-webhook` (`checkout.session.completed`) → `_shared/post-payment.ts` → member/subscription/order activation → Main Brain `sale.paid` event.

### 5.3 Mollie (primary EU billing)

- Secret: `settings_mollie_api_key`. Endpoint `https://api.mollie.com/v2`.
- `create-mollie-checkout`: creates customer → first payment `sequenceType=first` to establish mandate → returns hosted checkout URL.
- `mollie-webhook`: polls payment status, updates `payments`, triggers post-payment handler. Recurring payments handled via stored mandate + customer_id on `subscriptions.mollie_customer_id`.
- `cancel-mollie-subscription`: member-facing cancel.

### 5.4 Email (Gmail SMTP + Resend)

- **Primary outbound:** Gmail SMTP via `_shared/email.ts` (secret `GMAIL_APP_PASSWORD`, user from `settings_gmail_user`). Used by send-email, partner-*, staff-*, outreach-send-email, gdpr-delete-member, emergency-contact-notify, shift-daily-reminders.
- **Branded auth emails:** `auth-email-hook` uses `@lovable.dev/email-js` + React Email templates in `_shared/email-templates/`. Domain `notify.icealarm.es`. Brand color `#E74C3C`. Logo in `email-assets` public bucket.
- **Resend:** `partner-alert-notify` only (key `RESEND_API_KEY`).
- **Inbound:** `email-inbound-webhook` → `inbound_email_log`.

### 5.5 Facebook / Social

- `facebook-publish`: posts to FB page, generates partner tracked links per `social_posts.partner_distribution`. Updates post metadata on publish.
- `facebook-metrics`: pulls engagement → `social_post_metrics`.
- `facebook-unpublish`: takedown.
- Coordination logic: Blog-First (blog published before linked Facebook post). Safeguard: detects existing blog row by social_post id to avoid dupes.

### 5.6 EV-07B pendant + GPS gateway

- **Device:** Generic EV-07B Pendant (GPS, fall detection, SOS button, 2G/4G SIM, IP67).
- **Gateway:** `gps-gateway/` — Node.js TCP server implementing GT06 protocol (`src/gt06-parser.js`, `src/server.js`, `src/forwarder.js`). Dockerised. Forwards parsed events to `ev07b-checkin` and `ev07b-sos-alert` edge functions over HTTPS.
- **Edge flow:** Gateway → `ev07b-checkin` (heartbeat/location/battery) updates `devices`. SOS button / fall → `ev07b-sos-alert` → inserts `alerts` (type `sos_button` or `fall_detected`) → triggers conference creation via `sos-conference-create` → Isabella joins → staff escalation chain.
- **Stock sync:** `ev07b-stock-sync` (no-JWT) for supplier bulk IMEI/SIM uploads, used by Admin EV07BPage.
- **Offline monitor:** `ev07b-offline-monitor` polls `devices.last_seen_at`, raises offline alerts and aggregates for `bulk_offline_alert` Isabella function (threshold 3 devices in 60 min).

### 5.7 Google / YouTube

- Google OAuth used for member login (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
- YouTube: OAuth via `youtube-oauth-start` → `youtube-oauth-callback` stores refresh token. `youtube-publish` uploads MP4 + caption from Video Hub renders. Channel `UCT9_R7Czan0lPFvq5XyV5kg`. Restricted to approved video projects.

### 5.8 Firebase / push notifications

- `public/firebase-messaging-sw.js` + `src/lib/firebase.ts` + `usePushNotifications`. Push targets staff mobile for SOS L2 escalation.

### 5.9 Sentry

- `src/lib/sentry.ts` — error monitoring. Initialised in `src/main.tsx`.

### 5.10 Lovable AI Gateway

- All LLM calls via `LOVABLE_API_KEY` from `ai-run`, `generate-ai-image`, `generate-content-plan`, `generate-slot-content`, `media-draft`, `outreach-generate-drafts`, `rate-outreach-leads`, `outreach-enrich-lead`, `outreach-topic-insights`, `repurpose-content`.

---

## 6. Isabella AI

### 6.1 Agents roster (5)

Stored in `ai_agents` table; system prompts in `ai_agent_configs.system_instruction` (versioned, `is_active=true`).

| `agent_key` | Name | Mode | Description |
|---|---|---|---|
| `customer_service_expert` | Customer Service & Sales Expert | `auto_act` (2 instances) | 24/7 sales + service first-line contact (also voice agent "Isabel"). |
| `member_specialist` | Member Support Specialist | `draft_only` | Logged-in member assistant with profile/device/sub access. |
| `staff_support_specialist` | Staff Support Specialist | `draft_only` | Call-centre operator AI helper. |
| `media_manager` | ICE Media Manager | `draft_only` | Facebook content drafts (bilingual EN/ES). |
| `main_brain` | Main Brain | `auto_act` | Central orchestrator + Boss/Admin notifier. |

Full system prompts are stored live; representative excerpts below (full text in `ai_agent_configs`):

**Customer Service & Sales Expert** — first contact for sales, leads, general service. Language rule: detect first interaction, never mix EN/ES. Verifies identity for high-risk inbound requests (Name + DOB + NIE), hands off to Member Support Specialist once verified. Voice behaviour: 1-2 sentences/turn, one question at a time. **Boundaries: no medical advice, no emergency handling, no record modification, no CRM notes unless instructed.**

**Member Support Specialist** — personalized for logged-in/verified members. Reason-first handling. High-risk = billing + data changes. 2-failed-verification → mandatory `[ESCALATE]`. Authorized to add notes/tasks; prohibited from modifying sensitive data.

**Staff Support Specialist** — procedure guidance, member lookups, shift ops, escalation guidance. "Always prioritize member safety — when in doubt, recommend escalation."

**ICE Media Manager** — drafts only, always-CTA, bilingual JSON output. Forbidden phrases: "Will save your life", "Prevents death", "Guaranteed emergency response", "Medical device" (unless qualified), "Cure/Treat/Heal".

**Main Brain** — orchestrator. Sends WhatsApp to admin **only** for `sale.paid` events (avoids noise). English to admin. Notifications include member, language, amount, partner attribution.

### 6.2 50 capability toggles (`isabella_settings`)

10 categories with current default-enabled state from live DB:

**Alert Handling (4):** `device_offline_response` (off), `low_battery_alerts` (off), `sos_button_triage` (off, critical), `fall_detection_triage` (off, critical).

**Inbound Communications (5):** `inbound_phone_calls`, `inbound_sms`, `inbound_whatsapp`, `inbound_email` (all off), `chat_widget` (**on**).

**Outbound Communications (6):** `courtesy_calls`, `welcome_calls`, `onboarding_checkins`, `payment_reminders`, `followup_calls`, `birthday_calls` (all off).

**Sales & Leads (4):** `lead_followup_calls`, `abandoned_signup_recovery`, `partner_enquiry_handling`, `b2b_outreach_campaigns` (all off).

**Boss / Owner Intelligence (7):** `new_sale_notification` (**on**, channels in_app+email+whatsapp), `cancellation_alert` (**on**), `failed_payment_escalation` (off), `daily_boss_briefing` (**on**, 08:00 Europe/Madrid), `weekly_revenue_summary` (off), `emergency_escalation_alert` (**on**, critical), `negative_feedback_alert` (**on**, nps_threshold=6).

**Member Lifecycle (6):** `membership_anniversary` (off), `inactivity_check` (**on**, 5 days), `subscription_renewal_reminder` (off), `medical_profile_incomplete` (**on**, 3 nudges), `device_not_activated` (**on**, 7 days), `upgrade_suggestion` (off).

**Device & Infrastructure (5):** `stock_low_alert` (off), `device_health_monitor` (off, flap threshold 3/6h), `sim_expiry_warning` (off, 30d), `bulk_offline_alert` (**on**, 3 devices/60min, critical), `provisioning_stalled` (off, 48h).

**Partner Network (5):** `new_partner_signup` (**on**), `partner_first_referral` (off), `partner_commission_due` (off, €50 threshold), `partner_inactive_warning` (off, 30d), `partner_agreement_expiring` (off, 30d).

**Content & Marketing (5):** `auto_generate_scheduled_content`, `content_approval_reminder`, `auto_publish_approved_content`, `blog_post_performance`, `social_engagement_alert` (all off).

**Compliance & Legal (5):** `gdpr_deletion_request` (**on**, 30d window, critical), `gdpr_export_request` (**on**, 30d window), `sla_breach_alert` (**on**, critical), `audit_anomaly_detection` (off), `operational_cost_due` (off, 7d before).

**Staff Rota & Scheduling (3):** `shift_notifications`, `holiday_management`, `shift_cover_workflow` (off).

Mapping (`src/lib/isabella-function-config.ts`) binds each `function_key` to an `agent_key`, `triggers[]`, `capabilities[]`, optional `notify_roles[]`, `critical` flag. Helpers `isIsabellaFunctionEnabled(key)` and `getIsabellaFunctionConfig(key)`.

### 6.3 Hard rules / non-negotiables

Across all agents:

1. **Never provide medical advice or make medical decisions.** Symptom guidance is strictly observational.
2. **Never claim to call, dispatch, or guarantee emergency services.** Compliant wording only ("connects to emergency response").
3. **Never claim outcomes:** no "saves your life", "prevents death", "cures", "treats", "heals", "guaranteed response".
4. **Never automatically publish content.** Media Manager is `draft_only`; auto-publish requires Isabella toggle + human approval.
5. **Never modify sensitive member data autonomously.** Member Support Specialist may add notes/tasks only.
6. **Never request identity verification on outbound calls.** Outbound calls do not perform Name/DOB/NIE checks (explicit forbidden behaviour).
7. **Mandatory `[ESCALATE]` to human after 2 failed verification attempts** on inbound high-risk requests.
8. **Reason-first inbound handling.** Understand the issue before asking for data.
9. **Risk-based verification.** Identity check (Full Name + DOB + NIE) required ONLY for high-risk inbound (billing, subscription changes, personal data). NOT for general enquiries.
10. **Language lock.** Detect on first turn; never mix EN/ES; ask politely if unclear.
11. **Voice cadence.** 1–2 sentences per turn; one question at a time; confirm important info by repeating.
12. **False-alarm autonomous resolution gates (`sos-false-alarm-resolve`):**
    - Member must have responded to ≥2 of Isabella's questions (`isabella_assessment_notes.note_type='member_response'`).
    - No staff has joined the conference yet.
    - Alert must still be `incoming` or `in_progress`.
    - If refused: logs critical flag, escalates to staff. Does NOT notify emergency contacts.
13. **Main Brain admin WhatsApp** is ONLY for `sale.paid`. Other sale lifecycle events do not trigger WhatsApp.
14. **Main Brain notifies in English** regardless of member language.
15. **Always Human (UI section)** — explicitly excluded functions: legal disputes, medical decisions, emergency dispatch judgement, critical refund authorisations.

### 6.4 Escalation chain (5 levels)

Implemented in `alert_escalations` + `sos-escalation-runner` + `useEscalationChain.ts`. Order:

1. **Browser** — staff with open call-centre tab (presence heartbeat `staff_presence`).
2. **Mobile** — push notification to staff devices (`sos-escalation-mobile` + FCM).
3. **Supervisor** — `staff.escalation_priority` higher tier + `is_on_call=true`.
4. **Admin** — admin/super_admin roles, WhatsApp via Main Brain.
5. **Emergency Contacts** — `emergency_contacts` ordered by priority via `emergency-contact-notify`.

### 6.5 Voice context injection

`ai-run` fetches and injects into voice agent context: member profile, medical info, device status, **emergency contacts (name/relationship/phone from `emergency_contacts`)** to prevent hallucination. Isabel references exact names from the database.

---

## 7. Key Flows

### 7.1 Member registration (`/join`)

```text
Visitor → /join (JoinWizard 7 steps)
  step 1-6 → POST save-registration-draft (rate-limit 20/15min, 50KB cap)
              upserts registration_drafts(session_id, step, data)
  step 7 (payment) → POST submit-registration
      → create auth.users via service_role
      → insert members row (status=active, language)
      → insert medical_information, emergency_contacts (≤3)
      → insert subscriptions (plan, billing_frequency)
      → insert orders + order_items + payments(pending)
      → call create-checkout (Stripe) OR create-mollie-checkout (Mollie)
      → redirect to hosted checkout
Provider checkout success
      → webhook stripe-webhook OR mollie-webhook
      → _shared/post-payment.ts: payments.status=completed, paid_at=now()
      → subscriptions.status=active
      → orders.status=processing
      → CRM event sale.paid → ai-dispatch-events
         → Main Brain (new_sale_notification) → WhatsApp admin EN
         → optional welcome_calls trigger
      → branded confirmation email via auth-email-hook templates
Member redirected to /complete-registration or /dashboard
```

### 7.2 Device provisioning

```text
Admin EV07BPage / DeviceDetailPage
  → bulk IMEI/SIM import via ev07b-stock-sync (status=in_stock)
  → assign to member: devices.member_id, status=assigned
  → gps-gateway TCP login with IMEI → forwarder verifies in devices
  → first ev07b-checkin: status=active, last_seen_at set
Provisioning stalled >48h → Isabella provisioning_stalled (if enabled)
Device offline >threshold → ev07b-offline-monitor → alert.device_offline
Aggregate 3+ offline in 60min → Main Brain bulk_offline_alert (critical WhatsApp)
```

### 7.3 SOS / fall end-to-end

```text
EV-07B button OR fall detection
  → GT06 packet → gps-gateway → POST ev07b-sos-alert (HMAC verify)
  → INSERT alerts(member_id, type=sos_button|fall_detected, status=incoming, severity)
  → REALTIME push: useAlertsRealtime → SOSAlertPage in all call-centre tabs
  → ai-dispatch-events fires sos_button_triage / fall_detection_triage
      → ai-run with Customer Service Expert (voice) [if toggle enabled]
      → POST sos-conference-create
         conference_rooms(conference_name='sos-<id>', status=active)
         alerts.conference_id = room.id
         conference_participants: member (dialed by Twilio), isabella AI
      → Twilio conference dials member → on answer, Isabella joins via isabella-voice-handler TwiML
      → Isabella triages: bilingual, asks 1 question at a time
         each member reply logged via isabella-assessment-log (note_type=member_response)

PARALLEL: sos-escalation-runner walks levels
  L1 Browser: ping staff_presence; expect accept within 30s
  L2 Mobile: sos-escalation-mobile → FCM push
  L3 Supervisor: staff.escalation_priority>=2 AND is_on_call
  L4 Admin: WhatsApp via Main Brain (emergency_escalation_alert)
  L5 Emergency Contacts: emergency-contact-notify dials/SMS in priority order

On staff accept (SOSTakeoverScreen):
  alerts.status=in_progress, accepted_by, accepted_at
  sos-conference-join adds staff to Twilio conference

Resolutions:
  Staff: sos-alert-resolve → alerts.status=resolved, resolution_notes
  Isabella: sos-false-alarm-resolve (only if ≥2 member responses AND no staff in conf)
      → alerts.is_false_alarm=true, conference ended, participants left
      → does NOT notify emergency contacts
```

### 7.4 Billing / subscription lifecycle

```text
Signup → first payment (Stripe one-off OR Mollie first w/ mandate)
  → subscription.status=active, renewal_date set
Monthly cycle (Mollie mandate):
  → server-initiated recurring charge → mollie-webhook updates payments
  → on success: subscriptions.renewal_date += 1 month
  → on failure: status=past_due → failed_payment_escalation Isabella (if enabled)
Annual plan: 10 months net (2 months free), per src/config/pricing.ts.
Pricing (net + IVA):
  - Single membership: €24.99 + 10% IVA
  - Couple membership: €34.99 + 10% IVA
  - Registration fee: €59.99 (no IVA)
  - GPS Pendant: €125.00 + 21% IVA
  - Shipping: €14.99 (IVA included)
Cancel: cancel-mollie-subscription → status=cancelled at period end
Refund: admin via Stripe/Mollie dashboard + payments.status=refunded → blocks commission release
```

### 7.5 Partner referral + commission

```text
Partner shares tracked link /r/<partner_code>/<post_slug>
  → /r/... → ReferralRedirect → track-referral-click → partner_clicks INSERT, increment_partner_link_clicks
  → localStorage 'partner_referral' set 30 days
  → redirect to blog/post or /join
On /join completion:
  → submit-registration reads localStorage attribution
  → partner_attributions INSERT (partner_id, member_id, post_slug)
  → members.partner_id set
On order delivered:
  → admin OrdersPage marks status=delivered
  → trigger creates partner_commissions row (amount=€50 gross, status=pending_release, release_at=now+7d)
process-commissions cron (02:00 daily):
  → finds pending_release WHERE release_at<=now AND account still active AND not refunded
  → status=approved
  → CRM event partner.commission_threshold → Isabella partner_commission_due (if enabled)
Admin marks paid:
  → CommissionsPage / PartnerDetailPage → status=paid, paid_at, paid_method
  → CRM event for audit
```

---

## 8. Scheduled Jobs / Cron

Live from `cron.job` (pg_cron + pg_net):

| Name | Schedule | Target | Purpose |
|---|---|---|---|
| `staff-shift-monitor` | `*/2 * * * *` | `staff-shift-monitor` edge fn | Heartbeat + no-show + disconnection alerts to WhatsApp; dedups via `shift_alert_log`. |
| `shift-daily-reminders` | `0 19 * * *` | `shift-daily-reminders` | Tomorrow's shift reminders + cover expiry. |
| `daily-courtesy-calls` | `0 6 * * *` | `generate-courtesy-calls` | Queue daily courtesy calls. |
| `process-partner-commissions-daily` | `0 2 * * *` | `process-commissions` | Auto-approve 7-day-old pending_release commissions. |

Application-level scheduled triggers (driven by Isabella toggles, not pg_cron):
- `daily_boss_briefing` 08:00 Europe/Madrid (Main Brain summary).
- Weekly revenue summary (when enabled).
- Outreach pipeline runner (manual + Admin Panel toggles).
- Video render worker queue (Docker service, polled externally).

---

## 9. Secrets & Environment Variables

Stored as Supabase Edge Function secrets:

| Secret | Used by |
|---|---|
| `LOVABLE_API_KEY` | All AI edge functions (managed; rotate via rotate tool). |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | All edge functions (auto-managed). |
| `GMAIL_APP_PASSWORD` | `_shared/email.ts` (primary outbound). |
| `RESEND_API_KEY` | `partner-alert-notify`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth + YouTube. |

Frontend `.env` (auto-managed, do NOT edit):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

`system_settings` table holds runtime keys (`settings_*` prefix): Twilio, Stripe, Mollie, Gmail user, Resend, company info, YouTube channel, Isabella thresholds.

---

## 10. Storage Buckets

| Bucket | Public | Purpose |
|---|---|---|
| `website-images` | Yes | Managed marketing imagery (`useWebsiteImage`). |
| `ai-agent-avatars` | Yes | AI agent avatars (live URLs in `ai_agents.avatar_url`). |
| `social-post-images` | Yes | Generated social post images. |
| `video-hub-exports` | Yes | Rendered MP4 outputs. |
| `video-hub-captions` | Yes | VTT/SRT caption files. |
| `video-hub-thumbnails` | Yes | Thumbnails. |
| `video-exports` | Yes | Legacy exports. |
| `video-thumbnails` | Yes | Legacy thumbnails. |
| `email-assets` | Yes | Branded email logos. |
| `partner-presentations` | **No** | Sales decks; access via 1-hour signed URLs. |
| `staff-documents` | **No** | Contracts, NIE copies, CVs. |

---

## 11. RLS & Security Model

- Every public-schema table has RLS enabled and explicit `GRANT` to `authenticated` / `service_role` (and `anon` only when policy permits).
- Role checks use SECURITY DEFINER helpers (`is_staff`, `is_admin`, `is_partner`, `has_role`) to prevent recursion.
- Roles are NOT stored on `members`/`profiles`/`staff` directly for privilege checks — `staff.role` is `app_role` enum referenced via security-definer functions only.
- Public-bypass edge functions (`verify_jwt = false` in `supabase/config.toml`): `ev07b-stock-sync`, `outreach-unsubscribe`, `submit-member-update`, `validate-member-update-token`, `voice-handler`, `twilio-voice`, `twilio-sms`, `twilio-whatsapp`, `twilio-call-me`, `create-mollie-checkout`, `mollie-webhook`, `cancel-mollie-subscription`, all auth/webhook entry points. **All other "verify_jwt=false" functions still validate auth in-code** because the project uses Supabase signing-keys.
- DOMPurify sanitises email template previews (`src/lib/sanitize.ts`).
- Rate limiting: `_shared/rate-limit.ts` IP-based, 20/15min default on public endpoints.
- Payload caps: 50KB for `save-registration-draft`.
- 2FA: `src/components/auth/TwoFactorSetup.tsx`, `src/hooks/useTwoFactorAuth.ts`.
- Session: 30 min idle timeout, 5 min warning (`useSessionTimeout`).
- GDPR: `gdpr-delete-member` (30d compliance window), `useGdprDeletion`, `useGdprExport`, cookie consent banner.

---

## 12. Appendix: File-Path Index (selected)

- Routing: `src/App.tsx`
- Auth: `src/contexts/AuthContext.tsx`, `src/components/auth/ProtectedRoute.tsx`
- Constants: `src/config/constants.ts`, `src/config/pricing.ts`, `src/config/shifts.ts`, `src/config/partnerTypes.ts`
- Isabella mapping: `src/lib/isabella-function-config.ts`
- AI client: `src/integrations/supabase/client.ts` (auto-gen, do not edit)
- Layouts: `src/components/layout/{Admin,CallCentre,Client,Partner}Layout.tsx`
- SOS components: `src/components/call-centre/sos/`
- SOS hooks: `src/hooks/{useSOSConference,useSOSTakeover,useEscalationChain,useAlertsRealtime}.ts`
- Staff heartbeat: `src/hooks/useStaffHeartbeat.ts`
- Pricing logic: `src/config/pricing.ts` (single source of truth, net+IVA).
- Edge fns: `supabase/functions/<name>/index.ts` (89 functions).
- Shared: `supabase/functions/_shared/{cors,email,rate-limit,validation,post-payment,email-templates}.ts(x)`
- Migrations: `supabase/migrations/*.sql` (120 files, 2026-01-21 to 2026-03-03).
- Config: `supabase/config.toml`.
- GPS gateway: `gps-gateway/src/{server,gt06-parser,forwarder}.js`.
- Video worker: `render-worker/src/{index,renderer,captions,storage}.ts`.
- Service workers: `public/sw.js`, `public/firebase-messaging-sw.js`.
- i18n: `src/i18n/index.ts`.
- Sentry: `src/lib/sentry.ts`.
- Sanitization: `src/lib/sanitize.ts`.
- Audit log: `src/lib/auditLog.ts`.
- Communication log: `src/lib/communicationLogger.ts`.

---

End of spec. Regenerate after major schema or function additions.