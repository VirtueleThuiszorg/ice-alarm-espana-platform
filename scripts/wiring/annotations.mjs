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


/**
 * ADMIN-AUDIENCE EVENTS THAT WRITE NOWHERE (Lee's dashboard notes, 9 Sep, item 3).
 *
 * The register above answers "who is told?" for every wire that EXISTS. It cannot answer it for
 * something that never happens — and that is the more dangerous half, because a notification
 * nobody wrote looks exactly like a notification nobody needed. The bell is fine as a reader;
 * what is missing is on the other side of it.
 *
 * These rows are therefore claims about ABSENCE, and each one carries its own check so the claim
 * cannot rot: `build.mjs` verifies the absence and FAILS if the thing has since been wired,
 * naming the file. A fixed item cannot sit here looking broken, and a broken item cannot be
 * quietly dropped — removing a row means the wire now exists and needs a real register row.
 *
 * THE FIXES ARE NOT MINE. Item 3 says the wiring session owns them and says not to duplicate
 * its work; this is the inventory it needs, with the evidence attached.
 *
 * CHECK SHAPES
 *   absentEverywhere  a string/pattern that appears NOWHERE in the scanned trees. Used for
 *                     "nothing invokes this function".
 *   absentPair        two patterns that never appear within `window` characters of each other
 *                     in the SAME file. Used for "this event happens here and nothing near it
 *                     tells anybody".
 */
