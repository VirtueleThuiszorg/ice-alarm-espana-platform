# WIRING REGISTER

Every connection out of this application, where it actually goes, who finds out, and
whether anything would go red if it broke.

> Lee sent a message from the public Contact page and found nothing in Communications,
> Messages or notifications. It had gone to the `leads` table and nobody was told. This
> register exists so that is a known fact about every control on every page rather than
> something discovered one at a time.

**GENERATED FILE — do not edit.** `node scripts/wiring/build.mjs` rebuilds it from the
code plus `scripts/wiring/annotations.mjs`. CI regenerates and diffs, so the register in
main cannot drift from the code in main. To change a row, change the wire or the annotation.

## Score distribution

```
10 │   1  
 9 │   5  ██
 8 │   0  
 7 │   3  █
 6 │  21  ████████
 5 │  86  ██████████████████████████████████
 4 │  48  ███████████████████
 3 │   0  
 2 │   0  
 1 │   0  
 0 │   7  ███
```

171 distinct wires across 535 call sites and 108 routes.

| band | meaning | wires | share |
|---|---|---:|---:|
| 10 | fully wired — arrives, right person told on a live channel, failure shown, proof that goes red | 1 | 1% |
| 7–9 | arrives and proven; notification missing or on a channel not live today | 8 | 5% |
| 4–6 | arrives; nobody told; nothing proves it | 155 | 91% |
| 1–3 | fails, fails silently, or lands where nobody looks | 0 | 0% |
| 0 | dead control | 7 | 4% |

### How to read a low score

Most of this platform's wires **arrive**. What almost none of them have is a proof that
would go red if they stopped arriving, and that alone caps a row at 6 — deliberately, and
without rounding up. A screen full of buttons that all work today scores 5 because nothing
would tell anyone the day one of them stops. The rubric is applied by
`scripts/wiring/score.mjs`, not by judgement per row.

Two rules do the most work:

1. **No proof, no score above 6.** A test that names the table is not a proof; `proof`
   holds a test read and confirmed to exercise client → destination → visible.
2. **Only the bell counts as a channel live today.** `notification_log` is published to
   `supabase_realtime` and needs no secret, so it is provably live from the repo. Email,
   SMS and WhatsApp all return "not configured" without a production secret this repo
   cannot read — so they cap at 8 and appear in *Only Lee can verify* below.

## Method

Wires are **derived from the source**, not walked by hand — a hand-walked list misses the
control someone adds next week. Every exit from this app is one of five syntactic things,
and a control with no wire cannot do anything:

| kind | what it is | call sites |
|---|---|---:|
| `table` | `supabase.from(t).insert/update/upsert/delete` — a row written | 341 |
| `fn` | `supabase.functions.invoke(f)` — an edge function | 77 |
| `rpc` | `supabase.rpc(f)` — a SQL function | 4 |
| `channel` | `postgres_changes` — a realtime subscription | 50 |
| `link` | `mailto:` / `tel:` / `wa.me` — a hand-off off the platform | 63 |

Routes come from an import graph over `src/App.tsx`, so a wire in a shared hook is
attributed to every page that can reach it, and a wire in a **layout** (the notification
bell lives in the headers, not in any page) is attributed to every route in its group.

Three facts are checked against the real schema rather than by grep — the migration set is
applied to a throwaway PostgreSQL and queried:

- **realtime publication membership** — 28 tables are in `supabase_realtime`; a
  `postgres_changes` subscription on a table outside it is a **dead control**, and five were
  found this way;
- **RLS** — every table in `public` has row-level security enabled (golden rule 2 holds);
- **triggers** — **no** database function anywhere writes `notification_log`, which is why
  "who is told" is only ever true where client code or an edge function says so explicitly.

`failure shown` is derived too: a `toast.error`, an inline error, or a throw inside a
react-query mutation. A bare `console.error` does **not** count — that is the definition of
failing silently, and it is exactly what the contact form did.

## The register

### Public & marketing

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **0** | `channel:registration_drafts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | toast | none | 1 |
| **0** | `channel:shift_notes` | Shift notes page — live handover list — code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.” | supabase.channel('call-centre-shift-notes') → fetchNotes() | nobody · **DEAD** | — | none | 1 |
| **0** | `channel:social_post_metrics` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:social_posts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:tasks` | Call-centre dashboard — courtesy-call list auto-refresh — the courtesy-call list stays current while the operator works | supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls() | nobody · **DEAD** | — | none | 1 |
| **4** | `channel:alert_escalations` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 1 |
| **4** | `channel:alerts` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 7 |
| **4** | `channel:conference_participants` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conference_rooms` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:isabella_assessment_notes` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 2 |
| **4** | `channel:leads` | Leads list and dashboard leads widget — live arrival of a new enquiry — a new enquiry appears without a reload | postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads | screen | — | none | 3 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 8 |
| **4** | `channel:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 1 |
| **4** | `channel:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:video_exports` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `channel:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `fn:facebook-metrics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 3 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 4 |
| **4** | `fn:partner-admin-create` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-complete-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-send-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 2 |
| **4** | `fn:partner-validate-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:process-commissions` | Run the commission calculation — partners are paid what they earned | process-commissions → partner_commissions | nobody | — | none | 2 |
| **4** | `fn:save-registration-draft` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | — | none | 2 |
| **4** | `fn:sos-alert-resolve` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:sos-conference-join` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 2 |
| **4** | `fn:sos-conference-leave` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 3 |
| **4** | `fn:sos-drill` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 2 |
| **4** | `fn:staff-complete-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:staff-validate-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:track-invite-view` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:twilio-token` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:validate-member-update-token` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | — | none | 1 |
| **4** | `fn:video-render-queue` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 6 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:ai_events` | Isabella actions and observations — what the assistant did is on the record | ai_events (published to supabase_realtime) | bell | — | none | 6 |
| **4** | `table:alerts` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 7 |
| **4** | `table:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 19 |
| **4** | `table:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 4 |
| **4** | `table:order_items` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 1 |
| **4** | `table:orders` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 5 |
| **4** | `table:outreach_campaigns` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_daily_usage` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_email_drafts` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:partner_commissions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 6 |
| **4** | `table:social_posts` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 9 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 18 |
| **4** | `table:staff_presence` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | — | none | 2 |
| **5** | `channel:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `channel:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `fn:complete-member-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | toast | none | 1 |
| **5** | `fn:create-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:create-mollie-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:facebook-unpublish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:generate-content-plan` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:notify-admin` | Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures — an operational failure is not silent | notify-admin edge function → notification_log (+ WhatsApp where configured) | bell | toast | none | 2 |
| **5** | `fn:outreach-send-email` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `fn:partner-admin-delete` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:partner-admin-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:publish-scheduled` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:send-member-update-request` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:staff-register` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 2 |
| **5** | `fn:staff-send-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `fn:submit-member-update` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:submit-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 2 |
| **5** | `fn:twilio-sms` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 3 |
| **5** | `fn:twilio-whatsapp` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | toast | none | 1 |
| **5** | `fn:youtube-disconnect` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:youtube-integration-status` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-oauth-start` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-publish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 19 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 31 |
| **5** | `rpc:get_admin_dashboard_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_sales_command_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_todays_birthdays` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:app_daily_metrics` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_events` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_finance` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_contacts` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_import_batches` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 4 |
| **5** | `table:crm_import_rows` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_profiles` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 7 |
| **5** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Message Sent! … Our team will review your message and respond within 24 hours.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads | screen | inline | none | 8 |
| **5** | `table:media_audiences` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_content_calendar` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 10 |
| **5** | `table:media_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_image_styles` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_schedule_settings` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 2 |
| **5** | `table:media_topic_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_topics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:medical_information` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:member_contact_methods` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `table:member_notes` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 5 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 4 |
| **5** | `table:notification_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 4 |
| **5** | `table:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_queued_tasks` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `table:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_settings` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 2 |
| **5** | `table:outreach_suppression` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `table:partner_agreements` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_notifications` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 2 |
| **5** | `table:partner_alert_subscriptions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 5 |
| **5** | `table:partner_members` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:partner_post_links` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 3 |
| **5** | `table:partner_presentations` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 2 |
| **5** | `table:partner_pricing_tiers` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:payers` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:shift_escalation_chain` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:shift_notes` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | toast | none | 3 |
| **5** | `table:staff_activity_log` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_documents` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | mutation onError | none | 1 |
| **5** | `table:staff_holidays` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 3 |
| **5** | `table:staff_invites` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_shift_covers` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 2 |
| **5** | `table:staff_shifts` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 5 |
| **5** | `table:subscriptions` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 3 |
| **5** | `table:tasks` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 9 |
| **5** | `table:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 1 |
| **5** | `table:video_brand_settings` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 2 |
| **5** | `table:video_outreach_links` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_projects` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 3 |
| **5** | `table:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 2 |
| **5** | `table:website_images` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 3 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `fn:save-api-keys` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 2 |
| **6** | `fn:send-test-email` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 1 |
| **6** | `fn:test-twilio` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | mutation onError | none | 1 |
| **6** | `table:admin_ideas` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | mutation onError | none | 3 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 3 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 3 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 3 |
| **6** | `table:blog_posts` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 5 |
| **6** | `table:email_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:email_templates` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 2 |
| **6** | `table:isabella_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:member_notification_optin` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | mutation onError | none | 1 |
| **6** | `table:operational_costs` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 4 |
| **6** | `table:payments` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | toast | none | 1 |
| **6** | `table:pricing_plans` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:pricing_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:products` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 6 |
| **6** | `table:system_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **6** | `table:testimonials` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **7** | `fn:admin-subscription-action` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 2 |
| **7** | `fn:cancel-mollie-subscription` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **9** | `fn:notify-fulfilment` | Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested — the next person in the chain knows the device is theirs to move | notify-fulfilment → member_notification_log, one row per channel decision | bell | — | `src/test/notifyFulfilmentDispatcher.test.ts` | 1 |
| **9** | `fn:partner-register` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `fn:partner-verify` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 16 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 15 |
| **10** | `table:partners` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | toast | `e2e/partnerJourney.spec.ts` | 10 |

### Join & auth

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **0** | `channel:registration_drafts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | toast | none | 1 |
| **0** | `channel:shift_notes` | Shift notes page — live handover list — code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.” | supabase.channel('call-centre-shift-notes') → fetchNotes() | nobody · **DEAD** | — | none | 1 |
| **0** | `channel:social_post_metrics` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:social_posts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:tasks` | Call-centre dashboard — courtesy-call list auto-refresh — the courtesy-call list stays current while the operator works | supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls() | nobody · **DEAD** | — | none | 1 |
| **4** | `channel:alert_escalations` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 1 |
| **4** | `channel:alerts` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 7 |
| **4** | `channel:conference_participants` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conference_rooms` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:isabella_assessment_notes` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 2 |
| **4** | `channel:leads` | Leads list and dashboard leads widget — live arrival of a new enquiry — a new enquiry appears without a reload | postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads | screen | — | none | 3 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 8 |
| **4** | `channel:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 1 |
| **4** | `channel:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:video_exports` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `channel:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `fn:facebook-metrics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 3 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 4 |
| **4** | `fn:partner-admin-create` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-complete-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-send-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 2 |
| **4** | `fn:partner-validate-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:process-commissions` | Run the commission calculation — partners are paid what they earned | process-commissions → partner_commissions | nobody | — | none | 2 |
| **4** | `fn:save-registration-draft` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | — | none | 2 |
| **4** | `fn:sos-alert-resolve` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:sos-conference-join` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 2 |
| **4** | `fn:sos-conference-leave` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 3 |
| **4** | `fn:sos-drill` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 2 |
| **4** | `fn:staff-complete-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:staff-validate-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:track-invite-view` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:twilio-token` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:validate-member-update-token` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | — | none | 1 |
| **4** | `fn:video-render-queue` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 6 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:ai_events` | Isabella actions and observations — what the assistant did is on the record | ai_events (published to supabase_realtime) | bell | — | none | 6 |
| **4** | `table:alerts` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 7 |
| **4** | `table:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 19 |
| **4** | `table:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 4 |
| **4** | `table:order_items` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 1 |
| **4** | `table:orders` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 5 |
| **4** | `table:outreach_campaigns` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_daily_usage` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_email_drafts` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:partner_commissions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 6 |
| **4** | `table:social_posts` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 9 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 18 |
| **4** | `table:staff_presence` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | — | none | 2 |
| **5** | `channel:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `channel:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `fn:complete-member-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | toast | none | 1 |
| **5** | `fn:create-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:create-mollie-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:facebook-unpublish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:generate-content-plan` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:notify-admin` | Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures — an operational failure is not silent | notify-admin edge function → notification_log (+ WhatsApp where configured) | bell | toast | none | 2 |
| **5** | `fn:outreach-send-email` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `fn:partner-admin-delete` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:partner-admin-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:publish-scheduled` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:send-member-update-request` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:staff-register` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 2 |
| **5** | `fn:staff-send-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `fn:submit-member-update` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:submit-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 2 |
| **5** | `fn:twilio-sms` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 3 |
| **5** | `fn:twilio-whatsapp` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | toast | none | 1 |
| **5** | `fn:youtube-disconnect` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:youtube-integration-status` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-oauth-start` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-publish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 19 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 31 |
| **5** | `rpc:get_admin_dashboard_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_sales_command_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_todays_birthdays` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:app_daily_metrics` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_events` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_finance` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_contacts` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_import_batches` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 4 |
| **5** | `table:crm_import_rows` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_profiles` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 7 |
| **5** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Message Sent! … Our team will review your message and respond within 24 hours.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads | screen | inline | none | 8 |
| **5** | `table:media_audiences` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_content_calendar` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 10 |
| **5** | `table:media_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_image_styles` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_schedule_settings` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 2 |
| **5** | `table:media_topic_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_topics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:medical_information` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:member_contact_methods` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `table:member_notes` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 5 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 4 |
| **5** | `table:notification_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 4 |
| **5** | `table:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_queued_tasks` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `table:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_settings` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 2 |
| **5** | `table:outreach_suppression` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `table:partner_agreements` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_notifications` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 2 |
| **5** | `table:partner_alert_subscriptions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 5 |
| **5** | `table:partner_members` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:partner_post_links` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 3 |
| **5** | `table:partner_presentations` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 2 |
| **5** | `table:partner_pricing_tiers` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:payers` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:shift_escalation_chain` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:shift_notes` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | toast | none | 3 |
| **5** | `table:staff_activity_log` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_documents` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | mutation onError | none | 1 |
| **5** | `table:staff_holidays` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 3 |
| **5** | `table:staff_invites` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_shift_covers` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 2 |
| **5** | `table:staff_shifts` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 5 |
| **5** | `table:subscriptions` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 3 |
| **5** | `table:tasks` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 9 |
| **5** | `table:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 1 |
| **5** | `table:video_brand_settings` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 2 |
| **5** | `table:video_outreach_links` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_projects` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 3 |
| **5** | `table:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 2 |
| **5** | `table:website_images` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 3 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `fn:save-api-keys` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 2 |
| **6** | `fn:send-test-email` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 1 |
| **6** | `fn:test-twilio` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | mutation onError | none | 1 |
| **6** | `table:admin_ideas` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | mutation onError | none | 3 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 3 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 3 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 3 |
| **6** | `table:blog_posts` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 5 |
| **6** | `table:email_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:email_templates` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 2 |
| **6** | `table:isabella_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:member_notification_optin` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | mutation onError | none | 1 |
| **6** | `table:operational_costs` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 4 |
| **6** | `table:payments` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | toast | none | 1 |
| **6** | `table:pricing_plans` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:pricing_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:products` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 6 |
| **6** | `table:system_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **6** | `table:testimonials` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **7** | `fn:admin-subscription-action` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 2 |
| **7** | `fn:cancel-mollie-subscription` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **9** | `fn:notify-fulfilment` | Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested — the next person in the chain knows the device is theirs to move | notify-fulfilment → member_notification_log, one row per channel decision | bell | — | `src/test/notifyFulfilmentDispatcher.test.ts` | 1 |
| **9** | `fn:partner-register` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `fn:partner-verify` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 16 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 15 |
| **10** | `table:partners` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | toast | `e2e/partnerJourney.spec.ts` | 10 |

