# CC master brief — 5 September 2026 (authoritative scope for the autonomous run)

Pasted to Claude Code as one `/goal` on 5 September 2026. Committed verbatim so no run has to
reconstruct scope. Resumed 7 September with the schema-first method (one held migration bundle,
PR #180) and Lee's FULFILMENT_MODEL.md §9 rulings: Q1 operator-confirmed only; Q2 a replaced
pendant drops readiness until re-tested; Q3 refuse the backward move; Q4 parked.

---

/goal Read CLAUDE.md, GOALS.md, STATE.md, BRAND_IDENTITY.md, READINESS_MODEL.md,
ICE_OPERATOR_CARD_SPEC.md, PAYER_MODEL.md, ONBOARDING_SPLIT.md and MEMBER_ONBOARDING.md FIRST.
Confirm you are on current main and say which SHA. Run `supabase migration list` is NOT
available to you — production state is APPLIED_TO_PROD.txt, treat it as truth.

MERGE AUTHORITY. Lee is away and has authorised you to merge your own PRs once gates are green
and the RLS harness passes, WITH ONE EXCEPTION: any PR touching supabase/functions/stripe-webhook
or supabase/functions/create-checkout stays OPEN for Lee. A broken webhook means no member ever
activates and it fails silently. Everything else: merge, in dependency order, one concern per PR,
each cut from a green main, never stacked. Keep APPLIED_TO_PROD.txt honest: you cannot apply
migrations, so every migration you merge is NOT in production until Lee pushes — append nothing
to the manifest yourself; instead maintain a PENDING_FOR_LEE.md at repo root listing every
migration merged this run in order, plus every secret, setting or external approval Lee must
do. That file is your handover.

CANNOT-DO LIST (do not attempt, do not stub): apply migrations; set Supabase or Vercel secrets;
approve the Twilio WhatsApp sender; verify icealarm.es with Resend or publish DNS; rotate API
keys; take a live payment. Record each in PENDING_FOR_LEE.md with the exact step.

DECISIONS TAKEN TODAY — implement, do not re-open:
  D1  Payment provider is Stripe. (Mollie code stays; not active.)
  D2  Payer is a distinct person from the member (PAYER_MODEL.md option B, shipped in #163).
  D3  Join wizard is 7 steps; contacts and medical are collected after payment (#161).
  D4  Monitoring-ready CHANGES: a member is ready when they have >=1 emergency contact AND
      their pendant has been tested in their home with an operator answering. Two conditions.
  D5  "New member" staff notification fires on PAYMENT (the Stripe webhook), never on order
      creation or staff action.
  D6  Fulfilment notifications go to the MEMBER and the PAYER (when different). Not to
      emergency contacts — yet.
  D7  Channels: SMS, email, WhatsApp. Each channel is switched on independently, only once it
      is proven to deliver. SMS is proven today. Email and WhatsApp are NOT — build them behind
      a per-channel flag in system_settings, default OFF.
  D8  A WhatsApp opt-in is part of joining: after payment the member is invited to message us
      on WhatsApp so the thread exists before it is needed.
  D9  Only call_centre_supervisor, admin and super_admin may move a fulfilment state backwards.
  D10 The readiness notice lives in the member header, left of Assistant / bell / language /
      name — never a standalone banner. Company announcements go in the bell, never page content.
  D11 Member pages: 16px body minimum, an A/A text-size control in the header. Operator screens
      keep 14px.
  D12 Sidebar changes are approved: active item is a dark fill not red; the red "Contact" button
      becomes an Ink block showing the 24-hour number; "My Device" -> "My pendant",
      "Subscription" -> "Membership", "Contact Support" -> "Help & support".

VERIFIED FACTS (re-check, don't re-derive):
  - +34 900 123 456 shown on My Device is a hardcoded fallback (useCompanySettings.ts:13,
    App.tsx:215) because system_settings.emergency_phone is unset. Real number: 950 473 199.
  - medical_information has 17 columns after 20260903091500; MedicalInfoPage shows 8. The
    nine missing: mobility, hearing_notes, vision_notes, meds_location, meds_notes,
    doctor_location, private_insurer, private_policy_number, plus member_access (key safe).
  - order_status enum is pending|processing|shipped|delivered|cancelled. No allocated,
    programmed or tested state exists.
  - emergency_contacts.contact_type is emergency|key_holder only. Nothing models carers,
    agencies, nurses, social workers, legal representatives, or "can attend in person".
  - conversation_messages.channel is chat|voice only. conversations and conversation_messages
    have no join. No read_at, no internal-note visibility, no canned replies.
  - Five FK columns have no delete rule and block every staff/admin deletion:
    notification_log.admin_user_id, social_posts.approved_by, social_posts.created_by,
    crm_import_batches.created_by, member_update_tokens.created_by (-> staff).
  - All nine member pages are wired through hooks. The work is presentation and completeness.
  - MemberChatButton renders Isabella's photo beside the bell; it reads as the member's own.

THE DESIGN. A canvas exists that you cannot see. The rules below ARE the design — build to them
and the result will match. Commit them as MEMBER_UX_RULES.md in the repo root, verbatim, first.

  R1  One red (#C8102E) button per page, maximum. Everything else Ink #14181F or outline.
  R2  Brand red never on an alert, warning or status. Those use the alert/status families or Ink.
  R3  Header (64px, white): LEFT = readiness notice, amber-on-cream (#FEF8E6 / #F4E3A8 border,
      #7A5C00 icon), one sentence + "Add them ->", undismissible, renders only on a SETTLED
      zero-contacts (never while loading — §5.1.2). RIGHT = Assistant outline pill, bell, A/A
      text size, EN/ES, initials avatar + name + role.
  R4  Page ground #F3F4F6. Cards white, 1px #E2E5EA border, 12px radius, 24px padding, shadow
      0 1px 2px rgba(20,24,31,.05), 0 4px 12px rgba(20,24,31,.04).
  R5  One page shell: 28px Archivo 700 title + 16px Slate #5A6470 subtitle. Every page is
      composed from PageHeader, Card, EmptyState — delete every hand-rolled header.
  R6  Read-only by default. Edit per section, then Save. Fields as label (13px uppercase Slate)
      / value (16px Ink). Empty = "Not added" + inline Add. Never "contact support to change".
  R7  Members upload their own photo (Supabase storage, size-limited, RLS: own bucket path).
      DOB and NIE stay locked with a reason: "Call us to change this — we need to verify who
      you are."
  R8  Empty states offer the action. "No active subscription" shows the plans.
  R9  Spanish uses usted throughout. Fix the existing tú strings in es.json while you are there.
  R10 16px body, 13px labels minimum, A/A control persists per user (localStorage is fine).

WORK PACKAGES, in this order. If you run out of turns, the earlier ones matter more.

WP1 — Small fixes with big consequences (one PR each)
  a. Migration: the five FK columns -> ON DELETE SET NULL. Reversible.
  b. Migration: seed system_settings.emergency_phone = '950 473 199' if absent. Remove the
     hardcoded fallback in useCompanySettings.ts and App.tsx — if the setting is missing, show
     nothing and log, never a fake number.
  c. MEMBER_UX_RULES.md committed. Fix es.json tú -> usted.

WP2 — Fulfilment state machine (design first: FULFILMENT_MODEL.md, then implement)
  New order states: paid -> allocated -> programmed -> dispatched -> delivered -> tested,
  plus cancelled. Migrate existing rows: pending->paid where a subscription exists,
  processing->allocated, shipped->dispatched, delivered stays.
  - allocated: a device is assigned (device leaves in_stock).
  - programmed: the ProvisioningChecklist's six steps are all complete — completing the
    checklist IS the transition, not a separate button.
  - dispatched: staff action "Collected for delivery".
  - delivered: staff action, or courier webhook later.
  - tested: staff action "Test call completed" from the SOS screen or member record, records
    who and when. THIS sets the second half of monitoring readiness.
  Backward moves: D9 roles only, require a reason, write activity_logs.
  Update member_monitoring_readiness: ready = contacts >= 1 AND pendant_tested_at is not null.
  Update the readiness queue: two row kinds, "No contacts" and "Pendant not tested", both
  worked by phone. Update the operator card zero-state and the member header notice to name
  which condition is missing. Harness: a member cannot set any order state; a call_centre
  operator cannot move a state backwards; supervisor can, with reason; tested requires a staff id.

WP3 — Notification fan-out (design first in FULFILMENT_MODEL.md §notifications)
  One dispatcher: notify_fulfilment(order_id, transition) called on every state edge.
  Recipients per D6: member, and payer when payer_id is set and differs.
  Templates per transition x recipient x language (en/es/nl), as data not code, in a
  notification_templates table with a seed migration. Member and payer get DIFFERENT text
  for the same event — the payer is told about the order, the member about their alarm.
  Channels per D7: SMS via twilio-sms (on), email via send-email (flag OFF), WhatsApp via
  twilio-whatsapp (flag OFF). A channel that is off is skipped and logged, never silently
  failed. Every send writes notification_log with channel, recipient, template, outcome.
  The "new member" staff notification (D5): fired from the Stripe webhook's post-payment path
  into the staff notification bell. This touches stripe-webhook -> that PR stays open for Lee.
  Do the dispatcher and templates in separate PRs from the webhook hook so everything else
  merges.
  WhatsApp opt-in (D8): after payment, the confirmation screen and the member email carry a
  wa.me link to the ICE number with a prefilled "Hola, soy [name], acabo de unirme". Do not
  build sending until the sender is approved; build the receiving side and the opt-in link.

WP4 — Member dashboard pass (rules R1–R10 on every page)
  PageHeader / Card / EmptyState components first; convert all nine pages.
  Header per R3 (readiness notice moves here; delete the banner; delete the announcement
  from Home). MemberChatButton -> "Assistant" outline pill.
  Home: greeting + date; "Your protection" checklist (Membership / Pendant / Emergency
  contacts, each with state and one action); Recent activity (empty = "No alerts"); Messages
  (last thread). No stat tiles for a member with no device.
  Medical information: all 17 fields in sections — Conditions & medication (incl. where kept),
  Allergies, Mobility/hearing/sight, Your doctor (incl. medical centre, blood group),
  Private insurance, Getting into your home (key safe code masked with Show; RLS: member
  reads own), Anything else. Subtitle: "This is exactly what an operator sees the moment you
  press your pendant."
  My profile: R6 + R7. My pendant: remove "What You're Missing"; show what they have, live
  status, and one "Add a pendant" action; state from WP2. Membership: plan, price, next
  payment, who pays (payer model), pendants, invoices, actions "Add a pendant" and
  "Change to couple" through Stripe checkout only. Emergency contacts and Alert history:
  R5/R6/R8 applied.

WP5 — Circle of care (design first: CIRCLE_OF_CARE.md)
  Widen emergency_contacts.contact_type: emergency | key_holder | carer | care_agency |
  nurse | social_worker | neighbour | legal_representative. Add can_attend_in_person boolean,
  country text, availability_notes text. Add members.away_from date, away_until date,
  pendant_with_member boolean. Structured Spanish address on members: urbanizacion, bloque,
  portal, escalera, gate_code (member_access). Operator card Band 3/5 and the member
  Emergency contacts page show them. A member_care table (agency, visit_schedule, day_centre,
  medical_equipment, advance_directive_location, tsi_number) — special-category, RLS + harness
  like member_access. Harness: carer cannot read member medical unless a care_access_grant
  exists; away status is member-writable, everything else in member_care is not.

WP6 — Messaging as a real service
  read_at on messages; unread count on the nav. Internal notes: sender_type 'staff_internal',
  RLS proves members never SELECT them — mutation-test it. canned_replies table per language.
  channel on messages widened to chat|voice|whatsapp|sms|email; inbound twilio-whatsapp and
  twilio-sms write into the member's conversation. Join conversation_messages (Isabella) to
  conversations so her calls appear as a card in the thread. Operator view: queue with
  Open/Waiting/Resolved, priority, assignee; member context panel showing readiness state.

WP7 — Staff control of the member record
  From the member record: renew annual, change single<->couple, add a pendant, pause, cancel.
  EVERY one creates a Stripe action and the webhook changes state — staff never write
  status='active' or a subscription row directly (golden rule 4, and the guard trigger from
  #166 will refuse). Each action attributed in activity_logs. Pause/cancel need a reason.

For every WP: gates green (tsc app+node, lint no new warnings, tests), RLS harness green with
new assertions mutation-tested, STATE.md updated honestly, PENDING_FOR_LEE.md updated. Merge
when green, except the webhook PR. Stop when all seven are merged or blocked with reasons.
No cap.