/** @type {Array<Record<string, unknown>>} */
export const ABSENT_ADMIN_EVENTS = [
  {
    id: "A1",
    event: "Every `ai_events` row — including `sale.paid`",
    audience: "admin / owner",
    expectation:
      "Isabella's Boss & Owner Intelligence switches do what their labels say: a new sale, a " +
      "cancellation, a failed payment, the daily briefing, the weekly revenue summary, a " +
      "negative-feedback alert",
    today:
      "`ai-dispatch-events` is the only consumer of `ai_events`, and NOTHING INVOKES IT — no " +
      "client call, no cron schedule, no trigger. `post-payment.ts` writes a `sale.paid` row on " +
      "every paid order and it is read by nobody; `ai-run` and `ai-execute-action` write more. " +
      "So all seven owner-intelligence switches in `isabella_settings` can be turned ON and " +
      "produce nothing at all, which is the same shape of defect as the Isabella status banner " +
      "reading ACTIVE off a switch (item 1). Worth knowing before it is wired: " +
      "`supabase/config.toml` sets `verify_jwt = false` on it, so the endpoint is PUBLIC — " +
      "whoever gives it a caller has to give it auth in the same PR",
    owner: "the wiring session",
    absence: {
      kind: "absentEverywhere",
      pattern: "ai-dispatch-events",
      scan: ["src", "supabase/functions", "supabase/migrations", ".github/workflows"],
      exclude: ["supabase/functions/ai-dispatch-events/"],
      why: "an invocation anywhere — invoke(), fetch, cron.schedule — would make this row false",
    },
  },
  // A2 IS FIXED AND THEREFORE GONE. "A member's card is declined (`invoice.payment_failed`)"
  // claimed: "`stripe-webhook` sets `subscriptions.status = 'past_due'` and returns. No bell, no
  // task, no queue, no email." Item 5b gives it `notifyAdmins()` — a TARGETED notification to
  // every active admin, because these route to /admin/subscriptions and /admin is behind
  // requireAdmin, so a staff broadcast would land an operator on /unauthorized. Monitoring
  // continues (P4): the webhook does not touch `members.status`, and a test asserts no handler
  // in the file does.
  //
  // WORTH KEEPING THE SCAR. This row's own check did NOT notice the fix. It looked for the
  // literal spellings `notification_log|notify-admin|notify_staff`, and the notifier is called
  // `notifyAdmins` — so the claim read "still absent" while the code beside it told somebody.
  // That is the ninth-or-so guard in this repo to assert a spelling instead of a behaviour. The
  // `b` pattern on every remaining row now includes `notifyAdmins`, and A2 was only removable
  // because broadening it first made the check fail out loud.
  //
  // Proof of the wire: src/test/stripeWebhookContract.test.ts, "a failed payment never stops the
  // monitoring (P4)". Item 8 adds the queue half — these rows on the admin attention list.

  // A3 IS FIXED AND THEREFORE GONE. "A subscription is cancelled at Stripe
  // (`customer.subscription.deleted`)" claimed: "`stripe-webhook` sets `status = 'cancelled'`
  // and returns. Nothing is written anywhere a human is required to look" — while
  // `isabella_settings` carried a `cancellation_alert` switch promising the opposite. Item 5b's
  // `onSubscriptionChange` now calls `notifyAdmins()` on `deleted` only, because Stripe sends
  // `customer.subscription.updated` for routine things (a price change, a period rolling over)
  // and an admin who gets a bell for each stops reading them.
  //
  // AND WHY IT WAS FIXED RATHER THAN ARGUED WITH. Once A2's pattern was broadened, this row's
  // proximity check started failing too — but for the wrong reason: `notifyAdmins` from a
  // DIFFERENT handler sat inside its 900-character window. A coarse `absentPair` cannot tell
  // "this case notifies" from "something near this case notifies", so the choice was to make
  // the check precise or to make the claim false. Wiring it was one call on a mechanism already
  // there, and it is what the switch in the settings table had been promising all along.
  //
  // Proof: src/test/stripeWebhookContract.test.ts, "a cancellation is announced to a human".

  {
    id: "A5",
    event: "A price was edited without syncing it to Stripe",
    audience: "admin (super_admin)",
    expectation:
      "the person who changed the price is told it is not live yet. Until the sync runs, every " +
      "screen shows the new figure and Stripe would charge the old one",
    today:
      "nothing watches for it. `send-payment-link` REFUSES at the point of use (`PRICE_STALE`, " +
      "item 4) and the pricing editor shows drift when it is open, but no notification is raised " +
      "— so the first person to find out is a customer or the staff member trying to send them a " +
      "link",
    owner: "the wiring session",
    absence: {
      kind: "absentPair",
      a: "stripe_prices",
      b: "notification_log|notify-admin|notifyAdmins",
      window: 4000,
      scan: ["supabase/functions", "supabase/migrations"],
      why: "a notifier that reads stripe_prices would make this row false",
    },
  },
  {
    id: "A6",
    event: "An order sits in `awaiting_payment` — the checkout was abandoned",
    audience: "staff",
    expectation:
      "somebody chases it. The state exists precisely so an unpaid order is distinguishable " +
      "(F14, `20260908120400`), and a staff-sent payment link (item 4) creates one every time",
    today:
      "nothing sweeps the state and nothing is raised when an order stays in it. The fulfilment " +
      "dispatcher covers the edges FROM `paid` onwards; the edge into `awaiting_payment` has no " +
      "audience at all",
    owner: "the wiring session",
    absence: {
      kind: "absentPair",
      a: "awaiting_payment",
      b: "notification_log|notify-admin|notifyAdmins",
      window: 4000,
      scan: ["supabase/functions", "supabase/migrations"],
      why: "a sweep or a trigger raising the bell for this state would make this row false",
    },
  },
];