### Member dashboard

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **0** | `channel:registration_drafts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | toast | none | 1 |
| **0** | `channel:shift_notes` | Shift notes page — live handover list — code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.” | supabase.channel('call-centre-shift-notes') → fetchNotes() | nobody · **DEAD** | — | none | 1 |
| **0** | `channel:social_post_metrics` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:social_posts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:tasks` | Call-centre dashboard — courtesy-call list auto-refresh — the courtesy-call list stays current while the operator works | supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls() | nobody · **DEAD** | — | none | 1 |
| **4** | `channel:alert_escalations` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 1 |
| **4** | `channel:alerts` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 7 |
| **4** | `channel:conference_participants` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conference_rooms` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:isabella_assessment_notes` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 2 |
| **4** | `channel:leads` | Leads list and dashboard leads widget — live arrival of a new enquiry — a new enquiry appears without a reload | postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads | screen | — | none | 3 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 8 |
| **4** | `channel:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 1 |
| **4** | `channel:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:video_exports` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `channel:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `fn:facebook-metrics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 3 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 4 |
| **4** | `fn:partner-admin-create` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-complete-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-send-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 2 |
| **4** | `fn:partner-validate-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:process-commissions` | Run the commission calculation — partners are paid what they earned | process-commissions → partner_commissions | nobody | — | none | 2 |
| **4** | `fn:save-registration-draft` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | — | none | 2 |
| **4** | `fn:sos-alert-resolve` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:sos-conference-join` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 2 |
| **4** | `fn:sos-conference-leave` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 3 |
| **4** | `fn:sos-drill` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 2 |
| **4** | `fn:staff-complete-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:staff-validate-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:track-invite-view` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:twilio-token` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:validate-member-update-token` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | — | none | 1 |
| **4** | `fn:video-render-queue` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 6 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:ai_events` | Isabella actions and observations — what the assistant did is on the record | ai_events (published to supabase_realtime) | bell | — | none | 6 |
| **4** | `table:alerts` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 7 |
| **4** | `table:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 19 |
| **4** | `table:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 4 |
| **4** | `table:order_items` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 1 |
| **4** | `table:orders` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 5 |
| **4** | `table:outreach_campaigns` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_daily_usage` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_email_drafts` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:partner_commissions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 6 |
| **4** | `table:social_posts` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 9 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 18 |
| **4** | `table:staff_presence` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | — | none | 2 |
| **5** | `channel:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `channel:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `fn:complete-member-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | toast | none | 1 |
| **5** | `fn:create-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:create-mollie-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:facebook-unpublish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:generate-content-plan` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:notify-admin` | Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures — an operational failure is not silent | notify-admin edge function → notification_log (+ WhatsApp where configured) | bell | toast | none | 2 |
| **5** | `fn:outreach-send-email` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `fn:partner-admin-delete` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:partner-admin-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:publish-scheduled` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:send-member-update-request` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:staff-register` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 2 |
| **5** | `fn:staff-send-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `fn:submit-member-update` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:submit-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 2 |
| **5** | `fn:twilio-sms` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 3 |
| **5** | `fn:twilio-whatsapp` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | toast | none | 1 |
| **5** | `fn:youtube-disconnect` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:youtube-integration-status` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-oauth-start` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-publish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 19 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 31 |
| **5** | `rpc:get_admin_dashboard_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_sales_command_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_todays_birthdays` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:app_daily_metrics` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_events` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_finance` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_contacts` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_import_batches` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 4 |
| **5** | `table:crm_import_rows` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_profiles` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 7 |
| **5** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Message Sent! … Our team will review your message and respond within 24 hours.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads | screen | inline | none | 8 |
| **5** | `table:media_audiences` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_content_calendar` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 10 |
| **5** | `table:media_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_image_styles` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_schedule_settings` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 2 |
| **5** | `table:media_topic_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_topics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:medical_information` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:member_contact_methods` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `table:member_notes` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 5 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 4 |
| **5** | `table:notification_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 4 |
| **5** | `table:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_queued_tasks` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `table:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_settings` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 2 |
| **5** | `table:outreach_suppression` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `table:partner_agreements` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_notifications` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 2 |
| **5** | `table:partner_alert_subscriptions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 5 |
| **5** | `table:partner_members` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:partner_post_links` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 3 |
| **5** | `table:partner_presentations` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 2 |
| **5** | `table:partner_pricing_tiers` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:payers` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:shift_escalation_chain` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:shift_notes` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | toast | none | 3 |
| **5** | `table:staff_activity_log` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_documents` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | mutation onError | none | 1 |
| **5** | `table:staff_holidays` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 3 |
| **5** | `table:staff_invites` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_shift_covers` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 2 |
| **5** | `table:staff_shifts` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 5 |
| **5** | `table:subscriptions` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 3 |
| **5** | `table:tasks` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 9 |
| **5** | `table:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 1 |
| **5** | `table:video_brand_settings` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 2 |
| **5** | `table:video_outreach_links` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_projects` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 3 |
| **5** | `table:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 2 |
| **5** | `table:website_images` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 3 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `fn:save-api-keys` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 2 |
| **6** | `fn:send-test-email` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 1 |
| **6** | `fn:test-twilio` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | mutation onError | none | 1 |
| **6** | `table:admin_ideas` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | mutation onError | none | 3 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 3 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 3 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 3 |
| **6** | `table:blog_posts` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 5 |
| **6** | `table:email_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:email_templates` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 2 |
| **6** | `table:isabella_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:member_notification_optin` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | mutation onError | none | 1 |
| **6** | `table:operational_costs` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 4 |
| **6** | `table:payments` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | toast | none | 1 |
| **6** | `table:pricing_plans` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:pricing_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:products` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 6 |
| **6** | `table:system_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **6** | `table:testimonials` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **7** | `fn:admin-subscription-action` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 2 |
| **7** | `fn:cancel-mollie-subscription` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **9** | `fn:notify-fulfilment` | Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested — the next person in the chain knows the device is theirs to move | notify-fulfilment → member_notification_log, one row per channel decision | bell | — | `src/test/notifyFulfilmentDispatcher.test.ts` | 1 |
| **9** | `fn:partner-register` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `fn:partner-verify` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 16 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 15 |
| **10** | `table:partners` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | toast | `e2e/partnerJourney.spec.ts` | 10 |

### Call centre

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **0** | `channel:registration_drafts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | toast | none | 1 |
| **0** | `channel:shift_notes` | Shift notes page — live handover list — code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.” | supabase.channel('call-centre-shift-notes') → fetchNotes() | nobody · **DEAD** | — | none | 1 |
| **0** | `channel:social_post_metrics` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:social_posts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:tasks` | Call-centre dashboard — courtesy-call list auto-refresh — the courtesy-call list stays current while the operator works | supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls() | nobody · **DEAD** | — | none | 1 |
| **4** | `channel:alert_escalations` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 1 |
| **4** | `channel:alerts` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 7 |
| **4** | `channel:conference_participants` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conference_rooms` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:isabella_assessment_notes` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 2 |
| **4** | `channel:leads` | Leads list and dashboard leads widget — live arrival of a new enquiry — a new enquiry appears without a reload | postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads | screen | — | none | 3 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 8 |
| **4** | `channel:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 1 |
| **4** | `channel:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:video_exports` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `channel:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `fn:facebook-metrics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 3 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 4 |
| **4** | `fn:partner-admin-create` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-complete-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-send-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 2 |
| **4** | `fn:partner-validate-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:process-commissions` | Run the commission calculation — partners are paid what they earned | process-commissions → partner_commissions | nobody | — | none | 2 |
| **4** | `fn:save-registration-draft` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | — | none | 2 |
| **4** | `fn:sos-alert-resolve` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:sos-conference-join` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 2 |
| **4** | `fn:sos-conference-leave` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 3 |
| **4** | `fn:sos-drill` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 2 |
| **4** | `fn:staff-complete-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:staff-validate-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:track-invite-view` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:twilio-token` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:validate-member-update-token` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | — | none | 1 |
| **4** | `fn:video-render-queue` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 6 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:ai_events` | Isabella actions and observations — what the assistant did is on the record | ai_events (published to supabase_realtime) | bell | — | none | 6 |
| **4** | `table:alerts` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 7 |
| **4** | `table:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 19 |
| **4** | `table:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 4 |
| **4** | `table:order_items` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 1 |
| **4** | `table:orders` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 5 |
| **4** | `table:outreach_campaigns` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_daily_usage` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_email_drafts` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:partner_commissions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 6 |
| **4** | `table:social_posts` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 9 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 18 |
| **4** | `table:staff_presence` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | — | none | 2 |
| **5** | `channel:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `channel:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `fn:complete-member-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | toast | none | 1 |
| **5** | `fn:create-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:create-mollie-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:facebook-unpublish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:generate-content-plan` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:notify-admin` | Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures — an operational failure is not silent | notify-admin edge function → notification_log (+ WhatsApp where configured) | bell | toast | none | 2 |
| **5** | `fn:outreach-send-email` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `fn:partner-admin-delete` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:partner-admin-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:publish-scheduled` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:send-member-update-request` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:staff-register` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 2 |
| **5** | `fn:staff-send-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `fn:submit-member-update` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:submit-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 2 |
| **5** | `fn:twilio-sms` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 3 |
| **5** | `fn:twilio-whatsapp` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | toast | none | 1 |
| **5** | `fn:youtube-disconnect` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:youtube-integration-status` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-oauth-start` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-publish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 19 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 31 |
| **5** | `rpc:get_admin_dashboard_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_sales_command_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_todays_birthdays` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:app_daily_metrics` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_events` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_finance` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_contacts` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_import_batches` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 4 |
| **5** | `table:crm_import_rows` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_profiles` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 7 |
| **5** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Message Sent! … Our team will review your message and respond within 24 hours.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads | screen | inline | none | 8 |
| **5** | `table:media_audiences` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_content_calendar` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 10 |
| **5** | `table:media_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_image_styles` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_schedule_settings` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 2 |
| **5** | `table:media_topic_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_topics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:medical_information` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:member_contact_methods` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `table:member_notes` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 5 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 4 |
| **5** | `table:notification_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 4 |
| **5** | `table:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_queued_tasks` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `table:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_settings` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 2 |
| **5** | `table:outreach_suppression` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `table:partner_agreements` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_notifications` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 2 |
| **5** | `table:partner_alert_subscriptions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 5 |
| **5** | `table:partner_members` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:partner_post_links` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 3 |
| **5** | `table:partner_presentations` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 2 |
| **5** | `table:partner_pricing_tiers` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:payers` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:shift_escalation_chain` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:shift_notes` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | toast | none | 3 |
| **5** | `table:staff_activity_log` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_documents` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | mutation onError | none | 1 |
| **5** | `table:staff_holidays` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 3 |
| **5** | `table:staff_invites` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_shift_covers` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 2 |
| **5** | `table:staff_shifts` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 5 |
| **5** | `table:subscriptions` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 3 |
| **5** | `table:tasks` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 9 |
| **5** | `table:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 1 |
| **5** | `table:video_brand_settings` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 2 |
| **5** | `table:video_outreach_links` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_projects` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 3 |
| **5** | `table:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 2 |
| **5** | `table:website_images` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 3 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `fn:save-api-keys` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 2 |
| **6** | `fn:send-test-email` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 1 |
| **6** | `fn:test-twilio` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | mutation onError | none | 1 |
| **6** | `table:admin_ideas` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | mutation onError | none | 3 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 3 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 3 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 3 |
| **6** | `table:blog_posts` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 5 |
| **6** | `table:email_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:email_templates` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 2 |
| **6** | `table:isabella_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:member_notification_optin` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | mutation onError | none | 1 |
| **6** | `table:operational_costs` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 4 |
| **6** | `table:payments` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | toast | none | 1 |
| **6** | `table:pricing_plans` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:pricing_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:products` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 6 |
| **6** | `table:system_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **6** | `table:testimonials` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **7** | `fn:admin-subscription-action` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 2 |
| **7** | `fn:cancel-mollie-subscription` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **9** | `fn:notify-fulfilment` | Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested — the next person in the chain knows the device is theirs to move | notify-fulfilment → member_notification_log, one row per channel decision | bell | — | `src/test/notifyFulfilmentDispatcher.test.ts` | 1 |
| **9** | `fn:partner-register` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `fn:partner-verify` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 16 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 15 |
| **10** | `table:partners` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | toast | `e2e/partnerJourney.spec.ts` | 10 |

