/**
 * THE HUMAN HALF OF THE WIRING REGISTER.
 *
 * `inventory.mjs` can see where a wire goes. It cannot see what the user was
 * promised, who is supposed to act on it, or whether an existing test proves the
 * whole path rather than that a button renders. That is what this file carries.
 *
 * WIRES ARE ANNOTATED BY FAMILY, and every wire still gets its own register row
 * with its own routes, failure visibility, tests and score. A family is only
 * legitimate where the members really are the same promise with the same
 * audience — "admin edits a catalogue row" is one promise across nine media
 * tables; "a member sends a message" is not the same promise as "staff edit a
 * product" and is not in that family. Anything whose answer differs from its
 * neighbours is broken out on its own.
 *
 * FIELDS
 *   control  what the user presses / what runs
 *   promise  what the product tells them will happen. Quoted where it is real
 *            copy, because the gap between the copy and the wire is the defect.
 *   dest     where it actually lands
 *   told     who finds out, and on which channel:
 *              bell     — notification_log, in-app; the only channel provable
 *                         live from code (published to supabase_realtime, needs
 *                         no secret)
 *              email/sms/whatsapp — real code path, but gated on a production
 *                         secret this repo cannot see: not "live today" for
 *                         scoring purposes
 *              screen   — appears on a screen a human must already have open
 *              self     — the person who pressed it is the person who needed to
 *                         know, so no notification is owed
 *              nobody   — nothing tells anyone
 *   reaches  false when the wire does not arrive (default true)
 *   dead     true when it cannot fire at all
 *   proof    NAMED end-to-end test (client → destination → visible), or null.
 *            A render test is not a proof and must stay null.
 *   note     anything a reviewer needs, especially why a score is low.
 */