/** @type {Array<{wires: string[]} & Record<string, unknown>>} */
export const FAMILIES = [
  // ───────────────────────────── the anchor defect ─────────────────────────
  {
    wires: ["table:leads"],
    control: "Contact page “Send message”; /join lead capture; staff edit/assign on the two Leads screens",
    promise: "“Your enquiry has reached the team and someone will come back to you… if the matter is urgent please call the number above instead.”",
    dest: "leads (anon INSERT is allowed by policy “Anyone can submit leads”); rows are listed on /admin/leads and /call-centre/leads, and unworked ones on the call-centre dashboard",
    told: "bell",
    proof: "scripts/rls/wiring.sql",
    note:
      "THE DEFECT THIS REGISTER CAME FROM, now fixed end to end. The row always arrived and both " +
      "Leads screens always showed it, but the only trigger on `leads` was " +
      "`update_leads_updated_at` — no notification, no task, no queue. `leads` is in " +
      "supabase_realtime and /call-centre/leads does subscribe, so a lead appeared live on a " +
      "screen nobody was required to have open. That is not being told.\n\n" +
      "Three parts: an AFTER INSERT trigger raising a targeted bell notification per active staff " +
      "member (a trigger, because the form submits as `anon` and notification_log INSERT is " +
      "staff/service_role only — and because it covers every route into the table, not the one " +
      "caller someone remembered); a New enquiries card on the dashboard operators already have " +
      "open; and copy that no longer promises 24 hours.\n\n" +
      "PROVEN by `scripts/rls/wiring.sql` §2 against a real PostgreSQL — one targeted, routable, " +
      "human-readable notification per active staff member, no broadcast row, nobody terminated. " +
      "Mutation-tested three ways. This is the only row in the register that reaches 10, and it " +
      "does so because it is the one wire that has been driven all the way to a person.",
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
      "has open the lead really does appear. Nothing brought anyone TO that screen, which is the " +
      "whole difference between a live list and being told. The bell notification now does that " +
      "(see `table:leads`); this row stays `screen`, because that is all a subscription can ever " +
      "be, however healthy it is.",
  },

  // ───────────────────────── authentication ────────────────────────────────
  //
  // Added after a review found the register's central claim — that a complete
  // wire list bounds the set of controls that can do anything — was false.
  // Sign-in is not a table write, an edge function, an RPC, a subscription or a
  // mailto:, so the five login and reset routes carried no wire of their own on
  // a register whose brief explicitly named the login/reset flows.
  {
    wires: ["auth:signInWithPassword"],
    control: "Sign in — /login (member), /staff/login, /partner/login",
    promise: "your password gets you into your account",
    dest: "supabase.auth.signInWithPassword → GoTrue; the session then decides every ProtectedRoute",
    told: "self",
    proof: null,
    note:
      "The front door, on three surfaces. Nothing in the repo proves a member can actually get " +
      "in: `partnerJourney.spec.ts` drives the partner login in a browser but stubs Supabase, so " +
      "it proves the form and the routing, not the credential exchange. Whether sign-in works in " +
      "production is a click, and it is in the list for Lee.",
  },
  {
    wires: ["auth:resetPasswordForEmail", "auth:updateUser"],
    control: "Forgot password → email link → set a new one",
    promise: "we will email you a link to get back in",
    dest: "resetPasswordForEmail sends via GoTrue's own mailer; the link returns to /reset-password, where updateUser sets the password",
    told: "email",
    proof: null,
    note:
      "THE MOST CONSEQUENTIAL EMAIL IN THE PRODUCT, and the register was not asking about it. If " +
      "GoTrue's SMTP is unconfigured or its redirect is wrong, the user sees a success message and " +
      "no email ever arrives — the contact-form failure shape exactly, on the path someone locked " +
      "out of a life-safety account has to use. `RecoveryRedirect` in App.tsx also has a " +
      "10-second fallback that navigates to /reset-password whether or not PASSWORD_RECOVERY " +
      "fired, so a broken token lands on the form rather than on an error. Cannot be settled from " +
      "the repo — it is a Supabase Auth setting, and it is in the list for Lee.",
  },
  {
    wires: ["auth:signOut"],
    control: "Sign out — every header, plus the forced sign-out on a wrong-surface login",
    promise: "you are signed out",
    dest: "supabase.auth.signOut()",
    told: "self",
    proof: null,
    note:
      "Present on every route because it lives in the layouts and in AuthContext. StaffLogin and " +
      "PartnerLogin also call it deliberately: signing in on the wrong surface signs you back out " +
      "rather than leaving a half-authorised session. That is the right behaviour and it is untested.",
  },
  {
    wires: ["auth:setSession"],
    control: "Accept a staff or partner invite from an emailed link",
    promise: "this link makes your account real",
    dest: "auth.setSession with the tokens in the invite URL, then the *-complete-invite function",
    told: "self",
    proof: null,
    note:
      "Golden rule 3 lives near here: an invite establishes a session, and the ROLE must still come " +
      "from the trigger/admin path rather than from anything in the link. Nothing here writes a role.",
  },

  // ───────────────────────── file storage ──────────────────────────────────
  {
    wires: ["storage:website-images", "storage:staff-documents", "storage:social-post-images", "storage:partner-presentations", "storage:ai-agent-avatars"],
    control: "Upload a website image, a staff document, a post image, a partner presentation, an agent avatar",
    promise: "the file is saved and will show where you put it",
    dest: "Supabase Storage buckets of those names",
    told: "self",
    proof: null,
    note:
      "Also missed by the original scanner. Each bucket is used on exactly one admin or partner " +
      "screen and the admin who pressed Upload is the audience. What none has is a proof that the " +
      "object is READABLE afterwards — the failure mode is an upload that succeeds and a broken " +
      "image — and `staff-documents` is where that matters, because an HR document nobody can " +
      "open later is the same as one never filed.",
  },

  // ───────────────────────── leaving the platform ──────────────────────────
  {
    wires: ["open:window"],
    control: "Every window.open / window.location hand-off — checkout redirects, a generated file, an external dashboard",
    promise: "this takes you where it says",
    dest: "a new tab or a full navigation, out of the SPA",
    told: "external",
    proof: null,
    note:
      "The counterpart to `link:*`, and originally invisible to the scanner: a `tel:` in an href " +
      "was counted while the same number handed to window.location.href was not. 59 call sites. " +
      "This is also how the checkout redirect leaves the app, which is why the join→pay goal owns " +
      "that part and this row does not re-prove it.",
  },

  // ───────────────────────────── dead controls ─────────────────────────────
  {
    wires: ["auth:signUp"],
    control: "Self-service account creation on src/pages/auth/Register.tsx",
    promise: "create an account",
    dest: "supabase.auth.signUp",
    told: "self",
    dead: true,
    proof: null,
    note:
      "UNREACHABLE. `Register.tsx` is imported by nothing and `/register` is a Navigate to /join, " +
      "so the page cannot be opened — it is the only wire in the register with zero routes " +
      "attributed by the import graph. Harmless while dead, and worth removing rather than " +
      "leaving: it creates an account OUTSIDE the join wizard, so reviving it would be a route to " +
      "a member record with no payment behind it, which is golden rule 4's whole subject. " +
      "Reported, not deleted — removing a page is a product call.",
  },

  {
    wires: ["channel:tasks"],
    control: "Call-centre dashboard — courtesy-call list auto-refresh",
    promise: "the courtesy-call list stays current while the operator works",
    dest: "supabase.channel('dashboard-courtesy-calls') → fetchCourtesyCalls()",
    told: "screen",
    proof: "scripts/rls/wiring.sql",
    note:
      "WAS DEAD. `tasks` was NOT in the supabase_realtime publication (verified against the real schema, " +
      "not grep: 28 tables are published and this is not one). The subscription is established " +
      "and never fired, so a courtesy call assigned to an operator did not appear until they " +
      "reloaded. Published in this bundle with REPLICA IDENTITY FULL, and `scripts/rls/wiring.sql` " +
      "§1 now derives the subscribed-table list from src/ and checks it against " +
      "pg_publication_tables, so the next one cannot be dead for long.",
  },
  {
    wires: ["channel:shift_notes"],
    control: "Shift notes page — live handover list",
    promise: "code comment: “Keep the list live: notes added/edited/deleted by other operators appear without a reload.”",
    dest: "supabase.channel('call-centre-shift-notes') → fetchNotes()",
    told: "screen",
    proof: "scripts/rls/wiring.sql",
    note:
      "WAS DEAD, and the worst of the five. `shift_notes` was not published, so the code comment " +
      "described behaviour that had never once happened: a handover note written by the outgoing " +
      "shift was invisible to the incoming one until they reloaded — on the one screen whose " +
      "entire purpose is handover. Published in this bundle and covered by the §1 contract.",
  },
  {
    wires: ["channel:registration_drafts", "channel:social_posts", "channel:social_post_metrics"],
    control: "Leads page abandoned-draft list; media manager post list and metrics",
    promise: "the list updates itself",
    dest: "postgres_changes subscriptions on registration_drafts / social_posts / social_post_metrics",
    told: "screen",
    proof: "scripts/rls/wiring.sql",
    note: "Same cause as the two above — not in the publication. Lower consequence (admin surfaces, reloadable). Published in this bundle and covered by the §1 contract.",
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
    dest: "submit-registration → create-checkout (synced Stripe Price ids, ids-only request) → gateway; activation is by webhook only (golden rule 4)",
    told: "bell",
    proof: "src/test/createCheckoutContract.test.ts",
    note:
      "OWNED HERE AS OF ITEM 5 — this entry previously read 'out of scope by instruction', " +
      "which was true while a separate goal held the path. `create-checkout` now takes ids only " +
      "and prices from `stripe_prices` (REVIEW_JOIN_PATH.md F7/F9 closed), and `stripe-webhook` " +
      "refuses activation when `amount_total` disagrees with `payments.amount`. " +
      "`create-mollie-checkout` is STILL on the old shape — it takes `lineItems` with amounts " +
      "from the browser — and is the reason this row is not a 10. notify-admin fires " +
      "`sale.paid` from the webhook side, which is why `told` is bell.",
  },
  {
    wires: ["fn:join-order-status"],
    control: "/join?success — the confirmation screen, polling for the webhook",
    promise: "your payment is confirmed, and here is the one thing still to do",
    dest:
      "join-order-status, keyed on the Stripe Checkout Session id (never the order number, " +
      "which is sequential) → the member's second-stage link and the 24-hour number",
    told: "screen",
    proof: "src/test/joinOrderPolling.test.tsx",
    note:
      "Item 6. The screen used to announce 'registration complete' from a query parameter, " +
      "before the webhook had run and for ever if it never ran. It now waits, then shows the " +
      "`member_update_tokens` link that collects the emergency contacts the wizard stopped " +
      "asking for — on screen, because no member email is deliverable yet. It gives up after " +
      "90s and falls back to the phone route.",
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
    wires: ["table:notification_routes", "table:staff_notification_prefs", "fn:notify-staff"],
    control: "Admin → Settings → Notifications: the event × channel switches, the per-staff matrix beneath, and \"send a test notification\"",
    promise: "the person who needs to know is told, on a channel that works",
    dest: "notification_routes (company policy) and staff_notification_prefs (the person), both read by the notify-staff router on every send — so a switch changes the next notification, with no redeploy. Each change writes an activity_logs row carrying the old and new value.",
    told: "screen",
    proof: "src/test/notificationMatrix.test.ts",
    note:
      "The switches are the fix for the schema this replaces: a boolean COLUMN PER EVENT on " +
      "notification_settings, which is how `whatsapp_ev07b_alerts` came to be read by " +
      "notify-admin without any migration ever creating it. THE FOUR ALWAYS-LOUD EVENTS RENDER " +
      "AS LOCKED, not as switches: the router ignores both tables for them, and a switch that " +
      "cannot silence the alarm saying the SOS ladder is broken must not look like one. Every " +
      "dark cell names which of the three gates stopped it, and `wouldReach` is driven against " +
      "the router's own `planNotifications` across all 19 events × 4 channels × both switches " +
      "so the screen cannot claim something the router will not do. Scored on the screen only: " +
      "until the migration is applied the matrix says so rather than rendering an empty grid.",
  },
  {
    wires: ["table:staff_push_tokens"],
    control: '"Enable notifications on this phone" — Admin → Settings → Notifications, and Staff preferences',
    promise: "an alert reaches you when this page is closed",
    dest: "staff_push_tokens, one row per device keyed on the FCM registration token; read by the notify-staff router's push transport (_shared/fcm.ts) and pruned by it when Google says a token is dead",
    told: "push",
    proof: "src/test/pushClient.test.ts",
    note:
      "REPLACES A WIRE THAT WENT NOWHERE. The previous hook upserted " +
      "`notification_settings { user_id, push_token, push_enabled }` — three columns that table " +
      "has never had — through a hand-written `supabase as unknown as` façade whose only effect " +
      "was to stop TypeScript saying so, and no component called it. Not scored higher than push " +
      "itself: until FIREBASE_SERVICE_ACCOUNT and the six VITE_FIREBASE_* variables exist, the " +
      "card says so rather than offering a button that does nothing.",
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
    wires: ["fn:send-payment-link"],
    control: "Staff send a member a Stripe payment link (CRM → member → Subscription)",
    promise:
      "a real Stripe Checkout link for a chosen plan, sent by SMS and email where those are " +
      "switched on, and always shown on screen to copy",
    dest:
      "send-payment-link → create_payment_link_order (pending order + items + subscription + " +
      "payment, one transaction) → Stripe Checkout Session (mode: subscription) → twilio-sms " +
      "and/or send-email; activation is stripe-webhook's alone",
    told: "the payer (SMS + email), and activity_logs twice — the order created, and what was sent",
    proof: "src/test/sendPaymentLink.test.ts",
    note:
      "Replaces a `Create Subscription` button that had NO onClick. The browser sends a plan, a " +
      "billing frequency, a pendant count and who pays — no amounts: every line item names a " +
      "Stripe Price id created from pricing_plans/pricing_settings, and the request schema has " +
      "no amount field. Refuses rather than guessing when a Price is unsynced or stale. " +
      "REQUIRES 20260909110000 in production (the SQL function it calls); until that is applied " +
      "the button returns a 409 naming the missing function.",
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
    control:
      "Admin edits the catalogue, pricing, settings, templates, images, testimonials, blog, " +
      "costs — and, in Settings → Payments, WHICH PAYMENT METHODS A CHECKOUT OFFERS",
    promise: "the change is saved and takes effect",
    dest:
      "the named configuration tables. `system_settings.checkout_payment_methods` and " +
      "`checkout_async_events_confirmed` are read by _shared/checkout-payment-methods.ts and " +
      "passed as `payment_method_types` by BOTH create-checkout and send-payment-link; each " +
      "change is an activity_logs row carrying the old and the new value",
    told: "self",
    proof: "src/test/checkoutPaymentMethods.test.ts",
    note:
      "One promise, one audience: the admin who pressed Save is the only person who needs to " +
      "know, and a toast tells them. No notification is owed and none is missing. " +
      "THE PAYMENT-METHOD ROWS ARE THE EXCEPTION TO 'cosmetic': neither checkout function set " +
      "`payment_method_types`, so STRIPE'S DASHBOARD DEFAULTS decided — and in the EEA those " +
      "include SEPA Direct Debit, which is ASYNCHRONOUS. Its session completes with " +
      "`payment_status: \"unpaid\"` and activation depends on " +
      "`checkout.session.async_payment_succeeded`; unless the webhook destination is subscribed " +
      "to that, the customer pays and is NEVER ACTIVATED, with no error anywhere. Card is " +
      "always offered and cannot be unticked; the three async methods are greyed with the " +
      "reason until an admin confirms the destination listens, and that acknowledgement is " +
      "re-applied when the setting is READ as well as when it is written.",
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
    control:
      "Settings — save provider keys (Stripe, Mollie, Twilio, Facebook, and the three Firebase " +
      "values), send a test email, test Twilio, send a test push to this device",
    promise: "your credentials work",
    dest: "save-api-keys → system_settings (secrets never reach the client); send-test-email; test-twilio; notify-staff for the test push",
    told: "self",
    proof: "src/test/firebaseConfig.test.ts",
    note:
      "These are the only in-app way to find out whether the email, SMS and push channels are " +
      "live, which is exactly what this register cannot determine from code. FIREBASE JOINED " +
      "THEM: push used to need six VITE_FIREBASE_* build-time variables in Vercel plus a " +
      "FIREBASE_SERVICE_ACCOUNT Edge secret — seven values, two consoles, and a redeploy before " +
      "any of them did anything. The three paste fields replace that, and the test push's " +
      "outcome is a notification_log row whichever way it goes. The service account is stored " +
      "under a key ending `_key` so the staff read policy excludes it; the six web values are " +
      "public by design and staff-readable because every operator's phone needs them.",
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