### Admin

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **0** | `channel:registration_drafts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | toast | none | 1 |
| **0** | `channel:shift_notes` | Shift notes page — live handover list — code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.” | supabase.channel('call-centre-shift-notes') → fetchNotes() | nobody · **DEAD** | — | none | 1 |
| **0** | `channel:social_post_metrics` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:social_posts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:tasks` | Call-centre dashboard — courtesy-call list auto-refresh — the courtesy-call list stays current while the operator works | supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls() | nobody · **DEAD** | — | none | 1 |
| **4** | `channel:alert_escalations` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 1 |
| **4** | `channel:alerts` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 7 |
| **4** | `channel:conference_participants` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conference_rooms` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:isabella_assessment_notes` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 2 |
| **4** | `channel:leads` | Leads list and dashboard leads widget — live arrival of a new enquiry — a new enquiry appears without a reload | postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads | screen | — | none | 3 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 8 |
| **4** | `channel:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 1 |
| **4** | `channel:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:video_exports` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `channel:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `fn:facebook-metrics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 3 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 4 |
| **4** | `fn:partner-admin-create` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-complete-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-send-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 2 |
| **4** | `fn:partner-validate-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:process-commissions` | Run the commission calculation — partners are paid what they earned | process-commissions → partner_commissions | nobody | — | none | 2 |
| **4** | `fn:save-registration-draft` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | — | none | 2 |
| **4** | `fn:sos-alert-resolve` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:sos-conference-join` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 2 |
| **4** | `fn:sos-conference-leave` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 3 |
| **4** | `fn:sos-drill` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 2 |
| **4** | `fn:staff-complete-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:staff-validate-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:track-invite-view` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:twilio-token` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:validate-member-update-token` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | — | none | 1 |
| **4** | `fn:video-render-queue` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 6 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:ai_events` | Isabella actions and observations — what the assistant did is on the record | ai_events (published to supabase_realtime) | bell | — | none | 6 |
| **4** | `table:alerts` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 7 |
| **4** | `table:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 19 |
| **4** | `table:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 4 |
| **4** | `table:order_items` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 1 |
| **4** | `table:orders` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 5 |
| **4** | `table:outreach_campaigns` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_daily_usage` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_email_drafts` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:partner_commissions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 6 |
| **4** | `table:social_posts` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 9 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 18 |
| **4** | `table:staff_presence` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | — | none | 2 |
| **5** | `channel:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `channel:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `fn:complete-member-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | toast | none | 1 |
| **5** | `fn:create-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:create-mollie-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:facebook-unpublish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:generate-content-plan` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:notify-admin` | Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures — an operational failure is not silent | notify-admin edge function → notification_log (+ WhatsApp where configured) | bell | toast | none | 2 |
| **5** | `fn:outreach-send-email` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `fn:partner-admin-delete` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:partner-admin-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:publish-scheduled` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:send-member-update-request` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:staff-register` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 2 |
| **5** | `fn:staff-send-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `fn:submit-member-update` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:submit-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 2 |
| **5** | `fn:twilio-sms` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 3 |
| **5** | `fn:twilio-whatsapp` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | toast | none | 1 |
| **5** | `fn:youtube-disconnect` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:youtube-integration-status` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-oauth-start` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-publish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 19 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 31 |
| **5** | `rpc:get_admin_dashboard_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_sales_command_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_todays_birthdays` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:app_daily_metrics` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_events` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_finance` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_contacts` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_import_batches` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 4 |
| **5** | `table:crm_import_rows` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_profiles` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 7 |
| **5** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Message Sent! … Our team will review your message and respond within 24 hours.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads | screen | inline | none | 8 |
| **5** | `table:media_audiences` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_content_calendar` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 10 |
| **5** | `table:media_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_image_styles` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_schedule_settings` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 2 |
| **5** | `table:media_topic_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_topics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:medical_information` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:member_contact_methods` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `table:member_notes` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 5 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 4 |
| **5** | `table:notification_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 4 |
| **5** | `table:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_queued_tasks` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `table:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_settings` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 2 |
| **5** | `table:outreach_suppression` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `table:partner_agreements` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_notifications` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 2 |
| **5** | `table:partner_alert_subscriptions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 5 |
| **5** | `table:partner_members` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:partner_post_links` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 3 |
| **5** | `table:partner_presentations` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 2 |
| **5** | `table:partner_pricing_tiers` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:payers` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:shift_escalation_chain` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:shift_notes` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | toast | none | 3 |
| **5** | `table:staff_activity_log` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_documents` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | mutation onError | none | 1 |
| **5** | `table:staff_holidays` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 3 |
| **5** | `table:staff_invites` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_shift_covers` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 2 |
| **5** | `table:staff_shifts` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 5 |
| **5** | `table:subscriptions` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 3 |
| **5** | `table:tasks` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 9 |
| **5** | `table:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 1 |
| **5** | `table:video_brand_settings` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 2 |
| **5** | `table:video_outreach_links` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_projects` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 3 |
| **5** | `table:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 2 |
| **5** | `table:website_images` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 3 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `fn:save-api-keys` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 2 |
| **6** | `fn:send-test-email` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 1 |
| **6** | `fn:test-twilio` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | mutation onError | none | 1 |
| **6** | `table:admin_ideas` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | mutation onError | none | 3 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 3 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 3 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 3 |
| **6** | `table:blog_posts` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 5 |
| **6** | `table:email_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:email_templates` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 2 |
| **6** | `table:isabella_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:member_notification_optin` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | mutation onError | none | 1 |
| **6** | `table:operational_costs` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 4 |
| **6** | `table:payments` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | toast | none | 1 |
| **6** | `table:pricing_plans` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:pricing_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:products` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 6 |
| **6** | `table:system_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **6** | `table:testimonials` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **7** | `fn:admin-subscription-action` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 2 |
| **7** | `fn:cancel-mollie-subscription` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **9** | `fn:notify-fulfilment` | Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested — the next person in the chain knows the device is theirs to move | notify-fulfilment → member_notification_log, one row per channel decision | bell | — | `src/test/notifyFulfilmentDispatcher.test.ts` | 1 |
| **9** | `fn:partner-register` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `fn:partner-verify` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 16 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 15 |
| **10** | `table:partners` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | toast | `e2e/partnerJourney.spec.ts` | 10 |

### Partner

| score | wire | control · what is promised | where it goes | who is told | failure shown | proof | sites |
|---:|---|---|---|---|---|---|---:|
| **0** | `channel:registration_drafts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | toast | none | 1 |
| **0** | `channel:shift_notes` | Shift notes page — live handover list — code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.” | supabase.channel('call-centre-shift-notes') → fetchNotes() | nobody · **DEAD** | — | none | 1 |
| **0** | `channel:social_post_metrics` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:social_posts` | Leads page abandoned-draft list; media manager post list and metrics — the list updates itself | postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics | nobody · **DEAD** | mutation onError | none | 1 |
| **0** | `channel:tasks` | Call-centre dashboard — courtesy-call list auto-refresh — the courtesy-call list stays current while the operator works | supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls() | nobody · **DEAD** | — | none | 1 |
| **4** | `channel:alert_escalations` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 1 |
| **4** | `channel:alerts` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 7 |
| **4** | `channel:conference_participants` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conference_rooms` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `channel:conversations` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 6 |
| **4** | `channel:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 5 |
| **4** | `channel:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:isabella_assessment_notes` | Operator alert queue and SOS takeover screen — live alert arrival — a pendant press reaches an operator screen in under a second | postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published) | screen | — | none | 2 |
| **4** | `channel:leads` | Leads list and dashboard leads widget — live arrival of a new enquiry — a new enquiry appears without a reload | postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads | screen | — | none | 3 |
| **4** | `channel:messages` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 8 |
| **4** | `channel:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 1 |
| **4** | `channel:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 1 |
| **4** | `channel:video_exports` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `channel:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 1 |
| **4** | `fn:facebook-metrics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 3 |
| **4** | `fn:member-self-service` | Live arrival of a message on either Messages screen; the member-side notify and mark-read calls — a new message appears, and the team is told | postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read | bell | — | none | 4 |
| **4** | `fn:partner-admin-create` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-complete-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:partner-send-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 2 |
| **4** | `fn:partner-validate-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:process-commissions` | Run the commission calculation — partners are paid what they earned | process-commissions → partner_commissions | nobody | — | none | 2 |
| **4** | `fn:save-registration-draft` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | — | none | 2 |
| **4** | `fn:sos-alert-resolve` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 1 |
| **4** | `fn:sos-conference-join` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 2 |
| **4** | `fn:sos-conference-leave` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 3 |
| **4** | `fn:sos-drill` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 2 |
| **4** | `fn:staff-complete-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:staff-validate-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 1 |
| **4** | `fn:track-invite-view` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 1 |
| **4** | `fn:twilio-call-me` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:twilio-token` | SOS takeover — join the call, invite a contact, leave — the operator is speaking to the member, and to whoever else is needed | sos-conference-* edge functions → Twilio; conference_rooms / conference_participants | screen | — | none | 1 |
| **4** | `fn:validate-member-update-token` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | — | none | 1 |
| **4** | `fn:video-render-queue` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | — | none | 6 |
| **4** | `link:wa.me` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | — | none | 13 |
| **4** | `table:ai_events` | Isabella actions and observations — what the assistant did is on the record | ai_events (published to supabase_realtime) | bell | — | none | 6 |
| **4** | `table:alerts` | Operator: acknowledge / resolve an alert; run a drill — the alert leaves the queue and the audit says who closed it | alerts (update) via sos-alert-resolve; sos-drill for rehearsals | screen | — | none | 7 |
| **4** | `table:devices` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | — | none | 19 |
| **4** | `table:internal_tickets` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | — | none | 4 |
| **4** | `table:order_items` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 1 |
| **4** | `table:orders` | Staff move an order through fulfilment; add or remove an order line — the order says where the device actually is | orders / order_items | bell | — | none | 5 |
| **4** | `table:outreach_campaigns` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_daily_usage` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 4 |
| **4** | `table:outreach_email_drafts` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | — | none | 2 |
| **4** | `table:partner_commissions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 3 |
| **4** | `table:partner_invites` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | — | none | 6 |
| **4** | `table:social_posts` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | — | none | 9 |
| **4** | `table:staff` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | — | none | 18 |
| **4** | `table:staff_presence` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | — | none | 2 |
| **5** | `channel:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `channel:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 3 |
| **5** | `channel:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `fn:ai-run` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | — | none | 3 |
| **5** | `fn:complete-member-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | toast | none | 1 |
| **5** | `fn:create-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:create-mollie-checkout` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 1 |
| **5** | `fn:facebook-unpublish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:generate-content-plan` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:notify-admin` | Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures — an operational failure is not silent | notify-admin edge function → notification_log (+ WhatsApp where configured) | bell | toast | none | 2 |
| **5** | `fn:outreach-send-email` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `fn:partner-admin-delete` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:partner-admin-invite` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 1 |
| **5** | `fn:publish-scheduled` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:send-member-update-request` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:staff-register` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 2 |
| **5** | `fn:staff-send-invite` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `fn:submit-member-update` | Member-update link — staff request a details check, member submits it without logging in — confirm your details from the link we sent you | send-member-update-request → token → validate-member-update-token → submit-member-update | nobody | toast | none | 1 |
| **5** | `fn:submit-registration` | /join — submit registration, pay by card (Stripe) or SEPA (Mollie) — you are signed up and covered once you have paid | submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4) | bell | inline | none | 2 |
| **5** | `fn:twilio-sms` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 3 |
| **5** | `fn:twilio-whatsapp` | WhatsApp hand-off and outbound WhatsApp — message them on WhatsApp | wa.me deep link; twilio-whatsapp for outbound | whatsapp | toast | none | 1 |
| **5** | `fn:youtube-disconnect` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `fn:youtube-integration-status` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-oauth-start` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | mutation onError | none | 1 |
| **5** | `fn:youtube-publish` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 1 |
| **5** | `link:mailto` | Email hand-off; outbound SMS — email or text this person | the user's mail client; twilio-sms for outbound | external | — | none | 19 |
| **5** | `link:tel` | Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre — pressing this rings the number shown | the device dialler, via a tel: href built from company settings or a member's stored number | external | — | none | 31 |
| **5** | `rpc:get_admin_dashboard_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_sales_command_stats` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_todays_birthdays` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `rpc:get_user_role_info` | Dashboard statistics and role resolution — the numbers on the dashboard are the numbers in the database | SQL functions, read-only | self | — | none | 1 |
| **5** | `table:app_daily_metrics` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_events` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:app_finance` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 1 |
| **5** | `table:conversation_messages` | Isabella conversation turns — the assistant's reply appears as it is produced | conversation_messages | self | — | none | 2 |
| **5** | `table:crm_contacts` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_events` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_import_batches` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 4 |
| **5** | `table:crm_import_rows` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:crm_profiles` | CRM import and contact editing — the legacy record is imported as it stands | crm_* tables via the import path | self | — | none | 2 |
| **5** | `table:documentation` | Assign, program, test and retire a device; publish documentation — the device on the member's wrist is the device on the record | devices / documentation, both published | screen | toast | none | 1 |
| **5** | `table:emergency_contacts` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 7 |
| **5** | `table:leads` | Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens — “Message Sent! … Our team will review your message and respond within 24 hours.” | leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads | screen | inline | none | 8 |
| **5** | `table:media_audiences` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_content_calendar` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 10 |
| **5** | `table:media_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_image_styles` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_schedule_settings` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 2 |
| **5** | `table:media_topic_goals` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:media_topics` | Media manager — plan, schedule, publish and measure social content — the post goes out when you said | media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube | bell | toast | none | 3 |
| **5** | `table:medical_information` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | — | none | 3 |
| **5** | `table:member_contact_methods` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 2 |
| **5** | `table:member_notes` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 5 |
| **5** | `table:members` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 10 |
| **5** | `table:notification_log` | The bell itself — badge, dropdown, mark read, mark all read — you will be told when something needs you | notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight | self | — | none | 4 |
| **5** | `table:notification_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 4 |
| **5** | `table:outreach_crm_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_queued_tasks` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | mutation onError | none | 1 |
| **5** | `table:outreach_raw_leads` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 4 |
| **5** | `table:outreach_settings` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 2 |
| **5** | `table:outreach_suppression` | AI outreach — build a list, draft, send, suppress, track daily usage — the campaign runs inside its limits | outreach_* tables and outreach-send-email | bell | toast | none | 1 |
| **5** | `table:partner_agreements` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 1 |
| **5** | `table:partner_alert_notifications` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 2 |
| **5** | `table:partner_alert_subscriptions` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 5 |
| **5** | `table:partner_members` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:partner_post_links` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 3 |
| **5** | `table:partner_presentations` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | toast | none | 2 |
| **5** | `table:partner_pricing_tiers` | Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner — your referral is tracked and you are paid for it | the partner_* tables and the partner-admin-* / partner-*-invite edge functions | nobody | mutation onError | none | 3 |
| **5** | `table:payers` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 1 |
| **5** | `table:shift_escalation_chain` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 1 |
| **5** | `table:shift_notes` | Write a handover note; go on/off duty — the next shift knows what happened | shift_notes / staff_presence | screen | toast | none | 3 |
| **5** | `table:staff_activity_log` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_documents` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | mutation onError | none | 1 |
| **5** | `table:staff_holidays` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 3 |
| **5** | `table:staff_invites` | Invite a colleague, accept an invite, register, manage staff records and documents — your account exists and you can get in | staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log | email | toast | none | 1 |
| **5** | `table:staff_shift_covers` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 2 |
| **5** | `table:staff_shifts` | Request holiday, approve/decline, offer and accept shift cover, edit the rota — the person who has to act finds out | staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts | bell | mutation onError | none | 5 |
| **5** | `table:subscriptions` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | — | none | 3 |
| **5** | `table:tasks` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 9 |
| **5** | `table:ticket_comments` | Create/assign a task; raise an internal ticket; comment on one — the person it is assigned to picks it up | tasks / internal_tickets / ticket_comments | screen | toast | none | 1 |
| **5** | `table:video_brand_settings` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 2 |
| **5** | `table:video_outreach_links` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:video_projects` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 3 |
| **5** | `table:video_renders` | Video hub — queue a render, watch it complete — you will know when the render is ready | video_* tables; video-render-queue; video-render-webhook writes the completion notification | bell | mutation onError | none | 1 |
| **5** | `table:website_events` | Page tracking (mounted app-wide in App.tsx) — — nothing is promised to the user | website_events | self | — | none | 2 |
| **5** | `table:website_images` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | — | none | 3 |
| **6** | `fn:ai-execute-action` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | mutation onError | none | 1 |
| **6** | `fn:save-api-keys` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 2 |
| **6** | `fn:send-test-email` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | toast | none | 1 |
| **6** | `fn:test-twilio` | Settings — save provider keys, send a test email, test Twilio — your credentials work | save-api-keys (secrets never reach the client); send-test-email; test-twilio | self | mutation onError | none | 1 |
| **6** | `table:admin_ideas` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | mutation onError | none | 3 |
| **6** | `table:ai_actions` | Isabella executes a tool action — the assistant does what she is permitted to do and nothing more | ai-execute-action → ai_actions | self | toast | none | 3 |
| **6** | `table:ai_agent_configs` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 1 |
| **6** | `table:ai_agents` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | toast | none | 3 |
| **6** | `table:ai_memory` | Admin edits Isabella's configuration, prompts and memory; runs her — the configuration you saved is the configuration she uses | ai_agents / ai_agent_configs / ai_memory; ai-run | self | mutation onError | none | 3 |
| **6** | `table:blog_posts` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 5 |
| **6** | `table:email_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:email_templates` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 2 |
| **6** | `table:isabella_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:member_notification_optin` | Member edits their emergency contacts, medical information, notification opt-in — this is what an operator will see when you press the pendant | emergency_contacts / medical_information / member_notification_optin | self | mutation onError | none | 1 |
| **6** | `table:operational_costs` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 4 |
| **6** | `table:payments` | Staff edit a member record, notes, contact methods, payer, subscription, payment — the record reflects what was agreed | the named tables | self | toast | none | 1 |
| **6** | `table:pricing_plans` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:pricing_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 1 |
| **6** | `table:products` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 6 |
| **6** | `table:system_settings` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **6** | `table:testimonials` | Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs — the change is saved and takes effect | the named configuration tables | self | toast | none | 3 |
| **7** | `fn:admin-subscription-action` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 2 |
| **7** | `fn:cancel-mollie-subscription` | Staff pause / resume / cancel a subscription — billing changes, and the record says who changed it | admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row | self | mutation onError | `src/test/staffMemberActions.test.tsx` | 1 |
| **7** | `table:activity_logs` | Every staff action that must be attributable — who did what, and why | activity_logs, with enforce_member_action_attribution() refusing an unattributed member action | self | — | `src/test/staffMemberActions.test.tsx` | 4 |
| **9** | `fn:notify-fulfilment` | Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested — the next person in the chain knows the device is theirs to move | notify-fulfilment → member_notification_log, one row per channel decision | bell | — | `src/test/notifyFulfilmentDispatcher.test.ts` | 1 |
| **9** | `fn:partner-register` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `fn:partner-verify` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | — | `e2e/partnerJourney.spec.ts` | 1 |
| **9** | `table:conversations` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 16 |
| **9** | `table:messages` | Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen — “we'll get back to you” — a member message reaches the team | conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages | bell | — | `src/test/inboundMessages.test.ts` | 15 |
| **10** | `table:partners` | Partner signs up at /partner/join and verifies their email — your partner account exists and someone at ICE knows you joined | partner-register → partners; partner-verify confirms the address | bell | toast | `e2e/partnerJourney.spec.ts` | 10 |