/** @type {Array<{wires: string[]} & Record<string, unknown>>} */
export const FAMILIES = [
  // ───────────────────────────── the anchor defect ─────────────────────────
  {
    wires: ["table:leads"],
    control: "Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens",
    promise: "“Message Sent! … Our team will review your message and respond within 24 hours.”",
    dest: "leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads",
    told: "screen",
    proof: null,
    note:
      "THE DEFECT THIS REGISTER CAME FROM. The row arrives and both Leads screens show it, " +
      "but the only trigger on `leads` is `update_leads_updated_at` — no notification, no task, " +
      "no queue. `leads` IS in supabase_realtime and /call-centre/leads does subscribe, so a lead " +
      "appears live on a screen nobody is required to have open. That is not being told, and the " +
      "copy promises 24 hours. Fixed in PR (a): a SECURITY DEFINER trigger notifies staff on the " +
      "bell, the dashboard grows a New enquiries card, and the copy stops promising a deadline " +
      "nobody committed to.",
  },

  {
    wires: ["channel:leads"],
    control: "Leads list and dashboard leads widget — live arrival of a new enquiry",
    promise: "a new enquiry appears without a reload",
    dest: "postgres_changes on leads (published), refetching the list on /admin, /admin/leads, /call-centre, /call-centre/leads",
    told: "screen",
    proof: null,
    note:
      "This subscription WORKS — leads is published and the refetch fires. It is also the reason " +
      "the original defect was so easy to miss: the wire looks alive, because on a screen someone " +
      "has open the lead really does appear. Nothing brings anyone TO that screen, which is the " +
      "whole difference between a live list and being told. PR (a) adds the notification; this " +
      "row stays `screen` because that is all a subscription can ever be.",
  },

  // ───────────────────────────── dead controls ─────────────────────────────
  {
    wires: ["channel:tasks"],
    control: "Call-centre dashboard — courtesy-call list auto-refresh",
    promise: "the courtesy-call list stays current while the operator works",
    dest: "supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls()",
    told: "nobody",
    dead: true,
    proof: null,
    note:
      "`tasks` is NOT in the supabase_realtime publication (verified against the real schema, " +
      "not grep: 28 tables are published and this is not one). The subscription is established " +
      "and never fires, so a courtesy call assigned to an operator does not appear until they " +
      "reload. Fixed in the held schema bundle.",
  },
  {
    wires: ["channel:shift_notes"],
    control: "Shift notes page — live handover list",
    promise: "code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.”",
    dest: "supabase.channel('call-centre-shift-notes') → fetchNotes()",
    told: "nobody",
    dead: true,
    proof: null,
    note:
      "`shift_notes` is not published to supabase_realtime, so the comment describes behaviour " +
      "that has never happened. A handover note written by the outgoing shift is invisible to the " +
      "incoming one until they reload — on the one screen whose entire purpose is handover. " +
      "Fixed in the held schema bundle.",
  },
  {
    wires: ["channel:registration_drafts", "channel:social_posts", "channel:social_post_metrics"],
    control: "Leads page abandoned-draft list; media manager post list and metrics",
    promise: "the list updates itself",
    dest: "postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics",
    told: "nobody",
    dead: true,
    proof: null,
    note: "Same cause as the two above — table not in the publication. Lower consequence (admin surfaces, reloadable). Fixed in the same bundle.",
  },
  {
    wires: ["fn:send-email"],
    control: "Billing reminder emails (useBillingReminders)",
    promise: "a member behind on payment is reminded before anything is cut off",
    dest: "send-email edge function → Resend",
    told: "email",
    dead: true,
    proof: null,
    note:
      "`src/hooks/useBillingReminders.ts` is imported by NOTHING except a test — no page, no " +
      "layout, no other hook, and there is no server-side twin (no cron, no migration, no edge " +
      "function that sends billing reminders). The hook is unreachable, so no billing reminder " +
      "has ever been sent from this app. Reported, not fixed: whether members should be chased " +
      "automatically is a business decision, and it touches billing.",
  },
  {
    wires: ["table:member_interactions"],
    control: "Communication log — every logSms / logCall / logWhatsApp / logEmail / logPaymentReceived helper",
    promise: "a member's contact history is on their record",
    dest: "member_interactions",
    told: "nobody",
    dead: true,
    proof: null,
    note:
      "`src/lib/communicationLogger.ts` exports ten log functions and is imported by nothing. " +
      "Meanwhile `ActivityTab.tsx` (member detail) and `AlertDetailPanel.tsx` (call centre) both " +
      "READ member_interactions — two screens that can only ever be empty, with no hint that the " +
      "writer was never wired up. Reported, not fixed: choosing which events deserve a log row is " +
      "a product decision, and one of the readers is on the alert path.",
  },

  // ───────────────────────── the SOS / alert path ──────────────────────────
  {
    wires: ["channel:alerts", "channel:alert_escalations", "channel:isabella_assessment_notes"],
    control: "Operator alert queue and SOS takeover screen — live alert arrival",
    promise: "a pendant press reaches an operator screen in under a second",
    dest: "postgres_changes on alerts / alert_escalations / isabella_assessment_notes (all three published)",
    told: "screen",
    proof: null,
    note:
      "The one path golden rule 8 forbids mocking. Published and subscribed, and the operator is " +
      "by definition watching the queue, so `screen` is the right audience here rather than a " +
      "notification. Score is capped below 10 by this register's own rule that a proof must be " +
      "named and end-to-end; see the proof column and §Proofs.",
  },
  {
    wires: ["table:alerts", "fn:sos-alert-resolve", "fn:sos-drill"],
    control: "Operator: acknowledge / resolve an alert; run a drill",
    promise: "the alert leaves the queue and the audit says who closed it",
    dest: "alerts (update) via sos-alert-resolve; sos-drill for rehearsals",
    told: "screen",
    proof: null,
    note:
      "Human gate: any change here is Lee's read (SOS path). Not touched by this goal.\n\n" +
      "`src/test/alertResolution.test.ts` was cited here and then WITHDRAWN on reading it. It is " +
      "a good suite — it drives the real `resolveAlertViaFunction`, pins the invoke contract, and " +
      "scans the source to prove no client writes `status='resolved'` directly any more. But it " +
      "asserts the CALL and the absence of a bypass; the destination side is checked by reading " +
      "the edge function's source, not by executing it, so nothing here proves the alert actually " +
      "left the queue. Under this register's own rule that is not an end-to-end proof, and on the " +
      "SOS path of all places the score should not flatter. 5, not 7.",
  },
  {
    wires: ["fn:sos-conference-join", "fn:sos-conference-leave", "fn:twilio-token", "fn:twilio-call-me", "channel:conference_rooms", "channel:conference_participants"],
    control: "SOS takeover — join the call, invite a contact, leave",
    promise: "the operator is speaking to the member, and to whoever else is needed",
    dest: "sos-conference-* edge functions → Twilio; conference_rooms / conference_participants",
    told: "screen",
    proof: null,
    note:
      "SOS path — untouched here and flagged. No end-to-end proof was found for the conference " +
      "leg, and Twilio credentials are a production secret this repo cannot check, so it cannot " +
      "score above 6 under the rubric. Lee's gate.",
  },

  // ───────────────────────── messaging (the member's voice) ────────────────
  {
    wires: ["table:messages", "table:conversations"],
    control: "Member sends a message from /dashboard/messages or /dashboard/support; staff reply from either Messages screen",
    promise: "“we'll get back to you” — a member message reaches the team",
    dest: "conversations + messages; member-side notification and mark-read go through the member-self-service edge function because members deliberately hold no INSERT on notification_log and no UPDATE on messages",
    told: "bell",
    proof: "src/test/inboundMessages.test.ts",
    note:
      "This is the wire the platform gets RIGHT, and it is the model for fixing the lead: the " +
      "member surface cannot write the staff notification itself, so it calls a server function " +
      "that verifies ownership and then broadcasts. Both tables are published and both screens " +
      "subscribe. Failure is shown.\n\n" +
      "`inboundMessages` earns this: 31 cases driving the real inbound handler, written " +
      "negative-first around the defect it replaced — a member texting when no alert was open had " +
      "their message matched to their record and then DROPPED, while the auto-reply told them an " +
      "operator would review it. It asserts what must be written into the member's conversation, " +
      "what must not, and that an unsigned POST cannot put words in a member's mouth.",
  },
  {
    wires: ["channel:messages", "channel:conversations", "fn:member-self-service"],
    control: "Live arrival of a message on either Messages screen; the member-side notify and mark-read calls",
    promise: "a new message appears, and the team is told",
    dest: "postgres_changes on messages / conversations (both published); member-self-service for notify_staff and mark_read",
    told: "bell",
    proof: null,
    note:
      "Split from the tables above, which cite `inboundMessages`. That suite proves an INBOUND " +
      "SMS becomes a message row; it does not exercise these subscriptions, and it does not cover " +
      "member-self-service's `notify_staff` leg — the one that actually rings the bell. Claiming " +
      "it for all five wires was the register scoring a neighbour's test, which is the habit it " +
      "exists to break.",
  },
  {
    wires: ["table:conversation_messages"],
    control: "Isabella conversation turns",
    promise: "the assistant's reply appears as it is produced",
    dest: "conversation_messages",
    told: "self",
    proof: null,
    note: "The person who typed is the person watching. No notification owed.",
  },

  // ───────────────────────── join → pay ────────────────────────────────────
  {
    wires: ["fn:create-checkout", "fn:create-mollie-checkout", "fn:submit-registration", "fn:save-registration-draft", "fn:complete-member-registration"],
    control: "/join — submit registration, pay by card (Stripe) or SEPA (Mollie)",
    promise: "you are signed up and covered once you have paid",
    dest: "submit-registration → create-checkout / create-mollie-checkout → gateway; activation is by webhook only (golden rule 4)",
    told: "bell",
    proof: null,
    note:
      "OUT OF SCOPE HERE BY INSTRUCTION — the join→pay path is covered by the separate goal " +
      "already running, and duplicating it would put two changes on the same files. Recorded so " +
      "the register is complete, deliberately not re-proven or altered. notify-admin fires " +
      "`sale.paid` from the webhook side, which is why `told` is bell.",
  },

  // ───────────────────────── things that do notify ─────────────────────────
  {
    wires: ["table:notification_log", "channel:notification_log"],
    control: "The bell itself — badge, dropdown, mark read, mark all read",
    promise: "you will be told when something needs you",
    dest: "notification_log; published to supabase_realtime, RLS scopes rows to the targeted user, staff broadcasts, admin oversight",
    told: "self",
    proof: null,
    note:
      "The one notification channel this repo can prove is live: published, no secret required, " +
      "and RLS verified so a member sees only rows addressed to them. Everything scored `bell` " +
      "depends on this row being right.",
  },
  {
    wires: ["table:staff_holidays", "table:staff_shift_covers", "table:staff_shifts", "table:shift_escalation_chain"],
    control: "Request holiday, approve/decline, offer and accept shift cover, edit the rota",
    promise: "the person who has to act finds out",
    dest: "staff_holidays / staff_shift_covers / staff_shifts (+ escalation chain), each followed by a targeted notification through src/lib/staffNotify.ts",
    told: "bell",
    proof: null,
    note:
      "The existing good pattern: one write path (`notifyUsers`), targeted rows so mark-as-read " +
      "cannot clear someone else's, and insert errors logged rather than swallowed. No named " +
      "end-to-end proof yet, so capped at 6 despite being the best-wired workflow here.",
  },
  {
    wires: ["fn:notify-admin"],
    control: "Server-side admin alerts: sale.paid, partner.joined, EV-07B alert, shift no-show, runner failure, escalation failures",
    promise: "an operational failure is not silent",
    dest: "notify-admin edge function → notification_log (+ WhatsApp where configured)",
    told: "bell",
    proof: null,
    note: "Reaches the bell, which is live. Untested end-to-end from the caller side.",
  },
  {
    wires: ["fn:notify-fulfilment"],
    control: "Order state transition fan-out — paid → allocated → programmed → dispatched → delivered → tested",
    promise: "the next person in the chain knows the device is theirs to move",
    dest: "notify-fulfilment → member_notification_log, one row per channel decision",
    told: "bell",
    proof: "src/test/notifyFulfilmentDispatcher.test.ts",
    note:
      "A genuine end-to-end proof, and one of very few: it drives the REAL dispatcher module " +
      "against a recording double and asserts one log row per decision — including the refusals, " +
      "which are the assertions that matter while every outbound channel is off. A suite that " +
      "only proved it CAN send would pass against a version that sends to people who never " +
      "agreed.",
  },
  {
    wires: ["table:orders", "table:order_items"],
    control: "Staff move an order through fulfilment; add or remove an order line",
    promise: "the order says where the device actually is",
    dest: "orders / order_items",
    told: "bell",
    proof: null,
    note:
      "Split from `fn:notify-fulfilment`, which was carrying these two rows on its proof. That " +
      "suite proves the FAN-OUT decides correctly; it does not prove a staff edit to an order " +
      "reaches the table and shows on the screen. Different wire, so no proof.",
  },
  {
    wires: ["table:ai_events"],
    control: "Isabella actions and observations",
    promise: "what the assistant did is on the record",
    dest: "ai_events (published to supabase_realtime)",
    told: "bell",
    proof: null,
    note: "Some ai_events call sites sit beside notifyUsers; the log row itself is for humans to audit later.",
  },

  // ───────────────────────── member self-service ──────────────────────────
  {
    wires: ["table:emergency_contacts", "table:medical_information", "table:member_notification_optin"],
    control: "Member edits their emergency contacts, medical information, notification opt-in",
    promise: "this is what an operator will see when you press the pendant",
    dest: "emergency_contacts / medical_information / member_notification_optin",
    told: "self",
    proof: null,
    note:
      "Life-safety data with no notification owed — the member is the actor. What it DOES need is " +
      "proof that an operator can read it and a stranger cannot; the RLS harness covers the " +
      "isolation half, and the end-to-end half is unproven, so 5.",
  },
  {
    wires: ["table:members", "channel:members", "table:member_notes", "table:member_contact_methods", "table:payers", "table:subscriptions", "table:payments"],
    control: "Staff edit a member record, notes, contact methods, payer, subscription, payment",
    promise: "the record reflects what was agreed",
    dest: "the named tables",
    told: "self",
    proof: null,
    note:
      "`subscriptions` deserves its own warning: golden rule 4 reserves activation for the " +
      "payment webhook, and `useMemberAction` honours that by calling the gateway first and only " +
      "recording afterwards. Nothing here writes status='active' from the browser.",
  },
  {
    wires: ["fn:submit-member-update", "fn:validate-member-update-token", "fn:send-member-update-request"],
    control: "Member-update link — staff request a details check, member submits it without logging in",
    promise: "confirm your details from the link we sent you",
    dest: "send-member-update-request → token → validate-member-update-token → submit-member-update",
    told: "nobody",
    proof: null,
    note:
      "A member confirms or corrects their details and no one is told the answer came back. " +
      "Not fixed in this goal (below the reds being fixed, and it needs a decision about who owns " +
      "the follow-up) — listed as a red in the report.",
  },

  // ───────────────────────── staff & partner onboarding ───────────────────
  {
    wires: ["fn:staff-send-invite", "fn:staff-validate-invite", "fn:staff-complete-invite", "fn:staff-register", "table:staff_invites", "table:staff", "table:staff_documents", "table:staff_activity_log"],
    control: "Invite a colleague, accept an invite, register, manage staff records and documents",
    promise: "your account exists and you can get in",
    dest: "staff-* edge functions; staff / staff_invites / staff_documents / staff_activity_log",
    told: "email",
    proof: null,
    note:
      "Roles are assigned by trigger/admin only (golden rule 3) — nothing in this family lets a " +
      "user set their own role. Delivery of the invite depends on the email secret, so `email`.",
  },
  {
    wires: ["fn:partner-register", "fn:partner-verify", "table:partners"],
    control: "Partner signs up at /partner/join and verifies their email",
    promise: "your partner account exists and someone at ICE knows you joined",
    dest: "partner-register → partners; partner-verify confirms the address",
    told: "bell",
    proof: "e2e/partnerJourney.spec.ts",
    note:
      "The registration leg only. `notify-admin` fires `partner.joined`, so a new partner really " +
      "does reach the bell, and the Playwright journey is the one browser-level proof in the repo " +
      "that walks a whole flow. It covers REGISTRATION — which is why the rest of the partner " +
      "surface below cannot cite it, however tempting it was to apply one proof to nineteen rows.",
  },
  {
    wires: ["fn:partner-send-invite", "fn:partner-validate-invite", "fn:partner-complete-invite", "fn:partner-admin-create", "fn:partner-admin-invite", "fn:partner-admin-delete", "fn:track-invite-view", "table:partner_invites", "table:partner_members", "table:partner_agreements", "table:partner_commissions", "table:partner_pricing_tiers", "table:partner_post_links", "table:partner_presentations", "table:partner_alert_subscriptions", "table:partner_alert_notifications"],
    control: "Partner invites a member, signs the agreement, sets pricing tiers, subscribes to a member's alerts, publishes marketing links; admin creates/deletes a partner",
    promise: "your referral is tracked and you are paid for it",
    dest: "the partner_* tables and the partner-admin-* / partner-*-invite edge functions",
    told: "nobody",
    proof: null,
    note:
      "Split out from registration deliberately. Nothing here notifies anybody — an invite sent, " +
      "an agreement signed, a commission row written and a partner deleted are all silent, and " +
      "`partner_alert_subscriptions` decides who gets told about a MEMBER'S alert, which makes it " +
      "the most consequential untested row in this family.",
  },
  {
    wires: ["fn:process-commissions"],
    control: "Run the commission calculation",
    promise: "partners are paid what they earned",
    dest: "process-commissions → partner_commissions",
    told: "nobody",
    proof: null,
    note: "Money. Nobody is told it ran, or that it failed, and there is no test. A red in the report.",
  },

  // ───────────────────────── ops surfaces ─────────────────────────────────
  {
    wires: ["table:tasks", "channel:internal_tickets", "table:internal_tickets", "table:ticket_comments", "channel:ticket_comments"],
    control: "Create/assign a task; raise an internal ticket; comment on one",
    promise: "the person it is assigned to picks it up",
    dest: "tasks / internal_tickets / ticket_comments",
    told: "screen",
    proof: null,
    note:
      "Tickets and comments ARE published, so they arrive live on an open Tickets screen. " +
      "`tasks` is not (see channel:tasks above) — assigning a task tells its owner nothing, on " +
      "any channel. Listed as a red.",
  },
  {
    wires: ["table:shift_notes", "table:staff_presence"],
    control: "Write a handover note; go on/off duty",
    promise: "the next shift knows what happened",
    dest: "shift_notes / staff_presence",
    told: "screen",
    proof: null,
    note: "See channel:shift_notes — the note lands, the live update does not.",
  },
  {
    wires: ["table:devices", "channel:devices", "table:documentation"],
    control: "Assign, program, test and retire a device; publish documentation",
    promise: "the device on the member's wrist is the device on the record",
    dest: "devices / documentation, both published",
    told: "screen",
    proof: null,
    note: "Device state feeds the operator card, so this is adjacent to the SOS path without being on it.",
  },
  {
    wires: ["table:activity_logs"],
    control: "Every staff action that must be attributable",
    promise: "who did what, and why",
    dest: "activity_logs, with enforce_member_action_attribution() refusing an unattributed member action",
    told: "self",
    proof: "src/test/staffMemberActions.test.tsx",
    note:
      "The database refuses a `member_action` row without a reason and an actor, which is why " +
      "this scores on its trigger rather than on a notification.",
  },
  {
    wires: ["fn:admin-subscription-action", "fn:cancel-mollie-subscription"],
    control: "Staff pause / resume / cancel a subscription",
    promise: "billing changes, and the record says who changed it",
    dest: "admin-subscription-action (Stripe) or cancel-mollie-subscription (Mollie), then an activity_logs row",
    told: "self",
    proof: "src/test/staffMemberActions.test.tsx",
    note:
      "Gateway FIRST, record second, and the half-applied case is said out loud rather than " +
      "swallowed. Note the live drift: `member_action` gained 'resume' in a migration that is in " +
      "main and NOT yet applied to production, so a resume in production performs the Stripe " +
      "change and then fails to record it. Flagged to Lee separately; not this goal's to fix.",
  },

  // ───────────────────────── admin content & config ───────────────────────
  {
    wires: ["table:products", "table:pricing_plans", "table:pricing_settings", "table:system_settings", "table:email_settings", "table:email_templates", "table:notification_settings", "table:isabella_settings", "table:website_images", "table:testimonials", "table:blog_posts", "table:operational_costs", "table:app_finance", "table:app_events", "table:app_daily_metrics", "table:admin_ideas"],
    control: "Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, costs",
    promise: "the change is saved and takes effect",
    dest: "the named configuration tables",
    told: "self",
    proof: null,
    note:
      "One promise, one audience: the admin who pressed Save is the only person who needs to " +
      "know, and a toast tells them. No notification is owed and none is missing. These score on " +
      "failure visibility and proof alone — which is why a screen full of working buttons still " +
      "sits at 5: nothing would go red if a save silently stopped working.",
  },
  {
    wires: ["table:media_topics", "table:media_topic_goals", "table:media_goals", "table:media_audiences", "table:media_image_styles", "table:media_content_calendar", "table:media_schedule_settings", "table:social_posts", "fn:publish-scheduled", "fn:generate-content-plan", "fn:facebook-metrics", "fn:facebook-unpublish", "fn:youtube-publish", "fn:youtube-oauth-start", "fn:youtube-disconnect", "fn:youtube-integration-status"],
    control: "Media manager — plan, schedule, publish and measure social content",
    promise: "the post goes out when you said",
    dest: "media_* tables, social_posts, and the publish/metrics edge functions against Facebook and YouTube",
    told: "bell",
    proof: null,
    note:
      "publish-scheduled writes a notification_log row on failure, so a post that does not go out " +
      "does reach the bell. The two dead realtime subscriptions in this surface are broken out above.",
  },
  {
    wires: ["table:video_projects", "table:video_renders", "table:video_brand_settings", "table:video_outreach_links", "fn:video-render-queue", "channel:video_renders", "channel:video_exports"],
    control: "Video hub — queue a render, watch it complete",
    promise: "you will know when the render is ready",
    dest: "video_* tables; video-render-queue; video-render-webhook writes the completion notification",
    told: "bell",
    proof: null,
    note: "Renders and exports are both published, and the webhook notifies. Unproven.",
  },
  {
    wires: ["table:outreach_campaigns", "table:outreach_raw_leads", "table:outreach_crm_leads", "table:outreach_email_drafts", "table:outreach_queued_tasks", "table:outreach_daily_usage", "table:outreach_settings", "table:outreach_suppression", "channel:outreach_raw_leads", "channel:outreach_crm_leads", "fn:outreach-send-email"],
    control: "AI outreach — build a list, draft, send, suppress, track daily usage",
    promise: "the campaign runs inside its limits",
    dest: "outreach_* tables and outreach-send-email",
    told: "bell",
    proof: null,
    note: "outreach-send-email writes notification_log. Suppression and daily-usage caps are the guard rails and neither is tested.",
  },
  {
    wires: ["fn:ai-execute-action", "table:ai_actions"],
    control: "Isabella executes a tool action",
    promise: "the assistant does what she is permitted to do and nothing more",
    dest: "ai-execute-action → ai_actions",
    told: "self",
    proof: null,
    note:
      "Golden rule 6: the hard-blocked tools (update_user_role, manage_alert escalate/resolve, " +
      "admit_resident, discharge_resident, toggle_user_status) are unreachable in code, and " +
      "`src/test/isabellaGate.test.ts` proves that by executing the real gate — including that it " +
      "FAILS OPEN on a settings error and is suppressed when no row exists. That is a real and " +
      "important property, and it is NOT this wire: it proves what she may not do, not that an " +
      "action she may do is executed and recorded. Cited here at first and withdrawn on reading " +
      "it. The block is proven; the wire is not.",
  },
  {
    wires: ["table:ai_agents", "table:ai_agent_configs", "table:ai_memory", "fn:ai-run"],
    control: "Admin edits Isabella's configuration, prompts and memory; runs her",
    promise: "the configuration you saved is the configuration she uses",
    dest: "ai_agents / ai_agent_configs / ai_memory; ai-run",
    told: "self",
    proof: null,
    note:
      "Split from the gate above: `isabellaGate` proves the hard blocks, not that a prompt saved " +
      "in this UI reaches the database and is the one she reads. Citing it here would have been " +
      "the register scoring itself on an adjacent test.",
  },
  {
    wires: ["table:crm_contacts", "table:crm_profiles", "table:crm_events", "table:crm_import_batches", "table:crm_import_rows"],
    control: "CRM import and contact editing",
    promise: "the legacy record is imported as it stands",
    dest: "crm_* tables via the import path",
    told: "self",
    proof: null,
    note:
      "Migrated subscriptions are written `pending` on purpose — golden rule 4 — and nothing here " +
      "activates anyone. The single-member import UI is a separate brief item (§3c), not this goal.",
  },
  {
    wires: ["fn:save-api-keys", "fn:send-test-email", "fn:test-twilio"],
    control: "Settings — save provider keys, send a test email, test Twilio",
    promise: "your credentials work",
    dest: "save-api-keys (secrets never reach the client); send-test-email; test-twilio",
    told: "self",
    proof: null,
    note:
      "These are the only in-app way to find out whether the email and SMS channels are live, " +
      "which is exactly what this register cannot determine from code. They are the clicks listed " +
      "for Lee in §Only Lee can verify.",
  },
  {
    wires: ["rpc:get_admin_dashboard_stats", "rpc:get_sales_command_stats", "rpc:get_todays_birthdays", "rpc:get_user_role_info"],
    control: "Dashboard statistics and role resolution",
    promise: "the numbers on the dashboard are the numbers in the database",
    dest: "SQL functions, read-only",
    told: "self",
    proof: null,
    note:
      "Read-only, so nothing to notify. `get_user_role_info` is on the critical path for every " +
      "protected route: if it fails, the guard sees no role.",
  },
  {
    wires: ["table:website_events"],
    control: "Page tracking (mounted app-wide in App.tsx)",
    promise: "— nothing is promised to the user",
    dest: "website_events",
    told: "self",
    proof: null,
    note: "Analytics. Present on every route because PageTracker is mounted in App.tsx, not on any page.",
  },

  // ───────────────────────── hand-offs off the platform ───────────────────
  {
    wires: ["link:tel"],
    control: "Every “call” affordance — 38 call sites across public pages, member dashboard, admin and the call centre",
    promise: "pressing this rings the number shown",
    dest: "the device dialler, via a tel: href built from company settings or a member's stored number",
    told: "external",
    proof: null,
    note:
      "Reaches the dialler, and `telHref()` returns null when the number is unset so a “Call us” " +
      "card with no number in it is not rendered — the right failure. Nothing is recorded: a call " +
      "placed this way leaves no interaction row (see table:member_interactions, whose logger is " +
      "dead code), so the platform cannot say a member was ever phoned. On the SOS path the brief " +
      "already calls for replacing tel: with the Twilio conference; that is Lee's gate, not this goal.",
  },
  {
    wires: ["link:wa.me", "fn:twilio-whatsapp"],
    control: "WhatsApp hand-off and outbound WhatsApp",
    promise: "message them on WhatsApp",
    dest: "wa.me deep link; twilio-whatsapp for outbound",
    told: "whatsapp",
    proof: null,
    note: "Deep link always works; the outbound function returns “Twilio not configured” when the secret is absent, which is a production question.",
  },
  {
    wires: ["link:mailto", "fn:twilio-sms"],
    control: "Email hand-off; outbound SMS",
    promise: "email or text this person",
    dest: "the user's mail client; twilio-sms for outbound",
    told: "external",
    proof: null,
    note: "mailto: leaves the platform entirely — nothing is recorded and nothing can be. twilio-sms degrades to “Twilio not configured”.",
  },
];