## Notes, worst first

### `channel:registration_drafts` — 0/10 (dead control)

- **control** Leads page abandoned-draft list; media manager post list and metrics
- **promised** the list updates itself
- **goes to** postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics
- **who is told** nobody — the wire cannot fire at all
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/LeadsPage.tsx:187

Same cause as the two above — table not in the publication. Lower consequence (admin surfaces, reloadable). Fixed in the same bundle.

### `channel:shift_notes` — 0/10 (dead control)

- **control** Shift notes page — live handover list
- **promised** code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.”
- **goes to** supabase.channel('call-centre-shift-notes') → fetchNotes()
- **who is told** nobody — the wire cannot fire at all
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/call-centre/ShiftNotesPage.tsx:88
- **tests naming it** src/test/callCentreCrud.test.ts (candidates, not proofs)

`shift_notes` is not published to supabase_realtime, so the comment describes behaviour that has never happened. A handover note written by the outgoing shift is invisible to the incoming one until they reload — on the one screen whose entire purpose is handover. Fixed in the held schema bundle.

### `channel:social_post_metrics` — 0/10 (dead control)

- **control** Leads page abandoned-draft list; media manager post list and metrics
- **promised** the list updates itself
- **goes to** postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics
- **who is told** nobody — the wire cannot fire at all
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/usePublishedPosts.ts:45

Same cause as the two above — table not in the publication. Lower consequence (admin surfaces, reloadable). Fixed in the same bundle.

### `channel:social_posts` — 0/10 (dead control)

- **control** Leads page abandoned-draft list; media manager post list and metrics
- **promised** the list updates itself
- **goes to** postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics
- **who is told** nobody — the wire cannot fire at all
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useSocialPosts.ts:78

Same cause as the two above — table not in the publication. Lower consequence (admin surfaces, reloadable). Fixed in the same bundle.

### `channel:tasks` — 0/10 (dead control)

- **control** Call-centre dashboard — courtesy-call list auto-refresh
- **promised** the courtesy-call list stays current while the operator works
- **goes to** supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls()
- **who is told** nobody — the wire cannot fire at all
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/call-centre/StaffDashboard.tsx:184
- **tests naming it** src/test/adminPortalNight.test.ts (candidates, not proofs)

`tasks` is NOT in the supabase_realtime publication (verified against the real schema, not grep: 28 tables are published and this is not one). The subscription is established and never fires, so a courtesy call assigned to an operator does not appear until they reload. Fixed in the held schema bundle.

### `fn:send-email` — 0/10 (dead control)

- **control** Billing reminder emails (useBillingReminders)
- **promised** a member behind on payment is reminded before anything is cut off
- **goes to** send-email edge function → Resend
- **who is told** email — the wire cannot fire at all
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** —
- **call sites** src/hooks/useBillingReminders.ts:208
- **tests naming it** src/test/emailTransport.test.ts, src/test/notifyFulfilmentDispatcher.test.ts (candidates, not proofs)

`src/hooks/useBillingReminders.ts` is imported by NOTHING except a test — no page, no layout, no other hook, and there is no server-side twin (no cron, no migration, no edge function that sends billing reminders). The hook is unreachable, so no billing reminder has ever been sent from this app. Reported, not fixed: whether members should be chased automatically is a business decision, and it touches billing.

### `table:member_interactions` — 0/10 (dead control)

- **control** Communication log — every logSms / logCall / logWhatsApp / logEmail / logPaymentReceived helper
- **promised** a member's contact history is on their record
- **goes to** member_interactions
- **who is told** nobody — the wire cannot fire at all
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** —
- **call sites** src/lib/communicationLogger.ts:75, src/lib/communicationLogger.ts:177

`src/lib/communicationLogger.ts` exports ten log functions and is imported by nothing. Meanwhile `ActivityTab.tsx` (member detail) and `AlertDetailPanel.tsx` (call centre) both READ member_interactions — two screens that can only ever be empty, with no hint that the writer was never wired up. Reported, not fixed: choosing which events deserve a log row is a product decision, and one of the readers is on the alert path.

### `channel:alert_escalations` — 4/10 (arrives, unproven)

- **control** Operator alert queue and SOS takeover screen — live alert arrival
- **promised** a pendant press reaches an operator screen in under a second
- **goes to** postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published)
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useSOSConference.ts:216

The one path golden rule 8 forbids mocking. Published and subscribed, and the operator is by definition watching the queue, so `screen` is the right audience here rather than a notification. Score is capped below 10 by this register's own rule that a proof must be named and end-to-end; see the proof column and §Proofs.

### `channel:alerts` — 4/10 (arrives, unproven)

- **control** Operator alert queue and SOS takeover screen — live alert arrival
- **promised** a pendant press reaches an operator screen in under a second
- **goes to** postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published)
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/DeviceOfflineAlertsCard.tsx:63, src/components/layout/CallCentreSidebar.tsx:94, src/hooks/useAlerts.ts:400, src/hooks/useAlertsRealtime.ts:16 +3
- **tests naming it** src/test/alertOwnership.test.ts, src/test/isabellaAlertCapability.test.ts, src/test/sosDrill.test.ts, src/test/sosEscalation.e2e.test.ts +1 (candidates, not proofs)

The one path golden rule 8 forbids mocking. Published and subscribed, and the operator is by definition watching the queue, so `screen` is the right audience here rather than a notification. Score is capped below 10 by this register's own rule that a proof must be named and end-to-end; see the proof column and §Proofs.

### `channel:conference_participants` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useSOSConference.ts:167

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `channel:conference_rooms` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useSOSConference.ts:149

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `channel:conversations` — 4/10 (arrives, unproven)

- **control** Live arrival of a message on either Messages screen; the member-side notify and mark-read calls
- **promised** a new message appears, and the team is told
- **goes to** postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/MessagesPanel.tsx:69, src/pages/admin/MessagesPage.tsx:149, src/pages/call-centre/CallCentreDashboard.tsx:53, src/pages/call-centre/MessagesPage.tsx:150 +2
- **tests naming it** src/test/conversationPreview.test.tsx, src/test/inboundMessages.test.ts, src/test/isabellaThread.test.tsx, src/test/memberSelfService.test.ts (candidates, not proofs)

Split from the tables above, which cite `inboundMessages`. That suite proves an INBOUND SMS becomes a message row; it does not exercise these subscriptions, and it does not cover member-self-service's `notify_staff` leg — the one that actually rings the bell. Claiming it for all five wires was the register scoring a neighbour's test, which is the habit it exists to break.

### `channel:devices` — 4/10 (arrives, unproven)

- **control** Assign, program, test and retire a device; publish documentation
- **promised** the device on the member's wrist is the device on the record
- **goes to** devices / documentation, both published
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/DeviceIssuesQueue.tsx:52, src/components/call-centre/PendantLiveStatusModal.tsx:90, src/hooks/useDeviceRealtime.ts:20, src/hooks/useOpsRealtime.ts:21 +1
- **tests naming it** src/test/adminPortalNight.test.ts, src/test/iceImportFunction.test.ts, src/test/pendantFulfilmentTransitions.test.tsx, src/test/pendantOrderHook.test.tsx +1 (candidates, not proofs)

Device state feeds the operator card, so this is adjacent to the SOS path without being on it.

### `channel:internal_tickets` — 4/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/TicketsPage.tsx:146
- **tests naming it** src/test/callCentreCrud.test.ts (candidates, not proofs)

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `channel:isabella_assessment_notes` — 4/10 (arrives, unproven)

- **control** Operator alert queue and SOS takeover screen — live alert arrival
- **promised** a pendant press reaches an operator screen in under a second
- **goes to** postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published)
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/sos/SOSAlertBar.tsx:123, src/hooks/useSOSConference.ts:199
- **tests naming it** src/test/alertResolution.test.ts (candidates, not proofs)

The one path golden rule 8 forbids mocking. Published and subscribed, and the operator is by definition watching the queue, so `screen` is the right audience here rather than a notification. Score is capped below 10 by this register's own rule that a proof must be named and end-to-end; see the proof column and §Proofs.

### `channel:leads` — 4/10 (arrives, unproven)

- **control** Leads list and dashboard leads widget — live arrival of a new enquiry
- **promised** a new enquiry appears without a reload
- **goes to** postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/dashboard/LeadsWidget.tsx:42, src/pages/admin/LeadsPage.tsx:184, src/pages/call-centre/LeadsPage.tsx:78

This subscription WORKS — leads is published and the refetch fires. It is also the reason the original defect was so easy to miss: the wire looks alive, because on a screen someone has open the lead really does appear. Nothing brings anyone TO that screen, which is the whole difference between a live list and being told. PR (a) adds the notification; this row stays `screen` because that is all a subscription can ever be.

### `channel:messages` — 4/10 (arrives, unproven)

- **control** Live arrival of a message on either Messages screen; the member-side notify and mark-read calls
- **promised** a new message appears, and the team is told
- **goes to** postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/MessagesTab.tsx:93, src/components/call-centre/MessagesPanel.tsx:80, src/components/layout/CallCentreSidebar.tsx:99, src/pages/admin/MessagesPage.tsx:178 +4
- **tests naming it** src/test/conversationPreview.test.tsx, src/test/inboundMessages.test.ts, src/test/isabellaThread.test.tsx, src/test/memberSelfService.test.ts +3 (candidates, not proofs)

Split from the tables above, which cite `inboundMessages`. That suite proves an INBOUND SMS becomes a message row; it does not exercise these subscriptions, and it does not cover member-self-service's `notify_staff` leg — the one that actually rings the bell. Claiming it for all five wires was the register scoring a neighbour's test, which is the habit it exists to break.

### `channel:outreach_raw_leads` — 4/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOutreachRawLeads.ts:80

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `channel:ticket_comments` — 4/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/TicketsPage.tsx:166

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `channel:video_exports` — 4/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useVideoExports.ts:32

Renders and exports are both published, and the webhook notifies. Unproven.

### `channel:video_renders` — 4/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useVideoRenders.ts:26

Renders and exports are both published, and the webhook notifies. Unproven.

### `fn:facebook-metrics` — 4/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/usePublishedPosts.ts:122, src/hooks/usePublishedPosts.ts:168, src/hooks/usePublishedPosts.ts:218
- **tests naming it** src/test/archivedFunctions.test.ts (candidates, not proofs)

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:member-self-service` — 4/10 (arrives, unproven)

- **control** Live arrival of a message on either Messages screen; the member-side notify and mark-read calls
- **promised** a new message appears, and the team is told
- **goes to** postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useFeedback.ts:41, src/pages/client/MedicalInfoPage.tsx:127, src/utils/notifications.ts:48, src/utils/notifications.ts:63
- **tests naming it** src/test/medicalInfoFields.test.tsx, src/test/memberSelfService.test.ts, src/test/navUnreadBadge.test.tsx (candidates, not proofs)

Split from the tables above, which cite `inboundMessages`. That suite proves an INBOUND SMS becomes a message row; it does not exercise these subscriptions, and it does not cover member-self-service's `notify_staff` leg — the one that actually rings the bell. Claiming it for all five wires was the register scoring a neighbour's test, which is the habit it exists to break.

### `fn:partner-admin-create` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/AddPartnerPage.tsx:97
- **tests naming it** src/test/emailTransport.test.ts (candidates, not proofs)

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:partner-complete-invite` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/partner/PartnerInvitePage.tsx:204

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:partner-send-invite` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/partner/CareDashboard.tsx:154, src/pages/partner/PartnerInvitesPage.tsx:157
- **tests naming it** src/test/emailTransport.test.ts (candidates, not proofs)

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:partner-validate-invite` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/partner/PartnerInvitePage.tsx:135

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:process-commissions` — 4/10 (arrives, unproven)

- **control** Run the commission calculation
- **promised** partners are paid what they earned
- **goes to** process-commissions → partner_commissions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/CommissionsPage.tsx:185, src/pages/admin/PartnersQAPage.tsx:197

Money. Nobody is told it ran, or that it failed, and there is no test. A red in the report.

### `fn:save-registration-draft` — 4/10 (arrives, unproven)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useRegistrationDraft.ts:38, src/hooks/useRegistrationDraft.ts:71

OUT OF SCOPE HERE BY INSTRUCTION — the join→pay path is covered by the separate goal already running, and duplicating it would put two changes on the same files. Recorded so the register is complete, deliberately not re-proven or altered. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `fn:sos-alert-resolve` — 4/10 (arrives, unproven)

- **control** Operator: acknowledge / resolve an alert; run a drill
- **promised** the alert leaves the queue and the audit says who closed it
- **goes to** alerts (update) via sos-alert-resolve; sos-drill for rehearsals
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/lib/alertResolution.ts:31
- **tests naming it** src/test/alertResolution.test.ts (candidates, not proofs)

Human gate: any change here is Lee's read (SOS path). Not touched by this goal.

`src/test/alertResolution.test.ts` was cited here and then WITHDRAWN on reading it. It is a good suite — it drives the real `resolveAlertViaFunction`, pins the invoke contract, and scans the source to prove no client writes `status='resolved'` directly any more. But it asserts the CALL and the absence of a bypass; the destination side is checked by reading the edge function's source, not by executing it, so nothing here proves the alert actually left the queue. Under this register's own rule that is not an end-to-end proof, and on the SOS path of all places the score should not flatter. 5, not 7.

### `fn:sos-conference-join` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useSOSConference.ts:248, src/hooks/useSOSConference.ts:306

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `fn:sos-conference-leave` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useSOSConference.ts:266, src/hooks/useSOSConference.ts:278, src/hooks/useSOSConference.ts:292

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `fn:sos-drill` — 4/10 (arrives, unproven)

- **control** Operator: acknowledge / resolve an alert; run a drill
- **promised** the alert leaves the queue and the audit says who closed it
- **goes to** alerts (update) via sos-alert-resolve; sos-drill for rehearsals
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/lib/sosDrill.ts:21, src/lib/sosDrill.ts:32
- **tests naming it** src/test/sosDrill.test.ts (candidates, not proofs)

Human gate: any change here is Lee's read (SOS path). Not touched by this goal.

`src/test/alertResolution.test.ts` was cited here and then WITHDRAWN on reading it. It is a good suite — it drives the real `resolveAlertViaFunction`, pins the invoke contract, and scans the source to prove no client writes `status='resolved'` directly any more. But it asserts the CALL and the absence of a bypass; the destination side is checked by reading the edge function's source, not by executing it, so nothing here proves the alert actually left the queue. Under this register's own rule that is not an end-to-end proof, and on the SOS path of all places the score should not flatter. 5, not 7.

### `fn:staff-complete-invite` — 4/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/staff/StaffInvitePage.tsx:212

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `fn:staff-validate-invite` — 4/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/staff/StaffInvitePage.tsx:144

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `fn:track-invite-view` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/LandingPage.tsx:63

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:twilio-call-me` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/chat/CallMeModal.tsx:73

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `fn:twilio-token` — 4/10 (arrives, unproven)

- **control** SOS takeover — join the call, invite a contact, leave
- **promised** the operator is speaking to the member, and to whoever else is needed
- **goes to** sos-conference-* edge functions → Twilio; conference_rooms / conference_participants
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useTwilioDevice.ts:43

SOS path — untouched here and flagged. No end-to-end proof was found for the conference leg, and Twilio credentials are a production secret this repo cannot check, so it cannot score above 6 under the rubric. Lee's gate.

### `fn:validate-member-update-token` — 4/10 (arrives, unproven)

- **control** Member-update link — staff request a details check, member submits it without logging in
- **promised** confirm your details from the link we sent you
- **goes to** send-member-update-request → token → validate-member-update-token → submit-member-update
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/MemberUpdatePage.tsx:104

A member confirms or corrects their details and no one is told the answer came back. Not fixed in this goal (below the reds being fixed, and it needs a decision about who owns the follow-up) — listed as a red in the report.

### `fn:video-render-queue` — 4/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/video-hub/RenderVariantButtons.tsx:44, src/components/admin/video-hub/VideoCreateTab.tsx:427, src/components/admin/video-hub/VideoProjectsTab.tsx:91, src/components/admin/video-hub/VideoProjectsTab.tsx:119 +2

Renders and exports are both published, and the webhook notifies. Unproven.

### `link:wa.me` — 4/10 (arrives, unproven)

- **control** WhatsApp hand-off and outbound WhatsApp
- **promised** message them on WhatsApp
- **goes to** wa.me deep link; twilio-whatsapp for outbound
- **who is told** whatsapp
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/MemberQuickSearch.tsx:108, src/components/client/NotificationPreferences.tsx:105, src/components/partner/ShareContentSection.tsx:46, src/hooks/useInputValidation.ts:88 +9

Deep link always works; the outbound function returns “Twilio not configured” when the secret is absent, which is a production question.

### `table:ai_events` — 4/10 (arrives, unproven)

- **control** Isabella actions and observations
- **promised** what the assistant did is on the record
- **goes to** ai_events (published to supabase_realtime)
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/dashboard/AISalesDesk.tsx:128, src/hooks/useShiftCovers.ts:123, src/hooks/useShiftCovers.ts:202, src/hooks/useStaffHolidays.ts:128 +2

Some ai_events call sites sit beside notifyUsers; the log row itself is for humans to audit later.

### `table:alerts` — 4/10 (arrives, unproven)

- **control** Operator: acknowledge / resolve an alert; run a drill
- **promised** the alert leaves the queue and the audit says who closed it
- **goes to** alerts (update) via sos-alert-resolve; sos-drill for rehearsals
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/sos/SOSActionPanel.tsx:190, src/components/call-centre/sos/SOSActionPanel.tsx:209, src/components/call-centre/sos/SOSActionPanel.tsx:218, src/hooks/useAlerts.ts:376 +3
- **tests naming it** src/test/alertOwnership.test.ts, src/test/isabellaAlertCapability.test.ts, src/test/sosDrill.test.ts, src/test/sosEscalation.e2e.test.ts +1 (candidates, not proofs)

Human gate: any change here is Lee's read (SOS path). Not touched by this goal.

`src/test/alertResolution.test.ts` was cited here and then WITHDRAWN on reading it. It is a good suite — it drives the real `resolveAlertViaFunction`, pins the invoke contract, and scans the source to prove no client writes `status='resolved'` directly any more. But it asserts the CALL and the absence of a bypass; the destination side is checked by reading the edge function's source, not by executing it, so nothing here proves the alert actually left the queue. Under this register's own rule that is not an end-to-end proof, and on the SOS path of all places the score should not flatter. 5, not 7.

### `table:devices` — 4/10 (arrives, unproven)

- **control** Assign, program, test and retire a device; publish documentation
- **promised** the device on the member's wrist is the device on the record
- **goes to** devices / documentation, both published
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/devices/DeviceManagementModeToggle.tsx:24, src/components/admin/member-detail/DeviceTab.tsx:160, src/components/admin/member-detail/DeviceTab.tsx:216, src/components/admin/member-detail/DeviceTab.tsx:237 +15
- **tests naming it** src/test/adminPortalNight.test.ts, src/test/iceImportFunction.test.ts, src/test/pendantFulfilmentTransitions.test.tsx, src/test/pendantOrderHook.test.tsx +1 (candidates, not proofs)

Device state feeds the operator card, so this is adjacent to the SOS path without being on it.

### `table:internal_tickets` — 4/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useAgentHandoff.ts:46, src/hooks/useAgentHandoff.ts:155, src/pages/admin/TicketsPage.tsx:276, src/pages/admin/TicketsPage.tsx:309
- **tests naming it** src/test/callCentreCrud.test.ts (candidates, not proofs)

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `table:order_items` — 4/10 (arrives, unproven)

- **control** Staff move an order through fulfilment; add or remove an order line
- **promised** the order says where the device actually is
- **goes to** orders / order_items
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/lib/allocatePendant.ts:90
- **tests naming it** src/test/pendantFulfilmentTransitions.test.tsx, src/test/pendantOrderHook.test.tsx, src/test/webhookActivationContract.test.ts (candidates, not proofs)

Split from `fn:notify-fulfilment`, which was carrying these two rows on its proof. That suite proves the FAN-OUT decides correctly; it does not prove a staff edit to an order reaches the table and shows on the screen. Different wire, so no proof.

### `table:orders` — 4/10 (arrives, unproven)

- **control** Staff move an order through fulfilment; add or remove an order line
- **promised** the order says where the device actually is
- **goes to** orders / order_items
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useFulfilmentState.ts:84, src/hooks/useOrderActions.ts:36, src/lib/allocatePendant.ts:105, src/lib/allocatePendant.ts:125 +1
- **tests naming it** src/test/fulfilmentStateContract.test.ts, src/test/notifyFulfilmentDispatcher.test.ts, src/test/ordersFulfilmentActions.test.tsx, src/test/pendantFulfilmentTransitions.test.tsx +2 (candidates, not proofs)

Split from `fn:notify-fulfilment`, which was carrying these two rows on its proof. That suite proves the FAN-OUT decides correctly; it does not prove a staff edit to an order reaches the table and shows on the screen. Different wire, so no proof.

### `table:outreach_campaigns` — 4/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOutreachCampaigns.ts:39, src/hooks/useOutreachCampaigns.ts:92, src/hooks/useOutreachCampaigns.ts:120, src/hooks/useOutreachRawLeads.ts:377

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_daily_usage` — 4/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOutreachCaps.ts:176, src/hooks/useOutreachCaps.ts:181, src/hooks/useOutreachRawLeads.ts:392, src/hooks/useOutreachRawLeads.ts:405

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_email_drafts` — 4/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/outreach/OutreachLeadDetailDialog.tsx:94, src/hooks/useFailedActions.ts:128

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:partner_commissions` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOrderActions.ts:126, src/pages/admin/CommissionsPage.tsx:144, src/pages/admin/PartnerDetailPage.tsx:297

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_invites` — 4/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/partner/CareDashboard.tsx:106, src/components/partner/CareDashboard.tsx:139, src/components/partner/CareDashboard.tsx:175, src/hooks/useOrderActions.ts:147 +2

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:social_posts` — 4/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useFailedActions.ts:102, src/hooks/usePartnerPostLinks.ts:162, src/hooks/usePartnerPostLinks.ts:189, src/hooks/usePartnerPostLinks.ts:214 +5

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:staff` — 4/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/dashboard/AISalesDesk.tsx:81, src/components/admin/member-detail/MessagesTab.tsx:190, src/components/admin/member-detail/MessagesTab.tsx:245, src/components/admin/member-detail/NotesTab.tsx:161 +14
- **tests naming it** src/test/bootstrapAdmin.test.ts, src/test/callCentreNight.test.ts, src/test/clientWriteSweep.test.ts, src/test/conversationPreview.test.tsx +9 (candidates, not proofs)

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `table:staff_presence` — 4/10 (arrives, unproven)

- **control** Write a handover note; go on/off duty
- **promised** the next shift knows what happened
- **goes to** shift_notes / staff_presence
- **who is told** screen
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useStaffHeartbeat.ts:17, src/hooks/useStaffHeartbeat.ts:39

See channel:shift_notes — the note lands, the live update does not.

### `channel:members` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMembersRealtime.ts:27, src/pages/call-centre/StaffDashboard.tsx:177
- **tests naming it** src/test/addMemberWizard.test.tsx, src/test/addMemberWizardHonesty.test.ts, src/test/awayAndAddress.test.tsx, src/test/clientWriteSweep.test.ts +6 (candidates, not proofs)

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

### `channel:notification_log` — 5/10 (arrives, unproven)

- **control** The bell itself — badge, dropdown, mark read, mark all read
- **promised** you will be told when something needs you
- **goes to** notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/dashboard/NotificationLog.tsx:44, src/hooks/useNotifications.ts:192, src/hooks/useNotifications.ts:218
- **tests naming it** src/test/memberSelfService.test.ts (candidates, not proofs)

The one notification channel this repo can prove is live: published, no secret required, and RLS verified so a member sees only rows addressed to them. Everything scored `bell` depends on this row being right.

### `channel:outreach_crm_leads` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOutreachCRMLeads.ts:22

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `fn:ai-run` — 5/10 (arrives, unproven)

- **control** Admin edits Isabella's configuration, prompts and memory; runs her
- **promised** the configuration you saved is the configuration she uses
- **goes to** ai_agents / ai_agent_configs / ai_memory; ai-run
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useAIAgentHealth.ts:49, src/hooks/useAIAgents.ts:406, src/hooks/useAIChat.ts:337
- **tests naming it** src/test/isabellaAlertCapability.test.ts, src/test/isabellaStreaming.test.ts (candidates, not proofs)

Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved in this UI reaches the database and is the one she reads. Citing it here would have been the register scoring itself on an adjacent test.

### `fn:complete-member-registration` — 5/10 (arrives, unproven)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/auth/CompleteRegistration.tsx:85
- **tests naming it** src/test/completeRegistration.test.ts (candidates, not proofs)

OUT OF SCOPE HERE BY INSTRUCTION — the join→pay path is covered by the separate goal already running, and duplicating it would put two changes on the same files. Recorded so the register is complete, deliberately not re-proven or altered. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `fn:create-checkout` — 5/10 (arrives, unproven)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** inline
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/join/steps/JoinPaymentStep.tsx:74
- **tests naming it** src/test/webhookActivationContract.test.ts (candidates, not proofs)

OUT OF SCOPE HERE BY INSTRUCTION — the join→pay path is covered by the separate goal already running, and duplicating it would put two changes on the same files. Recorded so the register is complete, deliberately not re-proven or altered. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `fn:create-mollie-checkout` — 5/10 (arrives, unproven)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** inline
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/join/steps/JoinPaymentStep.tsx:69

OUT OF SCOPE HERE BY INSTRUCTION — the join→pay path is covered by the separate goal already running, and duplicating it would put two changes on the same files. Recorded so the register is complete, deliberately not re-proven or altered. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `fn:facebook-unpublish` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/usePublishedPosts.ts:268
- **tests naming it** src/test/archivedFunctions.test.ts (candidates, not proofs)

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:generate-content-plan` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/media/strategy/ContentPlanner.tsx:79
- **tests naming it** src/test/archivedFunctions.test.ts (candidates, not proofs)

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:notify-admin` — 5/10 (arrives, unproven)

- **control** Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures
- **promised** an operational failure is not silent
- **goes to** notify-admin edge function → notification_log (+ WhatsApp where configured)
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/dashboard/NotificationSettings.tsx:134, src/components/admin/dashboard/PaidSalesFeed.tsx:132
- **tests naming it** src/test/sosDrill.test.ts (candidates, not proofs)

Reaches the bell, which is live. Untested end-to-end from the caller side.

### `fn:outreach-send-email` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOutreachPipeline.ts:14
- **tests naming it** src/test/archivedFunctions.test.ts (candidates, not proofs)

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `fn:partner-admin-delete` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/PartnersPage.tsx:98

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:partner-admin-invite` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/InvitePartnerDialog.tsx:47
- **tests naming it** src/test/emailTransport.test.ts, src/test/partnerInviteConversion.test.ts (candidates, not proofs)

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `fn:publish-scheduled` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useScheduledContent.ts:155
- **tests naming it** src/test/archivedFunctions.test.ts (candidates, not proofs)

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:send-member-update-request` — 5/10 (arrives, unproven)

- **control** Member-update link — staff request a details check, member submits it without logging in
- **promised** confirm your details from the link we sent you
- **goes to** send-member-update-request → token → validate-member-update-token → submit-member-update
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/MemberUpdateRequestModal.tsx:123
- **tests naming it** src/test/emailTransport.test.ts, src/test/lovableDebris.test.ts, src/test/readinessQueue.test.tsx (candidates, not proofs)

A member confirms or corrects their details and no one is told the answer came back. Not fixed in this goal (below the reds being fixed, and it needs a decision about who owns the follow-up) — listed as a red in the report.

### `fn:staff-register` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/staff/StaffForm.tsx:73, src/hooks/useStaffMembers.ts:142
- **tests naming it** src/test/staffInviteEmail.test.ts (candidates, not proofs)

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `fn:staff-send-invite` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useStaffInvites.ts:68
- **tests naming it** src/test/emailTransport.test.ts, src/test/staffInviteEmail.test.ts (candidates, not proofs)

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `fn:submit-member-update` — 5/10 (arrives, unproven)

- **control** Member-update link — staff request a details check, member submits it without logging in
- **promised** confirm your details from the link we sent you
- **goes to** send-member-update-request → token → validate-member-update-token → submit-member-update
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/MemberUpdatePage.tsx:170

A member confirms or corrects their details and no one is told the answer came back. Not fixed in this goal (below the reds being fixed, and it needs a decision about who owns the follow-up) — listed as a red in the report.

### `fn:submit-registration` — 5/10 (arrives, unproven)

- **control** /join — submit registration, pay by card (Stripe) or SEPA (Mollie)
- **promised** you are signed up and covered once you have paid
- **goes to** submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4)
- **who is told** bell
- **failure shown to user** inline
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/join/steps/JoinPaymentStep.tsx:47, src/components/join/steps/JoinPaymentStep.tsx:91
- **tests naming it** src/test/emailTransport.test.ts, src/test/testModeServerSide.test.ts (candidates, not proofs)

OUT OF SCOPE HERE BY INSTRUCTION — the join→pay path is covered by the separate goal already running, and duplicating it would put two changes on the same files. Recorded so the register is complete, deliberately not re-proven or altered. notify-admin fires `sale.paid` from the webhook side, which is why `told` is bell.

### `fn:twilio-sms` — 5/10 (arrives, unproven)

- **control** Email hand-off; outbound SMS
- **promised** email or text this person
- **goes to** the user's mail client; twilio-sms for outbound
- **who is told** external
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/devices/ProvisioningChecklist.tsx:246, src/components/call-centre/AlertDetailPanel.tsx:184, src/hooks/useDeviceSmsCommands.ts:123
- **tests naming it** src/test/inboundMessages.test.ts, src/test/notifyFulfilmentDispatcher.test.ts (candidates, not proofs)

mailto: leaves the platform entirely — nothing is recorded and nothing can be. twilio-sms degrades to “Twilio not configured”.

### `fn:twilio-whatsapp` — 5/10 (arrives, unproven)

- **control** WhatsApp hand-off and outbound WhatsApp
- **promised** message them on WhatsApp
- **goes to** wa.me deep link; twilio-whatsapp for outbound
- **who is told** whatsapp
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/AlertDetailPanel.tsx:247
- **tests naming it** src/test/inboundMessages.test.ts, src/test/notifyFulfilmentDispatcher.test.ts (candidates, not proofs)

Deep link always works; the outbound function returns “Twilio not configured” when the secret is absent, which is a production question.

### `fn:youtube-disconnect` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useYouTubeIntegration.ts:88

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:youtube-integration-status` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useYouTubeIntegration.ts:26

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:youtube-oauth-start` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useYouTubeIntegration.ts:35

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `fn:youtube-publish` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useYouTubeIntegration.ts:118

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `link:mailto` — 5/10 (arrives, unproven)

- **control** Email hand-off; outbound SMS
- **promised** email or text this person
- **goes to** the user's mail client; twilio-sms for outbound
- **who is told** external
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/sos/SOSActionPanel.tsx:549, src/components/dashboard/LeadsWidget.tsx:149, src/components/join/steps/JoinConfirmationStep.tsx:168, src/components/partner/ShareContentSection.tsx:54 +15

mailto: leaves the platform entirely — nothing is recorded and nothing can be. twilio-sms degrades to “Twilio not configured”.

### `link:tel` — 5/10 (arrives, unproven)

- **control** Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre
- **promised** pressing this rings the number shown
- **goes to** the device dialler, via a tel: href built from company settings or a member's stored number
- **who is told** external
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/call-centre/AlertDetailPanel.tsx:155, src/components/call-centre/AlertDetailPanel.tsx:160, src/components/call-centre/AlertDetailPanel.tsx:502, src/components/call-centre/AlertDetailPanel.tsx:586 +27

Reaches the dialler, and `telHref()` returns null when the number is unset so a “Call us” card with no number in it is not rendered — the right failure. Nothing is recorded: a call placed this way leaves no interaction row (see table:member_interactions, whose logger is dead code), so the platform cannot say a member was ever phoned. On the SOS path the brief already calls for replacing tel: with the Twilio conference; that is Lee's gate, not this goal.

### `rpc:get_admin_dashboard_stats` — 5/10 (arrives, unproven)

- **control** Dashboard statistics and role resolution
- **promised** the numbers on the dashboard are the numbers in the database
- **goes to** SQL functions, read-only
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/AdminDashboard.tsx:61

Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every protected route: if it fails, the guard sees no role.

### `rpc:get_sales_command_stats` — 5/10 (arrives, unproven)

- **control** Dashboard statistics and role resolution
- **promised** the numbers on the dashboard are the numbers in the database
- **goes to** SQL functions, read-only
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/dashboard/SalesCommandStrip.tsx:57

Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every protected route: if it fails, the guard sees no role.

### `rpc:get_todays_birthdays` — 5/10 (arrives, unproven)

- **control** Dashboard statistics and role resolution
- **promised** the numbers on the dashboard are the numbers in the database
- **goes to** SQL functions, read-only
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/call-centre/StaffDashboard.tsx:342

Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every protected route: if it fails, the guard sees no role.

### `rpc:get_user_role_info` — 5/10 (arrives, unproven)

- **control** Dashboard statistics and role resolution
- **promised** the numbers on the dashboard are the numbers in the database
- **goes to** SQL functions, read-only
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/contexts/AuthContext.tsx:84
- **tests naming it** e2e/helpers/supabaseStub.ts, e2e/partnerJourney.spec.ts, src/test/partnerStatusAllowlist.test.ts (candidates, not proofs)

Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every protected route: if it fails, the guard sees no role.

### `table:app_daily_metrics` — 5/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/lib/syncHub.ts:99

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:app_events` — 5/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/lib/syncHub.ts:36

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:app_finance` — 5/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/lib/syncHub.ts:66

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:conversation_messages` — 5/10 (arrives, unproven)

- **control** Isabella conversation turns
- **promised** the assistant's reply appears as it is produced
- **goes to** conversation_messages
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useAgentHandoff.ts:62, src/hooks/useAIChat.ts:169
- **tests naming it** src/test/conversationPreview.test.tsx, src/test/isabellaThread.test.tsx (candidates, not proofs)

The person who typed is the person watching. No notification owed.

### `table:crm_contacts` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/CRMContactDetailPage.tsx:202, src/pages/admin/CRMImportPage.tsx:358

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:crm_events` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/lib/crmEvents.ts:32, src/lib/crmEvents.ts:59

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:crm_import_batches` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/CRMImportPage.tsx:67, src/pages/admin/CRMImportPage.tsx:99, src/pages/admin/CRMImportPage.tsx:185, src/pages/admin/CRMImportPage.tsx:213

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:crm_import_rows` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/CRMImportPage.tsx:131, src/pages/admin/CRMImportPage.tsx:231

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:crm_profiles` — 5/10 (arrives, unproven)

- **control** CRM import and contact editing
- **promised** the legacy record is imported as it stands
- **goes to** crm_* tables via the import path
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/CRMContactDetailPage.tsx:185, src/pages/admin/CRMImportPage.tsx:279
- **tests naming it** src/test/iceImportFunction.test.ts (candidates, not proofs)

Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.

### `table:documentation` — 5/10 (arrives, unproven)

- **control** Assign, program, test and retire a device; publish documentation
- **promised** the device on the member's wrist is the device on the record
- **goes to** devices / documentation, both published
- **who is told** screen
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useDocumentation.ts:221
- **tests naming it** src/test/adminPortalNight.test.ts (candidates, not proofs)

Device state feeds the operator card, so this is adjacent to the SOS path without being on it.

### `table:emergency_contacts` — 5/10 (arrives, unproven)

- **control** Member edits their emergency contacts, medical information, notification opt-in
- **promised** this is what an operator will see when you press the pendant
- **goes to** emergency_contacts / medical_information / member_notification_optin
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/ContactsTab.tsx:145, src/components/admin/member-detail/ContactsTab.tsx:152, src/components/admin/member-detail/ContactsTab.tsx:183, src/pages/admin/CRMImportPage.tsx:332 +3
- **tests naming it** src/test/circleOfCareContacts.test.tsx, src/test/iceImportFunction.test.ts, src/test/operatorCardNoContacts.test.tsx, src/test/operatorQueue.test.tsx +4 (candidates, not proofs)

Life-safety data with no notification owed — the member is the actor. What it DOES need is proof that an operator can read it and a stranger cannot; the RLS harness covers the isolation half, and the end-to-end half is unproven, so 5.

### `table:leads` — 5/10 (arrives, unproven)

- **control** Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens
- **promised** “Message Sent! … Our team will review your message and respond within 24 hours.”
- **goes to** leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads
- **who is told** screen
- **failure shown to user** inline
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/products/NotifyInterestDialog.tsx:48, src/pages/admin/LeadsPage.tsx:258, src/pages/admin/LeadsPage.tsx:272, src/pages/admin/LeadsPage.tsx:286 +4

THE DEFECT THIS REGISTER CAME FROM. The row arrives and both Leads screens show it, but the only trigger on `leads` is `update_leads_updated_at` — no notification, no task, no queue. `leads` IS in supabase_realtime and /call-centre/leads does subscribe, so a lead appears live on a screen nobody is required to have open. That is not being told, and the copy promises 24 hours. Fixed in PR (a): a SECURITY DEFINER trigger notifies staff on the bell, the dashboard grows a New enquiries card, and the copy stops promising a deadline nobody committed to.

### `table:media_audiences` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMediaStrategy.ts:148, src/hooks/useMediaStrategy.ts:172, src/hooks/useMediaStrategy.ts:186

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_content_calendar` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useContentCalendar.ts:61, src/hooks/useContentCalendar.ts:76, src/hooks/useContentCalendar.ts:89, src/hooks/useContentCalendar.ts:102 +6

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_goals` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMediaStrategy.ts:77, src/hooks/useMediaStrategy.ts:101, src/hooks/useMediaStrategy.ts:115

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_image_styles` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMediaStrategy.ts:320, src/hooks/useMediaStrategy.ts:344, src/hooks/useMediaStrategy.ts:358

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_schedule_settings` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMediaStrategy.ts:404, src/hooks/useMediaStrategy.ts:409

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_topic_goals` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMediaStrategy.ts:251, src/hooks/useMediaStrategy.ts:269, src/hooks/useMediaStrategy.ts:272

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:media_topics` — 5/10 (arrives, unproven)

- **control** Media manager — plan, schedule, publish and measure social content
- **promised** the post goes out when you said
- **goes to** media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMediaStrategy.ts:243, src/hooks/useMediaStrategy.ts:265, src/hooks/useMediaStrategy.ts:287

publish-scheduled writes a notification_log row on failure, so a post that does not go out does reach the bell. The two dead realtime subscriptions in this surface are broken out above.

### `table:medical_information` — 5/10 (arrives, unproven)

- **control** Member edits their emergency contacts, medical information, notification opt-in
- **promised** this is what an operator will see when you press the pendant
- **goes to** emergency_contacts / medical_information / member_notification_optin
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/MedicalTab.tsx:116, src/components/admin/member-detail/MedicalTab.tsx:122, src/pages/admin/CRMImportPage.tsx:315
- **tests naming it** src/test/iceImportFunction.test.ts, src/test/medicalInfoFields.test.tsx, src/test/memberSelfService.test.ts, src/test/secondStageF5.test.ts (candidates, not proofs)

Life-safety data with no notification owed — the member is the actor. What it DOES need is proof that an operator can read it and a stranger cannot; the RLS harness covers the isolation half, and the end-to-end half is unproven, so 5.

### `table:member_contact_methods` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/CRMImportPage.tsx:288, src/pages/admin/CRMImportPage.tsx:296
- **tests naming it** src/test/iceImportFunction.test.ts (candidates, not proofs)

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

### `table:member_notes` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/NotesTab.tsx:178, src/components/admin/member-detail/NotesTab.tsx:205, src/components/admin/member-detail/NotesTab.tsx:221, src/pages/admin/CRMContactDetailPage.tsx:214 +1
- **tests naming it** src/test/iceImportFunction.test.ts (candidates, not proofs)

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

### `table:members` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/CourtesyCallsCard.tsx:110, src/components/admin/member-detail/CourtesyCallsCard.tsx:132, src/components/admin/member-detail/ProfileTab.tsx:110, src/components/LanguageSelector.tsx:41 +6
- **tests naming it** src/test/addMemberWizard.test.tsx, src/test/addMemberWizardHonesty.test.ts, src/test/awayAndAddress.test.tsx, src/test/clientWriteSweep.test.ts +6 (candidates, not proofs)

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

### `table:notification_log` — 5/10 (arrives, unproven)

- **control** The bell itself — badge, dropdown, mark read, mark all read
- **promised** you will be told when something needs you
- **goes to** notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useNotifications.ts:126, src/hooks/useNotifications.ts:145, src/lib/staffNotify.ts:48, src/utils/notifications.ts:26
- **tests naming it** src/test/memberSelfService.test.ts (candidates, not proofs)

The one notification channel this repo can prove is live: published, no secret required, and RLS verified so a member sees only rows addressed to them. Everything scored `bell` depends on this row being right.

### `table:notification_settings` — 5/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/dashboard/NotificationSettings.tsx:69, src/components/admin/dashboard/NotificationSettings.tsx:83, src/hooks/usePushNotifications.ts:52, src/hooks/usePushNotifications.ts:85

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:outreach_crm_leads` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/outreach/OutreachLeadDetailDialog.tsx:66, src/hooks/useOutreachCRMLeads.ts:71, src/hooks/useOutreachCRMLeads.ts:103, src/hooks/useOutreachRawLeads.ts:355

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_queued_tasks` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOutreachRawLeads.ts:332

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_raw_leads` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOutreachRawLeads.ts:164, src/hooks/useOutreachRawLeads.ts:215, src/hooks/useOutreachRawLeads.ts:362, src/hooks/useOutreachRawLeads.ts:458

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_settings` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/outreach/OutreachControlPanel.tsx:28, src/hooks/useOutreachCaps.ts:121

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:outreach_suppression` — 5/10 (arrives, unproven)

- **control** AI outreach — build a list, draft, send, suppress, track daily usage
- **promised** the campaign runs inside its limits
- **goes to** outreach_* tables and outreach-send-email
- **who is told** bell
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/outreach/OutreachLeadDetailDialog.tsx:75

outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.

### `table:partner_agreements` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/partner/AgreementRequiredModal.tsx:52

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_alert_notifications` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/usePartnerAlertNotifications.ts:57, src/hooks/usePartnerAlertNotifications.ts:123

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_alert_subscriptions` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/usePartnerAlertSubscriptions.ts:56, src/hooks/usePartnerAlertSubscriptions.ts:71, src/hooks/usePartnerAlertSubscriptions.ts:109, src/hooks/usePartnerAlertSubscriptions.ts:148 +1

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_members` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/usePartnerMembers.ts:66, src/hooks/usePartnerMembers.ts:92, src/hooks/usePartnerMembers.ts:124

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_post_links` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/usePartnerPostLinks.ts:151, src/hooks/usePartnerPostLinks.ts:181, src/hooks/usePartnerPostLinks.ts:207

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_presentations` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/partner/PartnerMarketingPage.tsx:163, src/pages/partner/PartnerMarketingPage.tsx:198

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:partner_pricing_tiers` — 5/10 (arrives, unproven)

- **control** Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner
- **promised** your referral is tracked and you are paid for it
- **goes to** the partner_* tables and the partner-admin-* / partner-*-invite edge functions
- **who is told** nobody
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/usePartnerPricing.ts:72, src/hooks/usePartnerPricing.ts:100, src/hooks/usePartnerPricing.ts:122

Split out from registration deliberately. Nothing here notifies anybody — an invite sent, an agreement signed, a commission row written and a partner deleted are all silent, and `partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it the most consequential untested row in this family.

### `table:payers` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/AddMemberWizard.tsx:107
- **tests naming it** src/test/addMemberWizard.test.tsx, src/test/membershipCondition.test.tsx, src/test/notifyFulfilmentDispatcher.test.ts (candidates, not proofs)

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

### `table:shift_escalation_chain` — 5/10 (arrives, unproven)

- **control** Request holiday, approve/decline, offer and accept shift cover, edit the rota
- **promised** the person who has to act finds out
- **goes to** staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useEscalationChain.ts:68

The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read cannot clear someone else's, and insert errors logged rather than swallowed. No named end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.

### `table:shift_notes` — 5/10 (arrives, unproven)

- **control** Write a handover note; go on/off duty
- **promised** the next shift knows what happened
- **goes to** shift_notes / staff_presence
- **who is told** screen
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/call-centre/ShiftNotesPage.tsx:220, src/pages/call-centre/ShiftNotesPage.tsx:257, src/pages/call-centre/ShiftNotesPage.tsx:284
- **tests naming it** src/test/callCentreCrud.test.ts (candidates, not proofs)

See channel:shift_notes — the note lands, the live update does not.

### `table:staff_activity_log` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useStaffDocuments.ts:87

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `table:staff_documents` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useStaffDocuments.ts:133

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `table:staff_holidays` — 5/10 (arrives, unproven)

- **control** Request holiday, approve/decline, offer and accept shift cover, edit the rota
- **promised** the person who has to act finds out
- **goes to** staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useStaffHolidays.ts:121, src/hooks/useStaffHolidays.ts:180, src/hooks/useStaffHolidays.ts:235

The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read cannot clear someone else's, and insert errors logged rather than swallowed. No named end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.

### `table:staff_invites` — 5/10 (arrives, unproven)

- **control** Invite a colleague, accept an invite, register, manage staff records and documents
- **promised** your account exists and you can get in
- **goes to** staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log
- **who is told** email
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useStaffInvites.ts:109

Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a user set their own role. Delivery of the invite depends on the email secret, so `email`.

### `table:staff_shift_covers` — 5/10 (arrives, unproven)

- **control** Request holiday, approve/decline, offer and accept shift cover, edit the rota
- **promised** the person who has to act finds out
- **goes to** staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useShiftCovers.ts:116, src/hooks/useShiftCovers.ts:174

The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read cannot clear someone else's, and insert errors logged rather than swallowed. No named end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.

### `table:staff_shifts` — 5/10 (arrives, unproven)

- **control** Request holiday, approve/decline, offer and accept shift cover, edit the rota
- **promised** the person who has to act finds out
- **goes to** staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useShiftCovers.ts:191, src/hooks/useStaffShifts.ts:106, src/hooks/useStaffShifts.ts:142, src/hooks/useStaffShifts.ts:164 +1

The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read cannot clear someone else's, and insert errors logged rather than swallowed. No named end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.

### `table:subscriptions` — 5/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/DeviceTab.tsx:172, src/components/admin/member-detail/DeviceTab.tsx:270, src/components/admin/member-detail/DeviceTab.tsx:304
- **tests naming it** src/test/addMemberWizard.test.tsx, src/test/clientWriteSweep.test.ts, src/test/iceImportFunction.test.ts, src/test/notifyFulfilmentDispatcher.test.ts +1 (candidates, not proofs)

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

### `table:tasks` — 5/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/FalseAlarmMonitor.tsx:90, src/components/admin/member-detail/TasksTab.tsx:200, src/components/admin/member-detail/TasksTab.tsx:207, src/components/admin/member-detail/TasksTab.tsx:230 +5
- **tests naming it** src/test/adminPortalNight.test.ts (candidates, not proofs)

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `table:ticket_comments` — 5/10 (arrives, unproven)

- **control** Create/assign a task; raise an internal ticket; comment on one
- **promised** the person it is assigned to picks it up
- **goes to** tasks / internal_tickets / ticket_comments
- **who is told** screen
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/TicketsPage.tsx:331

Tickets and comments ARE published, so they arrive live on an open Tickets screen. `tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on any channel. Listed as a red.

### `table:video_brand_settings` — 5/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useVideoBrandSettings.ts:76, src/hooks/useVideoBrandSettings.ts:85

Renders and exports are both published, and the webhook notifies. Unproven.

### `table:video_outreach_links` — 5/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useVideoExports.ts:116

Renders and exports are both published, and the webhook notifies. Unproven.

### `table:video_projects` — 5/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useVideoProjects.ts:40, src/hooks/useVideoProjects.ts:69, src/hooks/useVideoProjects.ts:86

Renders and exports are both published, and the webhook notifies. Unproven.

### `table:video_renders` — 5/10 (arrives, unproven)

- **control** Video hub — queue a render, watch it complete
- **promised** you will know when the render is ready
- **goes to** video_* tables; video-render-queue; video-render-webhook writes the completion notification
- **who is told** bell
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useVideoRenders.ts:101

Renders and exports are both published, and the webhook notifies. Unproven.

### `table:website_events` — 5/10 (arrives, unproven)

- **control** Page tracking (mounted app-wide in App.tsx)
- **promised** — nothing is promised to the user
- **goes to** website_events
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/analytics/PageTracker.tsx:125, src/components/analytics/PageTracker.tsx:151

Analytics. Present on every route because PageTracker is mounted in App.tsx, not on any page.

### `table:website_images` — 5/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** no
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/settings/ImageUploadCard.tsx:92, src/components/admin/settings/ImageUploadCard.tsx:111, src/components/admin/settings/ImageUploadCard.tsx:149

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `fn:ai-execute-action` — 6/10 (arrives, unproven)

- **control** Isabella executes a tool action
- **promised** the assistant does what she is permitted to do and nothing more
- **goes to** ai-execute-action → ai_actions
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useAIAgents.ts:435
- **tests naming it** src/test/isabellaAlertCapability.test.ts (candidates, not proofs)

Golden rule 6: the hard-blocked tools (update_user_role, manage_alert escalate/resolve, admit_resident, discharge_resident, toggle_user_status) are unreachable in code, and `src/test/isabellaGate.test.ts` proves that by executing the real gate — including that it FAILS OPEN on a settings error and is suppressed when no row exists. That is a real and important property, and it is NOT this wire: it proves what she may not do, not that an action she may do is executed and recorded. Cited here at first and withdrawn on reading it. The block is proven; the wire is not.

### `fn:save-api-keys` — 6/10 (arrives, unproven)

- **control** Settings — save provider keys, send a test email, test Twilio
- **promised** your credentials work
- **goes to** save-api-keys (secrets never reach the client); send-test-email; test-twilio
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/settings/SocialMediaSection.tsx:107, src/pages/admin/SettingsPage.tsx:273

These are the only in-app way to find out whether the email and SMS channels are live, which is exactly what this register cannot determine from code. They are the clicks listed for Lee in §Only Lee can verify.

### `fn:send-test-email` — 6/10 (arrives, unproven)

- **control** Settings — save provider keys, send a test email, test Twilio
- **promised** your credentials work
- **goes to** save-api-keys (secrets never reach the client); send-test-email; test-twilio
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useEmailSettings.ts:109

These are the only in-app way to find out whether the email and SMS channels are live, which is exactly what this register cannot determine from code. They are the clicks listed for Lee in §Only Lee can verify.

### `fn:test-twilio` — 6/10 (arrives, unproven)

- **control** Settings — save provider keys, send a test email, test Twilio
- **promised** your credentials work
- **goes to** save-api-keys (secrets never reach the client); send-test-email; test-twilio
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/admin/SettingsPage.tsx:451

These are the only in-app way to find out whether the email and SMS channels are live, which is exactly what this register cannot determine from code. They are the clicks listed for Lee in §Only Lee can verify.

### `table:admin_ideas` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useAdminIdeas.ts:65, src/hooks/useAdminIdeas.ts:85, src/hooks/useAdminIdeas.ts:111

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:ai_actions` — 6/10 (arrives, unproven)

- **control** Isabella executes a tool action
- **promised** the assistant does what she is permitted to do and nothing more
- **goes to** ai-execute-action → ai_actions
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/dashboard/AISalesDesk.tsx:54, src/hooks/useAIAgents.ts:428, src/hooks/useAIAgents.ts:454

Golden rule 6: the hard-blocked tools (update_user_role, manage_alert escalate/resolve, admit_resident, discharge_resident, toggle_user_status) are unreachable in code, and `src/test/isabellaGate.test.ts` proves that by executing the real gate — including that it FAILS OPEN on a settings error and is suppressed when no row exists. That is a real and important property, and it is NOT this wire: it proves what she may not do, not that an action she may do is executed and recorded. Cited here at first and withdrawn on reading it. The block is proven; the wire is not.

### `table:ai_agent_configs` — 6/10 (arrives, unproven)

- **control** Admin edits Isabella's configuration, prompts and memory; runs her
- **promised** the configuration you saved is the configuration she uses
- **goes to** ai_agents / ai_agent_configs / ai_memory; ai-run
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useAIAgents.ts:323

Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved in this UI reaches the database and is the one she reads. Citing it here would have been the register scoring itself on an adjacent test.

### `table:ai_agents` — 6/10 (arrives, unproven)

- **control** Admin edits Isabella's configuration, prompts and memory; runs her
- **promised** the configuration you saved is the configuration she uses
- **goes to** ai_agents / ai_agent_configs / ai_memory; ai-run
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/ai/AIAvatarUpload.tsx:76, src/components/admin/ai/AIAvatarUpload.tsx:118, src/hooks/useAIAgents.ts:301

Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved in this UI reaches the database and is the one she reads. Citing it here would have been the register scoring itself on an adjacent test.

### `table:ai_memory` — 6/10 (arrives, unproven)

- **control** Admin edits Isabella's configuration, prompts and memory; runs her
- **promised** the configuration you saved is the configuration she uses
- **goes to** ai_agents / ai_agent_configs / ai_memory; ai-run
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useAIAgents.ts:344, src/hooks/useAIAgents.ts:364, src/hooks/useAIAgents.ts:385

Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved in this UI reaches the database and is the one she reads. Citing it here would have been the register scoring itself on an adjacent test.

### `table:blog_posts` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useBlogEditor.ts:98, src/hooks/useBlogEditor.ts:133, src/hooks/useBlogEditor.ts:154, src/hooks/useBlogEditor.ts:172 +1

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:email_settings` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useEmailSettings.ts:82
- **tests naming it** src/test/emailTransport.test.ts (candidates, not proofs)

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:email_templates` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useEmailTemplates.ts:66, src/hooks/useEmailTemplates.ts:94

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:isabella_settings` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useIsabellaSettings.ts:66
- **tests naming it** src/test/isabellaGate.test.ts (candidates, not proofs)

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:member_notification_optin` — 6/10 (arrives, unproven)

- **control** Member edits their emergency contacts, medical information, notification opt-in
- **promised** this is what an operator will see when you press the pendant
- **goes to** emergency_contacts / medical_information / member_notification_optin
- **who is told** self
- **failure shown to user** mutation onError
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMemberNotificationOptin.ts:43
- **tests naming it** src/test/notificationConsent.test.tsx, src/test/notifyFulfilmentDispatcher.test.ts (candidates, not proofs)

Life-safety data with no notification owed — the member is the actor. What it DOES need is proof that an operator can read it and a stranger cannot; the RLS harness covers the isolation half, and the end-to-end half is unproven, so 5.

### `table:operational_costs` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useOperationalCosts.ts:64, src/hooks/useOperationalCosts.ts:88, src/hooks/useOperationalCosts.ts:113, src/hooks/useOperationalCosts.ts:141

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:payments` — 6/10 (arrives, unproven)

- **control** Staff edit a member record, notes, contact methods, payer, subscription, payment
- **promised** the record reflects what was agreed
- **goes to** the named tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/PaymentsTab.tsx:94
- **tests naming it** src/test/adminPortalNight.test.ts, src/test/webhookActivationContract.test.ts (candidates, not proofs)

`subscriptions` deserves its own warning: golden rule 4 reserves activation for the payment webhook, and `useMemberAction` honours that by calling the gateway first and only recording afterwards. Nothing here writes status='active' from the browser.

### `table:pricing_plans` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/PricingPlansEditor.tsx:56

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:pricing_settings` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/PricingPlansEditor.tsx:62

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:products` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useProducts.ts:35, src/hooks/useProducts.ts:75, src/hooks/useProducts.ts:100, src/pages/admin/ProductCatalogPage.tsx:126 +2
- **tests naming it** src/test/publicClaims.test.ts, src/test/spanishFormalAddress.test.ts (candidates, not proofs)

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:system_settings` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/settings/DevicesSettingsTab.tsx:96, src/components/admin/settings/VoiceSettingsSection.tsx:109, src/pages/admin/PartnerPricingSettingsPage.tsx:112
- **tests naming it** src/test/notifyFulfilmentDispatcher.test.ts (candidates, not proofs)

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `table:testimonials` — 6/10 (arrives, unproven)

- **control** Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs
- **promised** the change is saved and takes effect
- **goes to** the named configuration tables
- **who is told** self
- **failure shown to user** toast
- **proof** none — capped at 6
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useTestimonials.ts:76, src/hooks/useTestimonials.ts:90, src/hooks/useTestimonials.ts:104

One promise, one audience: the admin who pressed Save is the only person who needs to know, and a toast tells them. No notification is owed and none is missing. These score on failure visibility and proof alone — which is why a screen full of working buttons still sits at 5: nothing would go red if a save silently stopped working.

### `fn:admin-subscription-action` — 7/10 (proven; no notification owed)

- **control** Staff pause / resume / cancel a subscription
- **promised** billing changes, and the record says who changed it
- **goes to** admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row
- **who is told** self
- **failure shown to user** mutation onError
- **proof** `src/test/staffMemberActions.test.tsx`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMemberAction.ts:109, src/pages/admin/SubscriptionsPage.tsx:124
- **tests naming it** src/test/staffMemberActions.test.tsx (candidates, not proofs)

Gateway FIRST, record second, and the half-applied case is said out loud rather than swallowed. Note the live drift: `member_action` gained 'resume' in a migration that is in main and NOT yet applied to production, so a resume in production performs the Stripe change and then fails to record it. Flagged to Lee separately; not this goal's to fix.

### `fn:cancel-mollie-subscription` — 7/10 (proven; no notification owed)

- **control** Staff pause / resume / cancel a subscription
- **promised** billing changes, and the record says who changed it
- **goes to** admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row
- **who is told** self
- **failure shown to user** mutation onError
- **proof** `src/test/staffMemberActions.test.tsx`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useMemberAction.ts:103
- **tests naming it** src/test/staffMemberActions.test.tsx (candidates, not proofs)

Gateway FIRST, record second, and the half-applied case is said out loud rather than swallowed. Note the live drift: `member_action` gained 'resume' in a migration that is in main and NOT yet applied to production, so a resume in production performs the Stripe change and then fails to record it. Flagged to Lee separately; not this goal's to fix.

### `table:activity_logs` — 7/10 (proven; no notification owed)

- **control** Every staff action that must be attributable
- **promised** who did what, and why
- **goes to** activity_logs, with enforce_member_action_attribution() refusing an unattributed member action
- **who is told** self
- **failure shown to user** no
- **proof** `src/test/staffMemberActions.test.tsx`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/hooks/useGdprDeletion.ts:33, src/hooks/useMemberAction.ts:119, src/lib/auditLog.ts:89, src/pages/admin/AddMemberWizard.tsx:142
- **tests naming it** src/test/addMemberWizard.test.tsx, src/test/memberSelfService.test.ts, src/test/staffMemberActions.test.tsx (candidates, not proofs)

The database refuses a `member_action` row without a reason and an actor, which is why this scores on its trigger rather than on a notification.

### `fn:notify-fulfilment` — 9/10 (notified live, failure not shown)

- **control** Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested
- **promised** the next person in the chain knows the device is theirs to move
- **goes to** notify-fulfilment → member_notification_log, one row per channel decision
- **who is told** bell
- **failure shown to user** no
- **proof** `src/test/notifyFulfilmentDispatcher.test.ts`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/lib/notifyTransition.ts:32
- **tests naming it** src/test/notificationConsent.test.tsx, src/test/pendantFulfilmentTransitions.test.tsx (candidates, not proofs)

A genuine end-to-end proof, and one of very few: it drives the REAL dispatcher module against a recording double and asserts one log row per decision — including the refusals, which are the assertions that matter while every outbound channel is off. A suite that only proved it CAN send would pass against a version that sends to people who never agreed.

### `fn:partner-register` — 9/10 (notified live, failure not shown)

- **control** Partner signs up at /partner/join and verifies their email
- **promised** your partner account exists and someone at ICE knows you joined
- **goes to** partner-register → partners; partner-verify confirms the address
- **who is told** bell
- **failure shown to user** no
- **proof** `e2e/partnerJourney.spec.ts`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/partner/PartnerJoin.tsx:204
- **tests naming it** e2e/helpers/supabaseStub.ts, e2e/partnerJourney.spec.ts, src/test/emailTransport.test.ts, src/test/lovableDebris.test.ts +5 (candidates, not proofs)

The registration leg only. `notify-admin` fires `partner.joined`, so a new partner really does reach the bell, and the Playwright journey is the one browser-level proof in the repo that walks a whole flow. It covers REGISTRATION — which is why the rest of the partner surface below cannot cite it, however tempting it was to apply one proof to nineteen rows.

### `fn:partner-verify` — 9/10 (notified live, failure not shown)

- **control** Partner signs up at /partner/join and verifies their email
- **promised** your partner account exists and someone at ICE knows you joined
- **goes to** partner-register → partners; partner-verify confirms the address
- **who is told** bell
- **failure shown to user** no
- **proof** `e2e/partnerJourney.spec.ts`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/pages/partner/PartnerVerify.tsx:30
- **tests naming it** e2e/helpers/supabaseStub.ts, e2e/partnerJourney.spec.ts (candidates, not proofs)

The registration leg only. `notify-admin` fires `partner.joined`, so a new partner really does reach the bell, and the Playwright journey is the one browser-level proof in the repo that walks a whole flow. It covers REGISTRATION — which is why the rest of the partner surface below cannot cite it, however tempting it was to apply one proof to nineteen rows.

### `table:conversations` — 9/10 (notified live, failure not shown)

- **control** Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen
- **promised** “we'll get back to you” — a member message reaches the team
- **goes to** conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages
- **who is told** bell
- **failure shown to user** no
- **proof** `src/test/inboundMessages.test.ts`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/MessagesTab.tsx:264, src/components/admin/member-detail/MessagesTab.tsx:299, src/components/call-centre/MessagesPanel.tsx:234, src/hooks/useAgentHandoff.ts:35 +12
- **tests naming it** src/test/conversationPreview.test.tsx, src/test/inboundMessages.test.ts, src/test/isabellaThread.test.tsx, src/test/memberSelfService.test.ts (candidates, not proofs)

This is the wire the platform gets RIGHT, and it is the model for fixing the lead: the member surface cannot write the staff notification itself, so it calls a server function that verifies ownership and then broadcasts. Both tables are published and both screens subscribe. Failure is shown.

`inboundMessages` earns this: 31 cases driving the real inbound handler, written negative-first around the defect it replaced — a member texting when no alert was open had their message matched to their record and then DROPPED, while the auto-reply told them an operator would review it. It asserts what must be written into the member's conversation, what must not, and that an unsigned POST cannot put words in a member's mouth.

### `table:messages` — 9/10 (notified live, failure not shown)

- **control** Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen
- **promised** “we'll get back to you” — a member message reaches the team
- **goes to** conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages
- **who is told** bell
- **failure shown to user** no
- **proof** `src/test/inboundMessages.test.ts`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/member-detail/MessagesTab.tsx:211, src/components/call-centre/MessagesPanel.tsx:206, src/components/call-centre/MessagesPanel.tsx:222, src/lib/communicationLogger.ts:121 +11
- **tests naming it** src/test/conversationPreview.test.tsx, src/test/inboundMessages.test.ts, src/test/isabellaThread.test.tsx, src/test/memberSelfService.test.ts +3 (candidates, not proofs)

This is the wire the platform gets RIGHT, and it is the model for fixing the lead: the member surface cannot write the staff notification itself, so it calls a server function that verifies ownership and then broadcasts. Both tables are published and both screens subscribe. Failure is shown.

`inboundMessages` earns this: 31 cases driving the real inbound handler, written negative-first around the defect it replaced — a member texting when no alert was open had their message matched to their record and then DROPPED, while the auto-reply told them an operator would review it. It asserts what must be written into the member's conversation, what must not, and that an unsigned POST cannot put words in a member's mouth.

### `table:partners` — 10/10 (fully wired)

- **control** Partner signs up at /partner/join and verifies their email
- **promised** your partner account exists and someone at ICE knows you joined
- **goes to** partner-register → partners; partner-verify confirms the address
- **who is told** bell
- **failure shown to user** toast
- **proof** `e2e/partnerJourney.spec.ts`
- **routes** /, /*, /admin, /admin/ai, /admin/ai-outreach, /admin/ai/agents/:agentKey +102
- **call sites** src/components/admin/partner/PartnerOrganizationTab.tsx:72, src/components/partner/AgreementRequiredModal.tsx:71, src/pages/admin/PartnerDetailPage.tsx:250, src/pages/admin/PartnerDetailPage.tsx:273 +6
- **tests naming it** e2e/helpers/supabaseStub.ts, e2e/partnerJourney.spec.ts, src/test/auth.test.tsx, src/test/clientWriteSweep.test.ts +2 (candidates, not proofs)

The registration leg only. `notify-admin` fires `partner.joined`, so a new partner really does reach the bell, and the Playwright journey is the one browser-level proof in the repo that walks a whole flow. It covers REGISTRATION — which is why the rest of the partner surface below cannot cite it, however tempting it was to apply one proof to nineteen rows.

---

Generated by `scripts/wiring/build.mjs`. Rubric in `scripts/wiring/score.mjs`.
