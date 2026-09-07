# STATE.md — the honest state of ICE Alarm España

> **This file tells the truth or it is a bug (GOALS.md G5).** Every "VERIFIED WORKING" line
> names the test or click-through that proves it. Nothing is marked working on the strength of
> a comment, a status doc, or "it looks implemented."
>
> - **Audit date:** 2026-06-18
> - **Branch:** `docs/truth-audit` · **Method:** static source/migration review + full suite run.
>   Runtime behaviour against the live DB was **not** exercised (Supabase MCP unauthenticated,
>   no E2E harness in repo), so most runtime claims are UNVERIFIED by design of this audit.
> - **Legend:** ✅ VERIFIED WORKING (passing test / click-through named) · 🔴 BROKEN (evidence) ·
>   🟡 UNVERIFIED (code exists, nothing proves it) · ⬜ MISSING (expected by the plan, not present).

---

## Backend identity — SETTLED 2026-08-11

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | Authoritative project ref | ✅ VERIFIED | **`crpsuhoixfdhjugprbuc`** (care-conneqt-prod, LifeLink Sync, Pro). Lee confirmed in the Supabase dashboard: Pro tier, 24,299 requests at 100%, real migration history, backup 7h old. |
| B2 | `cfwnrcogikjycjcobsay` | ✅ VERIFIED — CANCELLED | Never became live production. Cutover cancelled 2026-07-22. Appears in **no** runtime or config file — docs only, all annotated HISTORICAL. |
| B3 | `qkfvojbcxaptufsepupo` | ✅ VERIFIED — **DEFERRED** | ice-alarm-espana-platform (VirtueleThuiszorg, Free): no migrations, no backups, empty. Possible **future** migration target. **The earlier "to be deleted" decision is WITHDRAWN** (2026-08-11). |
| B4 | Repo-wide ref audit | ✅ VERIFIED | `PROJECT_REFS.md` — every reference classified CURRENT / HISTORICAL / DEFERRED / BUG, per file and line, incl. all `docs/archive` hits. |
| B5 | `vercel.json` sitemap rewrite | ✅ FIXED | Was the literal `YOUR_SUPABASE_PROJECT_REF` → `/sitemap.xml` resolved to a non-existent host. Now the real ref. |
| B6 | `vite.config.ts` env fallback | ✅ FIXED | Silent placeholder fallback removed; the build now **throws** naming the missing var. Proven both ways: build fails without env, succeeds with the env CI supplies. |
| B7 | 6 email-template logo URLs | ✅ FIXED | All six `_shared/email-templates/*.tsx` carried the placeholder. Now the real ref. ⚠️ **Still owed:** upload the logo to the `email-assets/logo.png` storage object — until then the images 404 (templates are currently unreferenced by any function, so no live email is affected). |
| B8 | Untouched by design | — | `index.html`, `.github/workflows/deploy-functions.yml`, and the two cron migrations (`20260716120000`, `20260723120000`) already name the authoritative ref. The cron pair is the **SOS-escalation path** — not edited (G1 / human gate). |

## Staff control of the member record (2026-09-07) — WP7 · **a live defect removed**

> Scope: `CC_MASTER_BRIEF.md` WP7. Schema: `20260907100500`, applied.
>
> **The defect this replaces was live.** `SubscriptionTab.updateStatus` wrote
> `subscriptions.status` straight from the browser for pause, resume and cancel — and for
> Stripe it called nothing at all; its own comment said *"Stripe cancellation would be handled
> via Stripe Dashboard or API if needed."* So pressing **Cancel** left the database saying
> `cancelled` **while Stripe kept charging the member's card**, and pressing **Resume** wrote
> `status='active'` from the client, which golden rule 4 reserves for the payment webhook.
> Neither was attributed and neither had a reason. `admin-subscription-action` — which does it
> properly, Stripe first — existed and was not called.

| # | Item | Status | Evidence |
|---|---|---|---|
| W1 | The client cannot write `subscriptions.status` | ✅ VERIFIED | `updateStatus` deleted. `src/test/staffMemberActions.test.tsx` (19) sweeps **all of `src/`** for a `subscriptions` update carrying `status`, not just the one file — the same three buttons could reappear anywhere. |
| W2 | Every action goes through the gateway, and the SERVER mirrors the status | ✅ VERIFIED | `useMemberAction` → `admin-subscription-action` (Stripe) or `cancel-mollie-subscription` (Mollie). Both mirror the DB themselves, after the gateway accepts. The gateway call is asserted to happen **before** the audit row. |
| W3 | Mollie is handled honestly | ✅ VERIFIED | Cancellation uses the Mollie function. A Mollie **pause** is refused with a reason: the old code "paused" it by writing the DB and leaving Mollie charging. Refusing is not a lost capability, it is a removed trap. |
| W4 | Each action attributed, with a mandatory reason | ✅ VERIFIED | `activity_logs` row with `member_action`, `staff_id`, `entity_type='member'` and a trimmed reason — the exact shape `enforce_member_action_attribution()` accepts. The dialog refuses to submit without one, so nobody reaches the trigger's `RAISE EXCEPTION`. |
| W5 | A change that happened but was not recorded is said out loud | ✅ VERIFIED | The one state this feature exists to prevent. Distinct from a failed gateway call, which reports that **nothing** changed and writes no log. |
| W6 | Renew, single↔couple, add a pendant | 🟡 RECORDED, not performed | Each is new Stripe money-movement code against a real card that nothing here can test, and a mistake in it charges a real person. They are **offered** — an absent button is indistinguishable from a feature nobody built — with a badge saying *"You do it in Stripe"* and a note that the billing was not touched. **The audit trail works for all six today**, which is the part that was missing. |
| W7 | `member_action` has no `resume` | 🟡 GAP recorded | The enum is the brief's six. A resume is therefore logged as an ordinary attributed `activity_logs` row rather than a `member_action` one. One `ALTER TYPE … ADD VALUE 'resume'` in the next schema bundle — `PENDING_FOR_LEE.md` D-10. |

## Member dashboard pass (2026-09-07) — WP4 · **the shell is in, the pages are not converted yet**

> Rules: `MEMBER_UX_RULES.md` R1–R11. This section grows one row per increment; nothing below is
> claimed on the strength of "it looks implemented".

| # | Item | Status | Evidence |
|---|---|---|---|
| M1 | R5 — one page shell, every page composed from it | ✅ VERIFIED (4a) | `src/components/client/PageHeader.tsx`; all **nine** client pages converted, including the dashboard. `src/test/memberPageShell.test.tsx` (11) asserts the ABSENCE: no page may hand-roll the old header block or render its own `<h1>` again, and a page added without the shell fails. Six mutations, each producing a verdict. |
| M2 | R5/R10 — 28px title, 16px subtitle | ✅ VERIFIED (4a) | The pages used `text-2xl md:text-3xl`, so on a **phone** — where most of these members read — the title was 24px, not the 28px R5 names. The responsive step-down is gone: the rule does not have one, and a smaller title on a small screen is the wrong way round for this reader. |
| M3 | R1 — one red button per page | ✅ VERIFIED (4f) | **Three pages showed two red buttons saying the same thing**: `EmergencyContactsPage`, `MessagesPage` and `SupportPage` each rendered a header action AND an empty-state action, both `bg-primary`, both opening the same dialog, both on screen for a member with nothing in the list — precisely the member the empty state is for. R8 keeps it in the empty state, beside the sentence explaining it; the header's slot appears once there is a list. Not hidden with `className="hidden"`, which leaves a focusable control nobody can see — asserted. `memberRedButtons.test.tsx` (8) pins **every** red button on the member surface with a written reason each, exact in both directions, and **renders** `EmergencyContactsPage` at zero contacts and at one to prove the actual rule. The pin is a drift guard and says so: it cannot know which buttons are on screen together. Buttons that override the background (`bg-[#25D366]`, WhatsApp) are not red and not counted. |
| M4 | R3 — the readiness notice moves INTO the header, the banner goes | ✅ VERIFIED (4b) | `MemberReadinessNotice` in the desktop header's LEFT slot — which R3 reserves for it and which stood empty — and as `md:hidden` layout chrome on mobile, where a 64px header has no room for a sentence. `MonitoringReadinessBar` is **deleted**, not merely unmounted: a component left in the tree is one somebody mounts again. The service announcement is gone from Home too (D10: announcements go in the bell). `memberReadinessNotice.test.tsx` (27), six mutations. |
| M10 | R3's one sentence vs the spec's "lead with what works" | 🟡 TENSION recorded | The old bar led with *"Your alarm works and an operator will always answer it"*, which `ICE_OPERATOR_CARD_SPEC` §5.2 records as a rule. R3 asks for one sentence, so that reassurance now lives on the page the member lands on. The better answer is one sentence that does both — *"Your alarm works — we just need someone to contact"* — which needs three new strings in three languages. `PENDING_FOR_LEE.md` D-11 carries the exact wording. Nothing is frightening in the meantime: the current sentence is a task, not an alarm. |
| M5 | R6/R8 — read-only by default; empty states offer the action | ✅ VERIFIED (4d) | The banned sentence is gone, and R8 turned out to be wrong for six of the seven states that reach that branch: `useMemberSubscription()` filtered on `status='active'`, so a paused, suspended, cancelled, expired, in-arrears or awaiting-payment member got the same `null` — and the same message — as somebody who never joined. `src/lib/membershipCondition.ts` maps every `subscription_status` (checked against the **migrations**) to its own copy; **only `never_joined` is shown the plans**, because sending a member in arrears to `/join` would give one person two member records (`submit_registration_atomic` INSERTs unconditionally) and an operator two records to choose between during an SOS. A failed read is `unknown`, never "you have never joined". `membershipCondition.test.tsx` (40), fifteen mutations, each producing a verdict. |
| M11 | The `?action=` support routes — one list, not five | ✅ FIXED (4d) | The subjects lived in a `Record<string,string>` inside `SupportPage` while four pages built the URL by hand, so `report-issue` for `report_issue` opened a generic "Support Request" and nothing failed. `src/lib/supportActions.ts` is the list; a test asserts **no file in `src/` hand-builds an `?action=` URL**. An unrecognised value still opens a request — a member following an old link deserves a conversation. |
| M12 | Who pays, on the page of the person being paid for | 🟡 PARTIAL (4d) | The Membership page says whether the member pays or somebody else does. It does **not** name them: `payers` grants SELECT to staff and to the payer only, so a member cannot read the row their own `payer_id` points at. Showing the name needs a new RLS policy on the table whose design note is that being a payer grants no access to anything — a mandatory human gate. `PENDING_FOR_LEE.md` **D-13**. |
| M13 | "Add a pendant" / "Change to couple" — offered, not performed | 🟡 PARTIAL (4d) | Both buttons exist, outline rather than red (R1), and each opens a prefilled conversation. WP4 says "through Stripe checkout only" and **there is no member-initiated checkout for an existing account** — `/join` creates a second member. `PENDING_FOR_LEE.md` **D-12** puts the build-or-leave-it to Lee. Two defects fixed on the way past: the amount rendered `€24.99//mo` (`subscription.mo` is `"/mo"` and the page prefixed a slash), and five dead locale keys promising things nothing does are deleted. |
| M6 | Medical information — **all** the fields | ✅ VERIFIED (4c) | All **sixteen** member-editable columns of `medical_information`, in the brief's six sections, plus "Getting into your home" from `member_access` — read-only by RLS, codes masked with Show, locked **with a reason** (R7's pattern, not R6's banned sentence). Driven from `src/lib/medicalFields.ts`, checked against the generated Row type at compile time. `src/test/medicalInfoFields.test.tsx` (20) reads the **migrations** for the column list, so completeness is measured against the schema and not against any of the four hand-maintained copies. Seven mutations, each producing a verdict. |
| M9 | The four hand-maintained copies of `medical_information`'s shape | ✅ FIXED (4c) | `types.ts` (#188, was missing ten columns), `useMemberProfile.MedicalInfo` (an interface listing eight — the query already said `select("*")`, so the **type** was what threw the data away), the page's markup, and `member-self-service`'s save whitelist. The last two now agree by assertion, in both directions: a field the page renders that the save drops is worse than a field that is absent. |
| M15 | R3 — MemberChatButton becomes the "Assistant" outline pill | ✅ VERIFIED (4g) | It was a bare round avatar with no visible label: an unlabelled circle in a header is a photograph, or an account menu, or a decoration, and a member had to press it to find out — the `aria-label` meant a screen reader was better served than the person looking at the screen. Outline, not red (R1). |
| M16 | The pulsing green dot that meant something else | 🔴 FIXED (4g) | The chat button carried a hard-coded `bg-green-500` + `animate-ping` dot, driven by **nothing**. The member surface already uses a small round green dot for exactly one thing — `is_online`, the pendant's connectivity, rendered from real data on the dashboard and the device page. The same mark on a header button teaches a member that a green dot means their alarm is connected and then shows them one that does not. Gone; `chat.available` still says the assistant is always there, in words, inside the widget. |
| M17 | R3 — initials avatar, and the initials NOT invented | ✅ VERIFIED (4g) | Initials come from `first_name`/`last_name` or not at all. `displayName` falls back to the email prefix, so initials taken from it would render a plausible "LW" for somebody who never told us their name. The generic icon says "we do not know yet", which is true. **The "role" half of R3 is deliberately not added to the header cluster**: every user of this surface is a member, so a "Member" label beside their own name is noise. It stays in the account dropdown next to the email, where it is information. |
| M7a | R7 — DOB and NIE locked **with a reason** | ✅ VERIFIED (4h) | The page had **four** locked fields and got all four wrong: DOB and NIE said *"Cannot be changed"* (what, not why), email said *"Contact support to change your email address"* — **R6's banned sentence, verbatim** — and country said nothing at all. All four now go through `LockedIdentityField`, whose `reason` prop is **required**, so the next locked field cannot default to no explanation. DOB/NIE carry R7's own sentence. `lockedIdentityFields.test.tsx` (11), ten mutations. |
| M18 | The padlock is a **label**, not a rule | 🔴 OPEN — Lee | `"Members can update own profile"` is `FOR UPDATE` with no column restriction, and the guard trigger from 20260904180000 names only `status` — its own comment lists NIE as an ordinary self-service write, which was true of the brief we had then. So a member can still PATCH `date_of_birth` and `nie_dni` through PostgREST and the operator card would show an identity number a stranger typed. **This application never sends those columns** (asserted), so it is a label rather than an open door. The one-branch fix, and why it waits for a bundle, is `PENDING_FOR_LEE.md` **D-14**. |
| M7b | R7 — the member photo upload | ⬜ BLOCKED — needs a bucket | There is no `member-photos` storage bucket; the eleven that exist are staff/marketing. A bucket's policies are RLS policies, which CLAUDE.md makes a mandatory human gate, and the migration would redden the drift gate until applied. Bundled with M18 in D-14 for Lee, with the upload UI, because an upload button against a bucket that does not exist is worse than none. |
| M25 | WP4 My pendant — "What You're Missing" is gone | ✅ VERIFIED (4j) | Four rows in `text-destructive`, each with a red ✗: we cannot track your location · falls are not detected · you must call us manually · no boundary alerts. Every line true; the whole card wrong. It opened the page of somebody who **chose** the phone-only plan with four ways they are unprotected, in the colour this product reserves for an emergency (R2), on the screen they are most likely to open when they are worried. Replaced by what they **have** — a monitored line and a number that reaches an operator — plus one action. The pendant's feature list survives, in the offer, where a feature list belongs. |
| M26 | The page told a member who had **paid** for a pendant to buy one | 🔴 FIXED (4j) | `hasPendant` was `subscription?.has_pendant && device`, so every member in WP2's `paid` and `allocated` states — between the payment and the device being assigned — fell into the phone-only branch and was shown "What You're Missing" and a **"Purchase Pendant"** button. Its own branch now, carrying the real `fulfilment_state` via `FULFILMENT_MEANING`, and saying that the next step is a test call **we** make (Q1 is operator-confirmed only, so a member waiting for a button they can press is waiting forever). |
| M27 | The only route to adding a pendant was gated on a setting | 🔴 FIXED (4j) | It was a single `whatsappNumber && <Button …wa.me…>`. With `settings_emergency_phone` unset — the state WP1b's *"show nothing, never a fake number"* rule leaves us in until S-seed — a phone-only member had **no route at all** to the one thing that page offers. The in-app support route is unconditional and is the page's one red button; WhatsApp is a second, outline option when a number is configured. |
| M28 | `usePendantOrderForMember` could not see an order before the device existed | ✅ FIXED (4j) | Its `order` is reached through `devices → order_items`, which is the path readiness takes and whose gap the hook exists to expose — but it finds nothing in the window a member most wants to read about. `memberPendantOrder` is a **separate** field looking the order up by `item_type = 'pendant'` on the member's own orders. Separate rather than folded in, because a non-null `order` with `linkedToOrder: false` would quietly change what `PendantFulfilmentCard` reads, and that card's whole job is to say *"this pendant is on no order"*. |
| M29 | The red-button parser was reading prose | 🔴 FIXED (4j) | `memberRedButtons.test.tsx` counted a `<Button` that appeared inside a **comment explaining a button** — the prose-vs-code slip, this time inside the measuring instrument, where it is worse: the inventory could be moved by writing about buttons. It strips comments now. The first stripper also tried to match a whole JSX comment including its braces and **swallowed 3KB of real markup** in `MedicalInfoPage`, dropping its count from 2 to 0; stripping only comment bodies is both simpler and safe. |
| M8 | R10 — the A/A text-size control, persisted | ✅ VERIFIED (4e) | `src/lib/textSize.ts` + `TextSizeControl`, in the desktop header (R3's slot, between the bell and EN/ES) **and the phone header** — not inside the menu sheet, because a member who cannot read the screen cannot reliably find a control hidden behind a hamburger. Two levels and **neither shrinks the text**: a way to go below R10's 16px floor would be pressed once by accident and then be unreadable, including the control that undoes it. Applied from `main.tsx` before `createRoot().render()`, so the page does not render small and jump. Every `localStorage` access wrapped — Safari private mode throws on `setItem`, and a failed write costs the preference, not the visit. `textSizeControl.test.tsx` (29), fifteen mutations. |
| M14 | Scalable fonts — the px sizes that silently opted out | ✅ FIXED (4e) | An arbitrary `text-[28px]` ignores the root font size, so the A/A control would have enlarged every other word on a member page and left the titles exactly where they were. R5's 28px is `text-[1.75rem]` — the same size at the default level. A guard test forbids a px font size in `src/pages/client` or `src/components/client`, and **it fired on its first merge**: #203's plans card landed two `text-[13px]` after this branch was cut. |

## Notification fan-out (2026-09-07) — WP3 · **dispatcher shipped, every channel OFF**

> Design: `FULFILMENT_MODEL.md` §6-A. Schema: `20260907100200`, applied.
>
> **Nothing is sent to anybody today, and that is correct rather than broken.** All three
> `notify_channel_*` flags are seeded `false`, so every decision the dispatcher makes is
> `skipped_channel_off` — recorded, not silent. Turning a channel on is Lee's table edit
> (`PENDING_FOR_LEE.md` §3), and the second gate (the member's own opt-in) applies after it.

| # | Item | Status | Evidence |
|---|---|---|---|
| N1 | One dispatcher, called on every state edge | ✅ VERIFIED | `_shared/notify-fulfilment.ts` + the `notify-fulfilment` function. Called from `useFulfilmentState`, `linkDeviceToPendantOrder` and `markOrderProgrammed` via `src/lib/notifyTransition.ts` — asserted, including that no transition means no notification. |
| N2 | Two gates: global channel flag **and** member opt-in | ✅ VERIFIED | `src/test/notifyFulfilmentDispatcher.test.ts` (29). A flag is on only when its value is exactly `true` — `TRUE`, `1`, `yes`, `""` and absent are all off, asserted for all five. An absent opt-in row is not permission. |
| N3 | A skip is recorded, never silent (G2) | ✅ VERIFIED | One `member_notification_log` row per decision, with a status naming which gate stopped it. Mutation: logging only successes → 3 red. |
| N4 | No template means no message | ✅ VERIFIED | No inline fallback text exists in the dispatcher. Missing or inactive → `skipped_no_template`. Locale falls back to **Spanish**, not English. |
| N5 | The payer is resolved per D6 | ✅ VERIFIED | Second recipient when `payer_id` is set **and their address differs** — compared on addresses, not ids, so a payer who is the member is not messaged twice. Own event key (`fulfilment.*.payer`) so the text can differ. |
| N6 | A payer is actually notified | 🔴 BLOCKED — decision needed | There is nowhere to record a payer's consent: `member_notification_optin` is keyed on `member_id`. Every payer send is refused and logged `skipped_no_payer_consent`. `PENDING_FOR_LEE.md` D-8 sets out the two ways to close it. |
| N7 | Templates seeded per transition × recipient × language | ⬜ MISSING | The table exists and is read; no rows are seeded yet, so every channel would read `skipped_no_template` even with a flag on. A seed migration is the next piece and needs Lee to apply it. |
| N8 | The "new member" staff notification (D5), from the webhook | ⬜ MISSING — held for a human | Touches `stripe-webhook`. Per the brief that PR stays open. |
| N9 | WhatsApp opt-in link (D8) | ⬜ MISSING | The receiving side and the `wa.me` link, after the templates. Sending waits on S2. |

## Fulfilment state machine (2026-09-07) — WP2 · **schema APPLIED, screen partly shipped**

> Design: `FULFILMENT_MODEL.md`. Scope: `CC_MASTER_BRIEF.md` WP2. Lee's rulings on §9 are
> implemented and each carries a named assertion in `scripts/rls/isolation.sql`.
>
> **This is the section to read before believing any readiness number.** The readiness count for
> every member is **zero** today and that is correct: readiness now needs a `tested` order, no
> order has ever been in `tested`, and until increment 5b ships there is no way to put one there
> from the member record. It must not be "fixed" by backfilling `tested`.

| # | Item | Status | Evidence |
|---|---|---|---|
| F1 | `fulfilment_state` enum, six ranked states plus `cancelled` | ✅ APPLIED to prod | `20260907100000`, `20260907110000`. Recorded in `APPLIED_TO_PROD.txt`. |
| F2 | One step forward, D9 roles for a correction, a **new** reason required, `activity_logs` written | ✅ APPLIED to prod | `enforce_fulfilment_state()`, `20260907110100`. Asserted in `scripts/rls/isolation.sql`; each assertion mutation-tested. |
| F3 | `tested` refuses to be set without a resolvable staff id | ✅ APPLIED to prod | `20260907110100`. The state's entire content is that a named operator answered. |
| F4 | Existing rows backfilled (`processing`→`allocated`, `shipped`→`dispatched`, …) | ✅ APPLIED to prod | `20260907110100`, trigger explicitly disabled for the block — a backfill is not a transition. |
| F5 | Readiness = ≥1 contact **AND** a tested pendant still in good standing (D4, Q2) | ✅ APPLIED to prod | `20260907100100`. `security_invoker` preserved and asserted. |
| F6 | A member cannot write any fulfilment state (Q1) | ✅ VERIFIED | `scripts/rls/isolation.sql` — no UPDATE path exists, and the assertion re-reads the row to prove it is unchanged. |
| F7 | The staff **orders screen** moves a fulfilment state | ✅ VERIFIED (increment 5a) | `src/lib/fulfilmentState.ts` + `useFulfilmentState` + the column, filter, forward action and correction dialog on `/admin/orders`. `src/test/fulfilmentStateContract.test.ts` (45) proves the module mirrors the trigger — ranks, the correction predicate, the D9 role set and all five refusal messages are read out of the migrations. `src/test/ordersFulfilmentActions.test.tsx` (25) renders the screen. Both mutation-tested. |
| F8 | `programmed` set by finishing the `ProvisioningChecklist` | ✅ VERIFIED (increment 5b) | `markOrderProgrammed` fires from `useDeviceProvisioning` when **all** steps are complete — no button anywhere sets `programmed`, asserted. Attempted only from `allocated`: `paid → programmed` is a skip the trigger refuses, and walking two rungs would assert an allocation nothing checked. The checklist has **14** steps, not the brief's six, and the count is hard-coded nowhere — `PENDING_FOR_LEE.md` D-7. |
| F9 | `tested` reachable from the member record | ✅ VERIFIED (increment 5b) | `PendantFulfilmentCard` on the member's Device tab. Offered **only** from `delivered`, and it writes the state alone — `tested_by` is resolved by the trigger from `auth.uid()`. The SOS-screen copy of the action is **deliberately not built**: that is the SOS path and CLAUDE.md gates it on a human — `PENDING_FOR_LEE.md` S10. |
| F11 | Allocation writes `order_items.device_id` **and** moves `paid → allocated` | ✅ VERIFIED (increment 5b) | `linkDeviceToPendantOrder`, called by `DeviceTab.assignDevice` after the device row is written. **This closed a readiness dead-end**: readiness reaches a pendant through `orders → order_items → devices`, and `assignDevice` wrote only `devices.member_id` — so a pendant allocated by hand was invisible to readiness and that member could never be recorded as protected. `FULFILMENT_MODEL.md` §8-C. |
| F12 | The **webhook** allocation path moves `paid → allocated` | 🔴 BROKEN — fix held for a human | `_shared/post-payment.ts` allocates a device (`devices.status`, `order_items.device_id`) and does **not** move the fulfilment state, so every webhook-allocated order sits at `paid`. One line, in the payment path, so per the brief the PR stays open. `PENDING_FOR_LEE.md` §5 and S11. |
| F13 | The readiness **queue** has two row kinds and names the work | ✅ VERIFIED (increment 5c) | `readinessGap()` — one derivation read by every surface — plus a "What is missing" column, per-kind counts, and the queue's title/subtitle/empty-state corrected (they claimed the queue was only about contacts, which was true of one condition out of two). `src/test/readinessGap.test.ts` (15), `readinessQueue.test.tsx` (24). |
| F14 | The **member header notice** names which condition is missing | ✅ VERIFIED (increment 5c) | `MonitoringReadinessBar`, three variants. The pendant-only variant offers the member **nothing to press** — Q1 is operator-confirmed only, so a button would be a lie or a hole in that ruling; the phone number is the action. All five new strings in en/es/nl. `memberReadinessBar.test.tsx` (27). |
| F15 | The **operator card zero-state** names which condition is missing | ⬜ MISSING — held for a human | `SOSActionPanel` is the SOS path and CLAUDE.md gates it. Built as its own PR left OPEN, not merged. `PENDING_FOR_LEE.md` S10. |
| F10 | `awaiting_stock` as a condition rather than a state | ✅ VERIFIED (increment 6) | `fulfilmentCondition()` derives it from `fulfilment_state='paid'` + `orders.status`, with **no new column**. Chip beside the state (the order still reads Paid), a filter on both columns in the query, and the status nudge that allocated nothing is gone — replaced by "Allocate a device" on the member record, offered to an ordinary operator. Allocation clears the stale status so the condition clears itself. `FULFILMENT_MODEL.md` §6-B. |
| F16 | Every `admin.fulfilment` string exists in en/es/nl | ✅ VERIFIED (increment 6) | #192, #193 and #195 shipped 52 keys as inline fallbacks to keep locale JSON out of three concurrent PRs (CLAUDE.md's serial-merge rule). This PR adds all of them, plus the three `sos.action.pendantUntested*` keys #196 needs, so that held PR need not touch locale JSON at all. Every key the code names now resolves in all three locales — checked exhaustively, not sampled. |

## Emergency-contact readiness (2026-09-04) — the second axis · **SHIPPED to main**

> Design: `READINESS_MODEL.md` (#150). Increments: #151 (notify outcome), #152 (operator card),
> #153 (readiness view), #155 (paid-but-not-ready queue). Spec: `ICE_OPERATOR_CARD_SPEC.md` (#154).
> **ALL SIX ARE NOW MERGED** — `main` at `2b9444b`. The rows below record what `main` does today;
> the "BROKEN on main · fix open in #15x" wording they carried while the PRs were open is
> superseded, not deleted, so the before/after stays legible.

| # | Item | Status | Evidence |
|---|---|---|---|
| R1 | `emergency-contact-notify` reported a member with **zero** contacts as `{success: true, notified: 0}` at HTTP 200 | ✅ FIXED on main (#151) | Now a union on `outcome`: `notified` 200 / `all_failed` 502 / `no_contacts` **409** / `contacts_unreadable` **503**, `success` true only for `notified`. `src/test/emergencyContactOutcome.test.ts` sweeps every constructor so no branch can pair `success:true` with `notified:0` again. |
| R2 | The same branch swallowed `contactsError`, so a **failed read** returned the byte-identical payload as an empty table | ✅ FIXED on main (#151) | Split into `contacts_unreadable` (503, retryable) vs `no_contacts` (409). Asserted distinct in outcome **and** status. |
| R3 | Neither ingest caller read the notify response at all | ✅ FIXED on main (#151) | Both routed through `_shared/notify-emergency-contacts.ts` — one implementation. Asserted: no bare fetch to the function remains in either caller, and the helper reads `res.json()`. |
| R4 | Level 5 was **silent** for a member with no contacts, then recorded the tier as *reached* | ✅ FIXED on main (#151) | `fireNoTargetsAlert`, L5-only. `escalationOutcome.test.ts` asserts L2–L4 no-targets are unchanged, so the fix did not become an alert storm. |
| R5 | The operator card rendered "no emergency contacts" at 12px grey-on-dark (3.2:1), below the fold | ✅ FIXED on main (#152) | Loud non-dismissible `role="alert"` banner above JOIN CALL. 12 rendering tests; the two load-bearing **absences** (no banner while loading, none on a failed read) were mutation-proven. |
| R6 | No completeness/readiness concept existed anywhere | ✅ FIXED on main (#153) | `public.member_monitoring_readiness`, `security_invoker = on`, derived — no column, no trigger, no stored flag. |
| R7 | Admin queue of paid-but-not-ready members | ✅ SHIPPED on main (#155) | `/admin/members/readiness-queue`: `active` but not monitoring-ready, oldest paid first, days waiting, `tel:` per row, own sidebar entry. Reads the R6 view — never re-derives (asserted). **No automated chase** (email undeliverable; a silent chase failure is indistinguishable from a member ignoring you). |
| R8 | Readiness + queue isolation under RLS | ✅ VERIFIED on main | `scripts/rls/isolation.sql`: **125 checks, 0 FAIL, 153 migrations applied, 0 failed** on `2b9444b`. Re-run post-merge, not inherited from the PR runs. |
| R12 | The operator-card spec is in git, canonical and undated | ✅ DONE (#154) | `ICE_OPERATOR_CARD_SPEC.md`, "Living document. Do not date the filename." §5.1 is the emergency-contact state contract verbatim. The four `ICE_*_2026-09-02.md` files were Claude-project docs and had never been in git — reporting them absent was correct. |
| R13 | Call actions use `tel:` where spec §3 requires Twilio | 🔴 **BROKEN on main — tracked, not fixed** | **Issue #156.** 47 real call-action sites; **7 on the live-alert card**, two of them `tel:112`. Worst: `SOSActionPanel.tsx:494` sets `emergency_services_called` **on click, not on connection** — the incident record says 112 was called because somebody clicked. Also `window.open(..., "_self")` navigates the operator off the alert screen. Human gate (G1). |

### Post-merge verification — the merge commit is not what the PR runs tested

`#155` landed via a hand-resolved `Merge branch 'main' into …admin-queue` (`68662ad`). `CLAUDE.md`
names that exact commit shape as where both production outages were created, and
`scripts/rls/isolation.sql` was the interleaved file. So it was re-checked on `main` rather than
trusted:

| Check | Result |
|---|---|
| Every assertion from #153-as-authored present on `main` | **yes** — set difference empty |
| Every assertion from #155-as-authored present on `main` | **yes** — set difference empty |
| Duplicate check names (the "keep both sides" signature) | **none** |
| Conflict markers in `isolation.sql`, `src/`, `supabase/` | **none** |
| Duplicate readiness migration files | **none** — exactly 1 |
| Harness on `2b9444b` | **125 PASS, 0 FAIL**, 153 applied, 0 failed |

**All three queue mutations re-proven on `main`**, because a rebased assertion that has not been
made to fail has not been re-proven:

| Mutation | Went red |
|---|---|
| `security_invoker = off` | **all 6** queue negatives (member / other-member / partner / carer / role-less / own-row-only), plus 2 from the R6 block |
| readiness forced always-**true** | "a member with ZERO contacts always appears", "staff see the zero-contact paid member", "readiness is FALSE with zero contacts" |
| readiness forced always-**false** | "a member with ONE contact never appears", "empties on insert", "readiness is TRUE with one contact", + 3 more |

Restored after each: 125 PASS, 0 FAIL, clean tree.

### Not asserted

- **No browser click-through** of the operator card. R5 is proven by a rendering test, not by a
  human looking at a live SOS.
- **No end-to-end SOS drill** against a real device or a real Twilio call. The sub-second latency
  target is untouched and unverified by this work.
- **The queue's preventive value is unproven in use.** Nobody has worked it and no member has been
  phoned off the back of it. It is proven to list the right people, in the right order, and to
  refuse to report a failed read as an empty queue. That it actually gets worked is a human fact,
  not a test.
- **R13 means the operator card still cannot tell whether a call connected**, including to 112.
  Readiness is now honest about *who can be called*; the card is still not honest about *whether
  anyone was*.

### Retracted

**The 2026-09-04 "main is red" entries are retracted.** An earlier revision claimed `main` carried
78 type errors and that the RLS harness could not run. Both came from a **stale local `main` ref at
`17960fc`** rather than `origin/main`. The figures are real for `17960fc` and false for `main`.

The sequence matters, because the second mistake was worse than the first:

1. The first measurement — on the checked-out branch, which *was* current — reported **0 type
   errors** and a clean **141/0** harness run. Both were correct.
2. Later measurements ran after `git checkout -b <new> main`, resolving to the stale `17960fc`.
   They reported 78 errors and a failing rebrand migration. True of `17960fc`, false of `main`.
3. On the strength of step 2 I **retracted the correct step-1 finding**, wrote "main IS red" into
   the design doc, and added a false merge blocker to four PR descriptions.

Two tells were in my own output and both were missed: `git log --oneline main..HEAD` listed
`1dc74e7` (the typecheck-green merge) among commits *not in* `main`, which I read as "the branch
equals main"; and I borrowed a migration fix from `fix/rebrand-migration-jsonb` without asking why
a branch I needed to borrow from had already merged as #137.

**The lesson is procedural:** `git fetch --all` before measuring, and never treat a local `main`
as authoritative without checking it against `origin/main`. Recorded rather than edited away (G5).

## Partner journey (2026-08-11, consolidated 2026-09-05) — traced end to end

> Full reasoning and the current single path: **`PARTNER_JOURNEY.md`**.
>
> **2026-09-05 — the two-path split is closed.** Partners have ONE way in: full
> registration at `/partner/join`. `/partner` is a permanent redirect (router
> `<Navigate replace>` + a 308 in `vercel.json`); `PartnerOnboarding` and its
> locale namespace are deleted; `partner-apply` is still deployed but called by
> nothing. The admin conversion path (`ConvertApplicationDialog`,
> `partner-admin-invite`) is KEPT — production may hold pending applications
> (`PENDING_FOR_LEE.md` S7). Proven by `src/test/partnerSingleEntry.test.ts`.
>
> ⚠️ **Everything marked "fix open" below is in an OPEN PR and is NOT on `main`.** The
> live behaviour is still the broken behaviour until those merge. Nothing here is
> marked working on the strength of a PR existing.

### What the production trace established

| # | Item | Status | Evidence |
|---|---|---|---|
| P1 | Deployed bundle called a placeholder Supabase host, so **no client call reached the backend** | ✅ FIXED (live) | Lee fixed `VITE_SUPABASE_URL` in Vercel. `vite.config.ts` now throws instead of substituting a placeholder — merged in #100. |
| P2 | `partner-register` rejected the password; browser showed only `Edge Function returned a non-2xx status code` | 🔴 BROKEN on main · fix open in **#105** (C1) | `_shared/validation.ts` returns `{error, details:["password: Invalid"]}`; the helper dropped `details`. Tests in #105 fail against the pre-fix helper. |
| P3 | Client password rule was `min(8)`; server also requires upper + lower + digit | 🔴 BROKEN on main · fix open in **#106** (C2) | Parity test imports the REAL server schema and runs 35 adversarial inputs; reverting the client rule fails 5. |
| P4 | Terms acceptance was UI state only — never sent, validated or stored | 🔴 BROKEN on main · fix open in **#107** (C3) | No `accept_terms` in the server schema, no column on `partners`. Migration + server enforcement verified against real PostgreSQL 16, including rollback. |
| P5 | `/partner/login` unreachable from the public site | 🔴 BROKEN on main · fix open in **#108** (C5) | Nav and landing footer both pointed only at `/partner`. Reverting both pages fails 4 of 7 tests. |
| P6 | The nav reaches `/partner` → `partner-apply`, never `/partner/join` | ✅ **FIXED 2026-09-05** — the application path is retired; every public link points at `/partner/join` and `/partner` permanently redirects there | `src/test/partnerSingleEntry.test.ts` (15 assertions): route present and renders `<Navigate replace>`, `vercel.json` 308, no wildcard that would loop, header + both landing links, a walk of `src/` finds no remaining `/partner` complete-path link, the page is deleted, nothing invokes `partner-apply`, the locale namespace is gone, and the admin convert path still exists. **The zero-invocation count was NOT caused by this**: `partner-apply` read zero too, both from the placeholder `VITE_SUPABASE_URL`. |

### Verified by execution, not inspection

| Claim | How it was proven |
|---|---|
| `partners` has **no INSERT policy**; no anon/authenticated client can insert | Real PostgreSQL 16 with `authenticated`'s grants applied: `new row violates row-level security policy`. `SELECT` returns only own row; `UPDATE` of another partner's row affects 0 rows. |
| `partner-register`'s insert is valid against the migrated schema | Rebuilt `partners` from the migrations and ran the exact payload — succeeds. All 24 inserted columns exist among the 37 migrated. |
| `get_user_role_info` gates `is_partner` on `status='active'` | Ran the migration's own function body: `pending` → `is_partner:false, partner_id:null`; `active` → `true` + the row's id. |
| The terms migration is reversible | Applied, wrote a record, re-applied (no-op), rolled back: both columns gone, **all partner rows preserved**, index dropped with the column. |

### Open gaps — verified, unfixed, not in any PR

| # | Gap | Why it is left |
|---|---|---|
| P7 | `PartnerLogin` blocks only `pending`/`suspended` (denylist); `get_user_role_info` grants only `active` (allowlist) | Same asymmetry as #102. No status outside the enum exists today, so it is latent. Needs prod's distinct values checked first. |
| P8 | "No partner account found for this email" — the lookup is by `user_id`, not email | Every legacy `partner-apply` row has no `user_id`, so this is exactly what an application-path partner sees — and since P6, trying to log in is the only way one can arrive. Wording fix is trivial. |
| **P13** | **`/partner/join` is hardcoded English end to end** — 970 lines, two `t()` calls, no `useTranslation` | 🔴 **NEW SEVERITY as of P6's fix.** It was survivable while the nav reached the fully-translated `/partner`; it is now the **sole** public partner entry point, against LAUNCH_SCOPE §6 (EN + ES + NL, full coverage at launch). Translating a 970-line wizard is its own work package. Deliberately NOT papered over with two translated strings — see `PARTNER_JOURNEY.md` §3.1 and the comment in `partnerLoginReachable.test.ts`. |
| P9 | `preferred_language` is `en`/`es` only — CHECK constraint, server enum and form all agree | Consistent, so parity holds, but Dutch is consistently **rejected**, against LAUNCH_SCOPE §6. Needs a migration + scope decision; not bundled into a parity PR. |
| P10 | `/partner-dashboard` is hard-blocked on first arrival by `AgreementRequiredModal` (`open={true}`, non-dismissible) | Intended, but the first-run experience has never been click-tested. |
| P11 | Verification email runs on interim Gmail SMTP | Already a `LAUNCH_CHECKLIST.md` hard blocker. A silent delivery failure is indistinguishable from a partner who never bothered. |
| P12 | `partner-apply` writes no `user_id` and issues no verification token | An application is a lead and terminal without admin action. No longer reachable from the public site (P6), but the function stays deployed and the admin conversion path stays wired, because production may hold pending rows — `PENDING_FOR_LEE.md` S7 carries the count query that decides whether they can all go. |

### Retracted

**The schema-mismatch hypothesis in #104 was wrong.** `partners` has all 37 columns on
prod and the insert was never reached — `partner-register` had zero invocations. The
column-contract test from #104 is still worth keeping as a guard, but it was not the
explanation. Recorded here rather than left as a retracted theory with no correction
attached (G5).

### Not asserted

- No browser click-through of the partner journey was performed. Every claim above is
  either a test, a real-PostgreSQL run, or a source reading — never "looks right".
- The **live** partner journey is unverified after these PRs, because none is merged.
- `partner-apply`'s invocation count on prod is unknown, so whether the application
  path itself ever reached the backend has not been confirmed.
- The consolidation of 2026-09-05 **was** walked in a real browser, once: Chromium
  against the production build served by `vite preview` — `/partner` lands on
  `/partner/join` and renders "Become an ICE Alarm España Partner". That is the
  router redirect. **The 308 in `vercel.json` has NOT been observed on a deployed
  URL** — `vite preview` does not apply Vercel's redirect rules, so the HTTP status
  a search engine will see is asserted from config, not measured. One `curl -I`
  against the deployed `/partner` closes it.
- **The count of pending applications on prod is unknown** — that is exactly what
  `PENDING_FOR_LEE.md` S7 asks Lee to run.

## Staff credential reset tooling (2026-08-11)

> Landed on a **separate branch/PR** (`…-staff-login-reset`). Recorded here because
> `STATE.md` is the single home for status; the code is not in the docs PR.

| # | Item | Status | Evidence |
|---|---|---|---|
| C1 | `scripts/reset-staff-logins.ts` | ✅ VERIFIED | One-shot reset of staff email+password. Env-only config; account list from a gitignored file or `STAFF_LOGINS_CONFIG`. No address, password or key committed. Dry-run default, `--apply` to write. |
| C2 | Project-ref guard | ✅ VERIFIED — proven negatively | Refuses to run when the service key's `ref` claim ≠ the `SUPABASE_URL` host. Also refuses an opaque `sb_secret_*` key, since the check then cannot be performed. Test feeds a mismatched pair and asserts refusal; CLI exits 1. This is the failure that broke staff login. |
| C3 | auth ↔ staff lock-step | ✅ VERIFIED | All accounts pre-flighted against `public.staff` before the first write, so an unresolvable account aborts with the DB untouched. If the staff update fails after auth succeeded, raises `DivergenceError` and halts rather than diverging further accounts. |
| C4 | Audit trail | ✅ VERIFIED | Each change inserts an `activity_logs` row recording which fields changed. Password never printed, never stored; emails masked unless `--unmask`. |
| C5 | Dry-run diff | ✅ VERIFIED | End-to-end test runs `main()` against a stub client: asserts the full per-account diff prints and that the **only** DB calls are the two staff lookups — no write of any kind. |
| C6 | `20260811120000_second_admin_staff_row.sql` | ✅ VERIFIED | Creates/promotes one staff row to `role='admin'`, `status='active'`. Never writes the GENERATED `is_active` (the 20260617130000 bug). Identity supplied at apply time via a setting, so nothing real is committed. Guarded no-op when unset, so `db push` still succeeds on CI. |
| C7 | Migration reversibility | ✅ VERIFIED — executed | Exercised against real PostgreSQL 16 across 8 paths: no-op, missing auth user (raises, no change), create, idempotent re-run, promote, rollback of the created row, rollback of the promote restoring `call_centre`/`pending` exactly, and a direct `is_active` write confirming it raises. Prior role/status captured in `activity_logs` so the header's rollback is exact. |
| C8 | Tests | ✅ VERIFIED | 53 new tests pass; full suite 810 passed / 1 pre-existing skip. `scripts/` typechecks strict and lints clean. |

## Stage 0 — Prod backend verification (2026-07-22, LAUNCH_SCOPE.md §0)

> Read-only pass on `crpsuhoixfdhjugprbuc`. **Nothing on prod was changed.** Statuses:
> ✅ VERIFIED · ⚠️ DRIFT · ⛔ BLOCKED-needs-Lee.

> **Items 1–4 COMPLETED 2026-07-22** by a parallel tokened session (read-only on prod);
> findings folded in below. Remediation is **Stage 0b** — plan `STAGE_0B_PLAN.md` (PR #14),
> repo fix PR #16 — human-gated, not yet run on prod.

| # | Item | Status | Finding |
|---|---|---|---|
| 1 | Linked project ref = `crpsuhoixfdhjugprbuc` | ✅ VERIFIED | Confirmed: prod is `crpsuhoixfdhjugprbuc` (tokened session, read-only). |
| 2 | Local vs remote migration diff (`supabase migration list`) | ✅ VERIFIED — **DRIFT** | **5 migrations unapplied on prod** (matches `STAGE_0B_PLAN.md` §2): `bootstrap_first_admin`, `pricing_source`, `fix_bootstrap_first_admin_is_active`, `sos_escalation_cron`, `deactivate_non_pendant_products`. `pricing_source` unapplied ⇒ Prompt 4 review is gated on the Stage-0b push. |
| 3 | Deployed edge functions vs repo dirs | ✅ VERIFIED — **DRIFT** | **2 functions never deployed**; **all 89 deployed functions are stale from a single 2026-04-20 deploy.** (Reconciles the 2026-06-17 "cutover deploy" LEARN entry: that deploy targeted the now-**CANCELLED** `cfwnrcogikjycjcobsay`, not current prod — so current prod hasn't been redeployed since 2026-04-20.) Remediation: full redeploy + CI pipeline (PR #16 / plan §3). |
| 4 | Postgres error-spike root cause | ✅ VERIFIED | **~721 errors/day = the two APPLIED GUC crons** throwing "unrecognized configuration parameter": `ev07b-offline-monitor` (`*/2 * * * *` ⇒ 720/day) + `shift-daily-reminders` (daily ⇒ 1/day) = **721/day**. Root cause (the un-guarded `current_setting('app.settings.*')`) **confirmed empirically.** Fix in PR #16 (Vault key + hardcoded public URL + missing-secret guard). *(The unapplied `sos_escalation_cron`'s 2 crons are not yet on prod, so they don't contribute to the spike — but carry the same bug, fixed in place in PR #16.)* |
| 5 | `.env.example` completeness vs `Deno.env.get` / `import.meta.env` | ✅ VERIFIED + FIXED | **Frontend** (`import.meta.env.VITE_*`): all 13 referenced keys already present — complete. **Edge functions** (`Deno.env.get`): 25 distinct keys referenced; `.env.example` documented **none** of the server secrets (only VITE_*). **Fixed:** added an "Edge Function secrets" section (SITE_URL, WEBHOOK_SECRET, Resend/Gmail, 9× Twilio, 3× EV07B, Google OAuth, RENDER_WORKER_URL, LOVABLE_API_KEY). Excluded by design: `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` (runtime auto-injected) and Stripe/Mollie keys (stored in `system_settings`, entered via Admin → Settings, not env). |

**✅ Stage 0 diagnosis COMPLETE — remediation pending (Stage 0b, human-gated).** The prod
execution (apply 5 migrations, redeploy all functions, fix the crons, verify) runs from the
**tokened terminal session**, or from this sandbox once `SUPABASE_ACCESS_TOKEN` is injected
here (it is **not** present in this sandbox as of 2026-07-22). Ordered steps + verification:
`STAGE_0B_PLAN.md`; repo fix (cron + deploy CI): PR #16.

### Stage 0b — COMPLETE ✅ (2026-07-22, two prod pushes, tokened session)

> **Evidence discipline (GOALS G5):** **Code-verified** = provable from this repo.
> **Runtime-verified** = confirmed against prod `cron.job_run_details` by Lee's tokened
> run (2026-07-22 ~17:47 UTC). All Stage-0b lines below are now one or the other — Stage 0b
> is **closed**; the only open item is the 24h clean-run clock (re-check 2026-07-23).

- **Migrations applied — reported COMPLETE.** All 5 Stage-0 drift migrations plus, in a
  **second push**, the 2 SOS cron migrations (`20260716120000_sos_escalation_cron.sql`)
  that the first push missed.
- **Functions deployed — reported COMPLETE:** 91 edge functions deployed (clears the
  "all stale from 2026-04-20" drift; the deploy also now runs in CI via
  `deploy-functions.yml`).
- **Cron auth pattern — CODE-VERIFIED (definitive).** All four scheduled jobs, in their
  final applied state, post via the **Vault pattern** (`vault.decrypted_secrets` →
  `service_role_key`, hardcoded public URL `crpsuhoixfdhjugprbuc`, `RAISE WARNING`+`RETURN`
  guard if the secret is missing). **No live cron code references `current_setting('app.settings.*')`**
  — that string survives only in explanatory comments (verified by grep across
  `supabase/migrations/`). Job-by-job:
  | Cron | Cadence | Scheduled by | Auth |
  |---|---|---|---|
  | `sos-escalation-runner` | `* * * * *` | `20260716120000_sos_escalation_cron.sql` | Vault ✓ |
  | `staff-shift-monitor` | `*/2 * * * *` | `20260716120000_sos_escalation_cron.sql` | Vault ✓ |
  | `ev07b-offline-monitor` | `*/2 * * * *` | re-scheduled by `20260723120000_fix_cron_url_and_auth.sql` | Vault ✓ |
  | `shift-daily-reminders` | daily | re-scheduled by `20260723120000_fix_cron_url_and_auth.sql` | Vault ✓ |
  This **answers the item-1 question directly**: `sos_escalation_cron` was written with the
  Vault pattern from the start (never the `app.settings` GUC), so the PR #16 Vault fix
  covers it. The old `app.settings` definitions of `ev07b-offline-monitor` /
  `shift-daily-reminders` are superseded (same jobname re-scheduled) by the corrective
  migration — so the ~721/day "unrecognized configuration parameter" spike is **eliminated
  by design**.
- **Crons active + firing — ✅ RUNTIME-VERIFIED (2026-07-22 ~17:47 UTC, Lee's tokened run).**
  `cron.job_run_details` over the last 10 minutes shows **all 4 jobs `status=succeeded`**
  with **no `app.settings` error** (the `return_message`/`msg` column shows the `DO ...`
  block succeeding). Observed firing at cadence: `sos-escalation-runner` every 1 min,
  `ev07b-offline-monitor` every 2 min, `staff-shift-monitor` firing, `shift-daily-reminders`
  scheduled daily. This is the runtime confirmation that matches the code-verified Vault
  config above.
- **~721/day Postgres error spike — ✅ RESOLVED.** The "unrecognized configuration parameter
  `app.settings.*`" errors (720/day from `ev07b-offline-monitor` @ */2 + 1/day from
  `shift-daily-reminders`) are gone: those jobs now run the Vault `DO` block and succeed.
  Root cause (Stage-0 item 4) → fix (PR #16 + corrective migration) → prod confirmation now
  all line up.
- **24h clean-run clock — RUNNING (started 2026-07-22 ~17:47 UTC).** Cron config + first-10-min
  runtime both green ⇒ **GO**. The only remaining action is the **T+24h confirmation
  (~2026-07-23)** that the clean run held for a full day; re-check `cron.job_run_details` +
  error count then and tick the launch-checklist line. (This sandbox can't watch prod
  directly — no prod SQL access, outbound blocked — so the T+24h check is Lee's, or a
  tokened session's.)

**➡️ Stage 0b is CLOSED.** Migrations applied, 91 functions deployed, all 4 crons succeeding
with zero `app.settings` errors. Outstanding: 24h-clock confirmation (2026-07-23) and the
separate favicon redeploy/cache-purge (deploy-side, tracked under Content & brand).

### Favicon "old ICE icon on prod" — root cause = STALE DEPLOY / CDN cache (2026-07-22)

Reported: production serves the old icon at `/favicon.ico` even loaded directly (not a
browser cache). **Investigated repo + build side (could not fetch the live site — the
sandbox network policy 403s outbound to `*.vercel.app`).** Findings:

- **Repo and build output are CORRECT.** `dist/` is byte-identical to `public/` for every
  icon (sha256 MATCH on favicon.ico/16/32/48, icon-192/512, apple-touch); the built
  `favicon.ico` is the ICE Alarm España "v" mark (`sha256 d8e3315f…`, 5687 B). `main`'s
  `index.html` has the correct `<link rel="icon">` set (#23) and **zero** references to the
  cancelled project. So nothing in git or the build is the old ICE image.
- **Therefore the wrong file is introduced at deploy/serve time**, consistent with the
  Stage-0 finding that prod hadn't been redeployed since **2026-04-20** (pre-rebrand;
  the rebrand landed in `b805825`). Same stale-deploy story as the broken sign-in.
- **Fix (Lee's side — the real remedy):** redeploy current `main` to Vercel, then purge the
  Vercel edge cache for `/favicon.ico` and the icon paths (favicon.ico is served from a fixed
  path and CDNs pin it hard). **Diff to confirm:** `curl -s https://<prod-url>/favicon.ico | sha256sum`
  must equal `d8e3315f327b38a58f59ecfd5ac6521455368adf7c35e5ccb8dc08695d60d4d1`. If it
  differs, the deploy is still stale; if it matches, it was edge cache.
- **Repo hardening (this branch):** `vercel.json` now sets a short, must-revalidate
  `Cache-Control` on the icon paths so a future icon swap can't be pinned stale by the CDN.

### ⚠️ Launch domain & email — NOT verified (2026-07-22)

The launch domain **`icealarm.es` is owned by a known partner**. Attaching it to Vercel +
DNS + email verification (SPF/DKIM/DMARC, Resend/Gmail domain verification) is a **final,
coordinated go-live step** done with the partner at cutover — not before. The repo uses it in
`public/robots.txt` (sitemap) and the `auth-email-hook` sender domain as the *intended* value;
until cutover **email sending from `@icealarm.es` remains unverified** and **development
continues on the `*.vercel.app` URL**. Tracked as a HARD launch blocker in `LAUNCH_CHECKLIST.md`.

---

## SOS/alerts safety reconciliation — STAGE_SOS_FIX.md (status 2026-07-23)

> The "two ownership paths" defect class (queue wrote `claimed_by` unguarded; SOS page wrote
> `accepted_by_staff_id` guarded — the two surfaces could disagree about who owns a live SOS)
> is being retired WP by WP. Every WP ships with a single-write-path source-scan invariant,
> race tests, and a truthful-UI check. **All SOS-path merges are human-gated (Lee, live drill).**

| WP | What | State | Proof |
|---|---|---|---|
| WP-A unified ownership | One guarded write path (`src/lib/alertOwnership.ts`, canonical `accepted_by_staff_id`, legacy mirror kept for SLA/history readers); queue claim now lands on the SOS page as active | ✅ **MERGED** #35 | `alertOwnership.test.ts` (9): write-path, shared-state derivation, 2-operator race, source-scan invariant |
| SOS drill | Admin-only `sos-drill` fn + dashboard controls: level-5 ladder-inert drill alert (contact-less internal member, no outbound HTTP), auto cleanup — lets Lee exercise the live path safely | ✅ **MERGED** #37 | `sosDrill.test.ts` (9): ladder-inert proof vs runner source, no-outbound scan, admin-only |
| WP-B single resolve path | Every resolve goes through `sos-alert-resolve` (now alert-type-aware; notes mandatory for SOS; false-alarm flag; Isabella log + contact SMS gated on real SOS) via `src/lib/alertResolution.ts` | ✅ **MERGED** #36 | `alertResolution.test.ts` (10) incl. source-scan: no direct resolved-status writes |
| WP-C real escalation | `sos-alert-escalate` fn: status + `alert_escalations` audit row (`escalated_by`) + real admin notify; **toast says "Admin has been notified" only after a confirmed send** (was a hardcoded lie) | 🟡 **PR #39 open — GATED** | `alertEscalation.test.ts` (11): notified never invented, table-aware source scan, runner harmless-slot proof |
| WP-D emergency button | Dead "Call Emergency Services" button → real `tel:112` link with the number visibly rendered (Lee's decision) | 🟡 **PR #40 open — GATED, stacked on #39** | `emergencyButton.test.ts` (3) |
| WP-E/F/G (queue checkboxes, small defects, dead SOSTakeoverScreen) | Not started | ⬜ | — |

**Found & flagged during this work (separate, gated):**
- 🔥 **Prod blocker:** `/complete-registration` fails RLS on a client-side `members` INSERT (correctly
  denied by design — no member INSERT policy exists). Fix = server-side linking fn, **zero policy
  changes** — **PR #38 open**. `completeRegistration.test.ts` (11) locks the security properties.
- 🔴 Partner `ResidentialDashboard` inserts members client-side — same bug class, pinned as
  known-broken by the same test; needs its own gated WP.
- Later-fix flags recorded in STAGE_SOS_FIX.md: member hard-DELETE → soft-delete/admin-only;
  SubscriptionTab client-side status writes → server-side.

**Call-centre upgrade buckets (non-gated, 2026-07-23):** #41 (draft — dashboard reorder
members→devices→personal + white-on-white badge fixes, awaiting visual sign-off), #42 (i18n:
72 keys × en/es/nl, removes hardcoded English from Messages/Leads/Members/holiday+cover toasts),
#43 (stacked on #42 — tickets full lifecycle on call-centre, shift-note edit/delete/realtime,
messages unassign `""`→`null` bug; `callCentreCrud.test.ts` 11 tests).

---

## 0. Full suite results (gates re-run 2026-07-16 on `chore/lint-zero-and-test-hygiene`)

| Gate | Result | Evidence |
|---|---|---|
| **Typecheck** (`tsc --noEmit`) | ✅ **0 errors** | exit 0 |
| **Lint** (`eslint .`) | ✅ **0 errors** (62 warnings) | Cleanup PR `chore/lint-zero-and-test-hygiene` fixed all 345 errors (318 `no-explicit-any` + 27 misc), type-only, verified by tsc 0 + suite green + build green. Remaining 62 are pre-existing `react-hooks/exhaustive-deps` + `react-refresh` **warnings** (deferred — fixing exhaustive-deps changes dependency arrays = a behavior change, notably on the SOS-path `useAlerts` effect). `render-worker` (separate package) excluded from root lint. |
| **Build** (`vite build`) | ✅ **succeeds** | `✓ built in ~1m20s`; only the >600 kB chunk-size warning. |
| **Tests** (`vitest run`) | ✅ **all green** | 20/20 files, 362 tests pass. `crmEvents.test.ts` load failure (`supabaseUrl is required`) FIXED via a dummy Supabase env in `vitest.config.ts` (test-only, non-secret) — referral logic now proven. |

**Test surface reality:** 23 Vitest files in `src/test/`. Still **zero** RLS/isolation tests and **zero** Playwright/E2E harness. The SOS escalation ladder now has a suite-level E2E encoding (`sosEscalation.e2e.test.ts`) plus edge-logic tests (`escalationLoop.test.ts`, `shiftTime.test.ts`) that exercise shared edge modules under vitest — but the mandated Playwright E2E paths (checkout→activation, SOS→operator UI) and the RLS-isolation/webhook-contract suites still have no corresponding files.

> **CORRECTION 2026-08-13 — "zero RLS/isolation tests" above is no longer true.**
> `scripts/rls/run.sh` builds a throwaway PostgreSQL, applies the Supabase-compatible
> scaffolding (`scripts/rls/bootstrap.sql`) and then the **real** migration set, and
> runs 28 cross-tenant checks (`scripts/rls/isolation.sql`). It runs on every PR via
> the `RLS Isolation` workflow — a stock `postgres:16` service, no Supabase project,
> no ephemeral cluster, because RLS is a pure PostgreSQL feature.
>
> Established by that run, on the real schema: **112 tables in `public`, all 112 with
> RLS enabled, 277 policies.** Covered: member↔member (SELECT/UPDATE/DELETE), PHI
> (`medical_information`, `emergency_contacts`), partner↔partner, partner→member,
> anonymous, a signed-in user with no rows, golden rule 3 (a call-centre operator
> cannot escalate their own role — the `staff_self_update_guard` trigger fires) and
> golden rule 4 (a member cannot move their own `subscriptions.status` or
> `plan_type`).
>
> **It is proven able to fail**, not merely green: adding a single `USING (true)`
> SELECT policy to `members` flips the relevant checks to FAIL and exits non-zero.
>
> Still true: the two mandated **E2E** paths (checkout→activation, SOS→operator) and
> the **webhook contract** tests remain owed. `webhook_events` is RLS-on with no
> policy — deny-all, which is correct for a service-role-only table, and is declared
> as an intentional exception rather than silently skipped.

> **UPDATE 2026-08-14 — G4 consent scoping now exists and is tested. NOT MERGED.**
> `PRELAUNCH_AUDIT.md` recorded G4 ("family sees only what the member has consented
> to share") as **not met, with nothing to test** — there was no family carer in the
> schema at all. Design: `CONSENT_MODEL.md` — **merged to `main` 2026-08-14** (#134).
> Implementation: `20260814140000_care_access_grants.sql` — **open PR (#135), behind
> the human gate on RLS policies**. So the model is agreed and on `main`; the
> enforcement is not, and nothing below is live in the database yet.
>
> What the branch establishes, by execution on real PostgreSQL: **137 migrations
> applied, 0 failed, 77 isolation checks green** (up from 29). The consent section
> is negative-first — a carer granted `alerts` over member A is proven **unable** to
> read that member's `medical_information`, `devices`, `emergency_contacts`,
> `subscriptions`, or `public.members` itself; unable to read member B's alerts;
> unable to write anything anywhere; and unable to grant themselves more. Revocation
> is asserted **in the same run**, microseconds after the revoking statement, and is
> per-category.
>
> **Proven able to fail, by mutation, not assumed:** deleting `AND g.revoked_at IS
> NULL` from `has_care_consent` turns the immediacy check red; deleting `AND
> g.category = _category` turns five checks red. Both were run, both went red, and
> the migration was restored byte-identical.
>
> **What is honestly NOT closed by this work:**
> - G4's *"every access is auditable"* is **partially** met. The grant lifecycle is
>   fully auditable — every grant and revocation is a durable row with a timestamp
>   and a named actor, and no client can delete one. **Per-read logging does not
>   exist** and is not built (`CONSENT_MODEL.md` §8).
> - There is **no family portal UI**, no carer invite flow, and no carer account
>   claim. The database can enforce consent; nothing yet renders it. That order is
>   deliberate.
> - A `location` grant currently exposes the whole `devices` row including `imei`
>   and `sim_phone_number`, because Postgres cannot column-scope while staff,
>   members and carers all share the `authenticated` role (`CONSENT_MODEL.md` §3.2).
> - **Consent on behalf of an adult with diminished capacity is unresolved and
>   deliberately unimplemented.** `consent_basis` has exactly two values and neither
>   is a legal representative; the isolation suite fails if a third is added. Open
>   with a Spanish data protection lawyer (`CONSENT_MODEL.md` §7). Until it returns,
>   **a member who cannot consent personally cannot have a carer granted access.**

> **CORRECTION 2026-08-11 — "zero Playwright/E2E harness" above is out of date.** Playwright
> landed 2026-07-22: `playwright.config.ts`, the `Page Audit` CI workflow, and
> `e2e/public.spec.ts` (14 public routes × 7 checks). This PR adds the first
> **authenticated** journey, `e2e/partnerJourney.spec.ts`, driving register → verify →
> log in → dashboard against the production bundle in real Chromium.
>
> What remains true, stated precisely so this does not rot again:
> - The journey harness stubs **Supabase's HTTP surface** (`e2e/helpers/supabaseStub.ts`).
>   It proves the client journey and the request contract. It does **not** prove a
>   migration, an RLS policy, a DB constraint, GoTrue's real behaviour, or email delivery.
>   A full-stack run needs `supabase start`, i.e. Docker.
> - The **two mandated E2E paths are still owed**: checkout→activation and SOS→operator.
>   The partner journey is neither of them.
> - **RLS isolation tests remain at zero** — still the single biggest gap (§3).
> - The `Page Audit` job is **RED on `main`** at `ed290ec`, on the `/` and `/pricing`
>   dead-button assertions ("Monthly"/"Annual"). Not caused by this work; see §3.

> **Two stacked PRs.** The escalation safety fix is a **tiny 11-file PR (PR-B)** on top of a
> mechanical cleanup PR (**PR-A** `chore: repo-wide lint + type + test-env cleanup` — `no-explicit-any`
> typing, `crmEvents`/`supabaseUrl` test-env, lint config; no escalation logic). **Merge order: PR-A
> first, then PR-B.** Rebased on PR-A, PR-B is green by itself: **typecheck 0 · lint 0 errors
> (62 pre-existing warnings) · build green · 384 tests pass / 1 skipped**. The escalation fix adds
> zero lint errors of its own.

---

## 1. Safety-critical path — SOS (EV-07B → operator)

**Verdict: real, non-mocked code end-to-end; proven only at the ingress-auth layer; two concrete defects. Fails golden rule #8 (SOS "always has an end-to-end test") — no such test exists.**

| Stage | Class | Evidence |
|---|---|---|
| Pendant → `gps-gateway` (Node GT06 TCP bridge) | 🟡 | Real: `gps-gateway/src/{server,gt06-parser,forwarder}.js` (parses `0x01→sos`, `0x03→fall`; HMAC-signs POST to `ev07b-sos-alert`). Packaged (Dockerfile) but nothing in-repo deploys/tests it. |
| `ev07b-sos-alert` edge fn → `alerts` insert | 🟡 | Real: authenticates ingress, dedups 5-min, **writes `alerts` row `status:"incoming"`** (`ev07b-sos-alert/index.ts:167-182`), fans out to notify fns. `verify_jwt=false` (`config.toml:15`). No test. |
| Ingress auth (HMAC / api-key transition) | ✅ | `src/test/ev07bAuth.test.ts` (9) + `src/test/hmac.test.ts` (8) — **17 pass**. Tests `_shared/ev07b-auth.ts` + `_shared/hmac.ts` (edge WebCrypto ↔ gateway Node parity). **This is the only proven SOS piece.** |
| HMAC **enforcement** | 🟡 | Permissive: `EV07B_ENFORCE_HMAC` defaults **false** (`ev07b-sos-alert/index.ts:53`) → accepts HMAC **OR** legacy `x-api-key`. Strict mode is off until the flag is set. |
| `emergency-contact-notify` (Twilio SMS) | 🟡 | Real Twilio send (`index.ts:137-166`), logs `alert_communications`. No test. |
| **Auto-escalation runner** (levels 2–5: staff→supervisor→admin→contact voice calls) | ✅ | **VERIFIED WORKING** by `src/test/sosEscalation.e2e.test.ts` (a pendant SOS with no ack reaches every human tier 2→5) + `src/test/escalationLoop.test.ts` (cadence). Now scheduled: `20260716120000_sos_escalation_cron.sql` runs a **per-minute pg_cron wake** that drives an internal sweep loop (`_shared/escalation-loop.ts`, `ESCALATION_TICK_MS=10s`, `MAX_RUNTIME=55s`) → **effective ~10s cadence** meeting the 15/30/45/60/90s ladder (HAZARD 1 resolved without relying on pg_cron sub-minute support). Runner writes a heartbeat + logs structured JSON + fires a LOUD `system.runner_failure` admin alert on any sweep/fatal error (GOALS G2). **Fail-loud calls (GOALS G2):** a rung is marked reached ONLY if a Twilio call actually connected; a failed call records `call_placed=false` on `alert_escalations` and fires a LOUD `escalation.call_failed` admin WhatsApp alert (no longer a silent advance). All-failed tiers bounded-retry then advance (Lee 2026-07-16). Proven by `src/test/escalationOutcome.test.ts` (failed call → alert fired AND not marked reached). |
| **Shift monitor** (night-cover SPOF net) | ✅ | **VERIFIED WORKING** (scheduled `*/2 * * * *` in the same migration; asserted by `sosEscalation.e2e.test.ts`). Also now the **dead-man's-switch** for the escalation runner: alerts LOUD if that runner's heartbeat goes stale (>3 min). |
| Realtime → operator screen | 🟡 | `alerts` in realtime publication (`20260121143325:391`); `src/hooks/useAlerts.ts:338-406` subscribes, plays sound/toast/notification on INSERT. `SOSAlertPage`/`CallCentreDashboard` + `sos-conference-*` all real. No click-through/test proof. |
| **Latency < 1 s (target)** | 🟡/⬜ | **Escalation *cadence* is now measured** (`escalationLoop.test.ts`: sweeps honour the ~10s tick). The **inbound** SOS latency (pendant press → operator-visible alert < 1s) is still **not measured** — there is no timing instrumentation in `ev07b-sos-alert` and no local/deployed harness to time it, so `sosEscalation.e2e.test.ts` keeps that assertion **skipped with a TODO** rather than assert a fabricated number (GOALS G5). Owed follow-up: an ingress-latency probe. |

---

## 2. Money-critical path — Payments (Stripe + Mollie → activation)

**Verdict: full loop wired in code, converging on one correct chokepoint; UNVERIFIED end-to-end (no contract/E2E test); the "webhook-ONLY activation" golden rule is BROKEN in three places.**

| Piece | Class | Evidence |
|---|---|---|
| Charge is **server-authoritative** | ✅ | `submit-registration` recomputes total from DB `pricing_plans`/`pricing_settings`, **fails closed** if unset ("refusing to compute a charge", `index.ts:247-249`). Proven by `pricing.test.ts`, `pricing-calculations.test.ts`, `pricingSource.test.ts` (calc + seed parity). |
| `stripe-webhook` signature verification | 🟡 | Correct in code: `stripe.webhooks.constructEvent(body, sig, secret)` (`index.ts:64`), 400 on failure, idempotency via `webhook_events`. No test exercises it. |
| `mollie-webhook` verification (API re-fetch) | 🟡 | Correct Mollie pattern: re-fetches payment from API rather than trusting POST (`index.ts:112`), idempotency guard. No test. |
| Activation chokepoint `_shared/post-payment.ts` | 🟡 | Both rails → `handleSuccessfulPayment`: order→confirmed, payment→completed, **`members.status='active'`** (`:57-60`), device auto-alloc, notifications. (Activation column is `members.status` enum — **not** a `subscription_tier`.) Complete code, nothing proves it runs. |
| Webhook **contract tests** | 🟢 | `webhookActivationContract.test.ts` (16) drives the REAL `handleSuccessfulPayment` — the function both webhooks call — against a recording Supabase double and asserts the writes: member set `active` filtered by id, order `confirmed`, payment `completed` under the right per-gateway column, device allocated with the `in_stock` guard, `awaiting_stock` written when none is free, and the member still activated when it is. Mutation-proven: removing the activation reddens 6, dropping its `id` filter reddens 3, removing the `in_stock` guard or the `awaiting_stock` write reddens 1 each. **Still owed:** `constructEvent` signature verification, and an end-to-end test-mode purchase (only a human can run that — `PENDING_FOR_LEE.md` §4.1). |
| **Webhook-ONLY invariant** (golden rule #4) | 🔴 | **Broken in 3 places:** (1) `src/components/admin/wizard/PaymentStep.tsx` — comment "Simulate payment", `setTimeout(2000)`, then inserts member `status:"active"` + subscription `active`/`registration_fee_paid:true` **client-side, no Stripe** (routed live at `/admin/members/new`). (2) `src/components/partner/ResidentialDashboard.tsx:92` — inserts active member directly. (3) `submit-registration` trusts client-supplied `testMode:true` (`index.ts:289`) → RPC activates member with no payment (`20260302120000_submit_registration_atomic.sql:474-488`), **without re-checking the server-side test-mode setting** — a public activation bypass. |

---

## 3. Auth / RLS

**Verdict: policy design is correctly restrictive where readable; the weakness is proof, not policy. Tenant isolation is UNVERIFIED — no isolation test exists (violates golden rule #2). AI hard-blocks ARE real in code.**

> Schema reality: **no `user_roles` table** and **no `subscription_tier` column** (CLAUDE.md's nouns don't match the DB). Roles live on `public.staff.role` (enum `app_role`). Findings mapped to real objects.

| Question | Class | Evidence |
|---|---|---|
| Role assignment client-writable? | 🟡 (secure by SQL, untested) | `staff` has only SELECT (`is_staff`) + `"Super admins can manage staff" FOR ALL USING(get_staff_role()= 'super_admin')` (`20260121143325:326-327`) — members/operators have **no write path**, cannot self-escalate. Bootstrap is service-role-only + self-disabling (proven by `bootstrapAdmin.test.ts`, 10 pass). **No test attempts an escalation and asserts denial.** |
| Member change own tier/plan? | 🟡 (secure by SQL, untested) | `subscription_tier` doesn't exist. `subscriptions`: member is **SELECT-only** (`:355`); only write is `"Staff can manage subscriptions" FOR ALL` (`:354`). No member write policy → client cannot change plan/status. No test asserts denial. |
| RLS enabled on every table? | ✅ (by migration grep) | ~112 `ENABLE ROW LEVEL SECURITY` vs ~112 `CREATE TABLE`; none missing. `20260228100000_fix_permissive_rls_policies.sql` closed 6 previously anon-open `USING(true)` policies. (Policy *correctness* still untested.) |
| Cross-tenant isolation tests? | ⬜ | **MISSING — the single biggest gap.** No test asserts member A can't read member B, family/partner scoping, etc. No pgTAP, no negative RLS assertion anywhere. Directly violates golden rule #2 & GOALS "RLS + isolation test on every new table." |
| Clara/Isabella dangerous tools unreachable in code? | ✅ | The named tools (`update_user_role`, `manage_alert`, `admit_resident`, `discharge_resident`, `toggle_user_status`) **appear nowhere** (0 grep hits). `ai-execute-action/index.ts:79-333` is a **closed switch allowlist** of 9 non-destructive actions; `default` throws. `"escalate"` only flips a *conversation*, never touches `alerts`. Proven by `isabellaGate.test.ts` (36) + `verificationGate.test.ts`. |
| Clara "queries as the user" (rule #5)? | 🔴 (deviation) | `ai-execute-action` uses `SUPABASE_SERVICE_ROLE_KEY` (`:16-18`) and relies on an `approved` gate, i.e. it does **not** query as the user. Non-conforming to golden rule #5. |

---

## 4. Feature inventory by domain (classification)

### ✅ VERIFIED WORKING (a passing test proves the named behaviour)
- **Pricing math + server-authoritative total** — `pricing*.test.ts`, `pricingSource.test.ts`.
- **Registration payload** (medical + emergency contacts reach `submit-registration`) — `registrationPayload.test.ts`.
- **Product-interest lead capture** — `productInterest.test.ts`.
- **Device ingress auth (HMAC/api-key)** — `ev07bAuth.test.ts`, `hmac.test.ts`.
- **Isabella gate** (never-gate safety/legal, fail-open, escalate carve-out, trigger→key) — `isabellaGate.test.ts` (36).
- **Verification gate** (outbound never verifies ID, force-escalate after 2 fails) — `verificationGate.test.ts`.
- **First-admin bootstrap guard** (self-disable, fail-closed) — `bootstrapAdmin.test.ts` (10).
- **Route protection** (requireStaff/Admin/Member redirects, admin bypass) — `auth.test.tsx`; in-portal links — `portalPath.test.ts`.
- **Subscription admin actions** (cancel/pause/resume; Stripe drives, Mollie 501) — `billingActions.test.ts`.
- **Cross-cutting utils** — `sanitize.test.ts`, `validation.test.ts`, `sentry.test.ts`, `error-boundary.test.tsx`, `rateLimiter.test.ts`.

### 🔴 BROKEN
- ~~**SOS auto-escalation & shift-monitor** — real code, no cron → never fire automatically~~ **→ RESOLVED (§1):** both scheduled via pg_cron at spec cadence; escalation proven by `sosEscalation.e2e.test.ts`. Also fixed the UTC-vs-Madrid timezone divergence between the two runners (both now use `_shared/shift-time.ts`, DST-correct, proven by `shiftTime.test.ts`). **Behind the human gate — pending Lee's review of the escalation path.**
- **Webhook-only activation** — 3 client-side activation paths (§2).
- **Lint gate** — 345 errors + 62 warnings (§0).
- **`crmEvents.test.ts`** — fails to load (`supabaseUrl required`); referral attribution therefore unproven.
- ~~**AI on Lovable gateway, not Anthropic**~~ **→ RESOLVED for Isabella core (2026-07-24, #52):** `ai-run` runs on the Anthropic API, runtime-verified. Only the archive-candidate growth functions (outreach-*, media-*, …) still reference the gateway (see §6).

### 🟡 UNVERIFIED (code exists; nothing proves it)
- **SOS end-to-end** (device→alert→realtime→operator) and **<1s latency** (§1).
- **Payment activation loop**, both rails (§2).
- **Tenant isolation** for member/family/partner (§3).
- **Member/client dashboard** pages (`/dashboard/*`), **member self-update** fns — no UI/route test.
- **Most Admin pages** (analytics, finance, reports, sla, feedback, audit-log, rota, orders, devices, tickets, messages, notifications) — no tests.
- **Staff/call-centre** shift-monitor, courtesy-calls, invite lifecycle — no tests.
- **Partner portal** (9 routes) + **commission calculation** (`process-commissions`) — no tests (referral test currently broken).
- **Comms/telephony** (all `twilio-*`, `send-email`, inbound webhook) — no dedicated test.
- **Marketing/blog/help** pages — no tests.
- **AI `ai-run` "queries as user"** — untested (and see §3 deviation).

### ⬜ MISSING (expected by plan/CLAUDE.md, not present)
- **Monorepo** (`apps/platform`, `apps/hub`, `packages/{ui,database,ai,config}`, `services/ingestion`) — none exist (see RECONCILE.md).
- **"Clara" assistant on Anthropic** (plan WP7) — the assistant is Isabella on the Lovable gateway.
- ~~**E2E harness** (Playwright/Cypress)~~ **→ EXISTS** since 2026-07-22 (`playwright.config.ts`, `Page Audit` workflow, `e2e/public.spec.ts`), extended 2026-08-11 with the first authenticated journey (`e2e/partnerJourney.spec.ts`, Supabase HTTP stubbed — see the correction in §2). **The two mandated E2E paths are still owed:** checkout→activation and SOS→operator.
- ~~**RLS isolation test suite** (golden rule #2, plan §13)~~ **→ EXISTS 2026-08-13.** `scripts/rls/` + the `RLS Isolation` CI job: real PostgreSQL, the real migration set (134 of 139 applied; the 5 skipped are pg_cron/pg_net scheduling with zero policies), 28 checks. Proven able to fail by mutation — adding one `USING (true)` policy to `members` turns it red.
- **Webhook contract tests** (plan §13).
- **Tool-permission tests** for the 6 hard-blocked tools (they're absent by construction, not asserted by a test).
- **One clean migration set** — reality is 126 accreted migrations (plan §5 wanted "not 83 accreted ones").

---

## 5. Golden-rule / GOALS scorecard (summary)

| Rule | State |
|---|---|
| #1 One Supabase project | ✅ holds |
| #2 RLS + isolation test on every table | 🔴 RLS on; **isolation test MISSING** |
| #3 No client-writable roles/tiers | 🟡 roles/tier not client-writable by policy (untested); tier column doesn't exist |
| #4 Payments activate via webhook only | 🔴 **3 client-side activation paths** |
| #5 Clara queries as the user | 🔴 AI executor uses service role |
| #6 Clara hard-blocked tools unreachable in code | ✅ holds (closed allowlist; tools absent) |
| #7 Clara red-lines (no medical advice, never resolve SOS) | 🟡 escalate can't touch alerts (good); red-lines not test-proven |
| #8 SOS never mocked + always E2E-tested | 🟡 not mocked ✅; **escalation E2E now exists** (`sosEscalation.e2e.test.ts`) ✅; inbound <1s latency still unmeasured 🔴 |
| #9 No secrets in git | ✅ holds (secrets in env/`system_settings`) |
| #10 No new tests skipped / zero-test code | 🔴 vast UNVERIFIED surface; 1 failing suite |
| Bar: typecheck 0 | ✅ | Bar: lint 0 | 🔴 | Bar: proven-not-claimed | 🔴 |

**Bottom line:** the app **builds and type-checks**, and a focused set of safety/gate/pricing/auth-logic units is genuinely proven. But the two paths that *must not break* — **SOS→operator** and **checkout→activation** — have **no end-to-end proof**, tenant **isolation is untested**, and there are **concrete BROKEN items** (unscheduled escalation cron, three webhook-only bypasses, AI on the forbidden Lovable gateway, a failing test suite, a failing lint gate). Treat SOS and Payments as **not production-safe** until their E2E/contract/isolation tests exist and the BROKEN items are fixed under the human gate.

*See `RECONCILE.md` for the Isabella/Clara decision, the scope-creep keep/archive list, and the full plan-vs-reality divergences.*

---

## 6. Next — tracked follow-ups (from the 2026-06-18 governance reconcile)

> Lee's three decisions are applied: **AI = Isabella** (not Clara) · **stay single-app** (monorepo
> target abandoned) · **archive the growth tooling** (YouTube/Facebook/outreach/content/video).
> **Partner/commission portal REVERSED to KEEP/LIVE 2026-07-22 (LAUNCH_SCOPE.md §4)** — it is in
> scope from day one, with **manual commission payouts** for launch. These follow-ups fall out of
> those decisions. **None were done in the docs-only reconcile loop.**

### AI / Isabella
- **Canonical spelling = `Isabella`.** Code is inconsistent — fix `Isabel` → `Isabella` in
  `supabase/functions/ai-run/index.ts:28` (chat system prompt) and
  `src/components/admin/settings/VoiceSettingsSection.tsx:37-38` (voice greeting). Voice handler
  (`isabella-voice-handler:93-94`) already says "Isabella". *(Code change — not this loop.)*
- ✅ **Isabella core → Anthropic API: DONE, RUNTIME-VERIFIED (2026-07-24).** Merged (#52,
  Lee's sign-off), `ANTHROPIC_API_KEY` set on prod, `ai-run` deployed — **Lee confirmed the
  public chat widget answers on the new transport.** The known streaming follow-up is
  now built: **PR #55 (open)** restores SSE streaming — `isabellaStream()` in
  `_shared/anthropic.ts` (SDK `messages.stream`), an opt-in `context.stream === true`
  branch in ai-run's chat path emitting `data: {delta}` / `{done, response}` / `{error:
  "stream_failed"}` frames (non-streaming JSON stays the default for voice/agent and
  non-opted callers), and incremental rendering in the widget via
  `src/lib/isabellaChatStream.ts` + `useAIChat` (falls back to the plain invoke path if
  the stream fails before the first delta; keeps the partial if it drops mid-stream —
  never double-answers). Tool allowlist + isabella-gate + verification-gate untouched;
  `isabellaStreaming.test.ts` (11) + the 13 migration contracts prove it. **Live once
  merged + `ai-run` redeployed** (deploy-lag lesson below applies). Also fixed: the chat
  prompt introduced her as "Isabel" — canonical spelling **Isabella** (2026-06-18 decision)
  now applied in `ai-run` + the voice greeting defaults.
  **Operational lesson (2026-07-24, agreed with Lee):** Prompt text lives inside edge
  functions — a merged prompt change is invisible until `ai-run` is redeployed. The
  2026-07-24 "Isabel" confusion was deploy lag, not a missed occurrence; fixed live after
  merge + redeploy, grep confirms zero bare "Isabel" in the repo. `ai-run`'s three gateway
  calls (chat widget / voice / agent) now go through `_shared/anthropic.ts` — official SDK,
  `claude-opus-4-8` default with `ISABELLA_MODEL` env override, no Lovable dependency
  (`isabellaAnthropic.test.ts`, 13 tests: zero-gateway invariant, single-transport path,
  safety surface byte-identical). **Live once merged + `ANTHROPIC_API_KEY` secret set +
  `ai-run` redeployed.** Root cause of the 2026-07-24 chat outage was the unset
  `LOVABLE_API_KEY` — the migration removes that failure mode. Still owed: rule #5
  (Isabella must "query as the user", not the service role).
- **Lovable-debris containment (2026-07-24, goal item 2).** Audit of all 13 remaining
  Lovable-referencing functions delivered (report in session). Executed so far:
  **PR #61** — dead `shelter-span.lovable.app` fallbacks fixed in `partner-register` +
  `send-member-update-request` (→ `icealarm.es`), `*.lovable.app` CORS origin patterns
  dropped from `_shared/cors.ts`, zero-invoker `outreach-followup-runner` deleted;
  **PR #62 (stacked, AUTH-CRITICAL — review carefully)** — `auth-email-hook` rewritten from
  `@lovable.dev/email-js`+`webhooks-js` onto the standard Supabase send-email hook
  (standardwebhooks + `SEND_EMAIL_HOOK_SECRET`) sending via the shared Gmail SMTP module;
  same templates, cutover steps in the PR. `lovableDebris.test.ts` pins the exact remaining
  Lovable surface: the **9 gateway growth fns** (facebook-publish, generate-ai-image,
  generate-slot-content, media-draft, outreach-enrich-lead, outreach-generate-drafts,
  outreach-topic-insights, rate-outreach-leads, repurpose-content) — recommendation
  ARCHIVE all (admin-only, none cron-scheduled); **awaiting Lee's archive/keep call**
  since the label-only deferral below was his recorded decision.

### Scope — archive candidates (EXECUTED for growth fns 2026-07-24; rest still label-only)
- ✅ **Growth-fn archive EXECUTED (PR, draft pending Lee's visual approval):** the 9
  Lovable-gateway growth fns (facebook-publish, generate-ai-image, generate-slot-content,
  media-draft, outreach-enrich-lead, outreach-generate-drafts, outreach-topic-insights,
  rate-outreach-leads, repurpose-content) + their orchestrator `outreach-pipeline-runner`
  moved to `archive/supabase-functions/` with their UI entry points removed
  (MediaManager AI-draft/AI-image/publish flows; AIOutreach rate/enrich/draft/pipeline
  controls). DB-CRUD features on both pages survive (drafts, approve, metrics, partner
  distribution, strategy CRUD, lead qualify/import, CRM/campaigns/inbox, send-email).
  Boundary pinned by `archivedFunctions.test.ts` (5); Lovable pin in
  `lovableDebris.test.ts` shrinks to `auth-email-hook` (its migration = PR #62/#64).
  Reinstating any fn = `git mv` back + migrate its gateway call to `_shared/anthropic.ts`.
  Follow-up: MediaHelpDialog/OutreachHelpDialog copy still describes the archived AI
  workflows (3-locale help-text revision once Lee confirms the archive is final);
  deployed prod instances are inert but should be deleted at next housekeeping.
- Still label-only (no code moved/deleted): **YouTube**, **video-render**.
- **Partner/commission portal — KEEP / LIVE AT LAUNCH** (~~archive candidate 2026-06-18~~ **reversed
  2026-07-22, LAUNCH_SCOPE.md §4**): live from day one, **manual commission payouts** for launch
  (admin "Mark Paid" + hand-done transfer); automated payouts are phase 2. Verify the commission
  flow end to end (referral → click → attribution → signup → payment → commission → release →
  approve → Mark Paid) before launch.
- **Migration-shrink bonus:** archiving the above removes **most of the 11 non-core functions** on the
  Lovable gateway, reducing the Anthropic migration to **Isabella core** (`ai-run`,
  `ai-execute-action`, `ai-dispatch-events`, `isabella-voice-handler`).

### Critical-path gaps (the real WP targets — see plan §12 reframe)
- **SOS:** ✅ **DONE (pending human gate):** `sos-escalation-runner` + `staff-shift-monitor` scheduled
  via pg_cron at spec cadence (`20260716120000_sos_escalation_cron.sql`); escalation proven by
  `sosEscalation.e2e.test.ts`; UTC/Madrid tz divergence fixed. ⬜ **Still owed:** an **inbound <1s
  latency** probe (the E2E keeps that assertion skipped with a TODO — see §1).
- **Payments:** add webhook contract + checkout→activation E2E; **close the 3 client-side activation
  bypasses** (`PaymentStep.tsx`, `ResidentialDashboard.tsx`, `submit-registration` `testMode`).
- **Auth/RLS:** add the **tenant-isolation test suite** (negative assertions) — golden rule #2.
- **Lint gate:** 345 errors + 62 warnings → 0 (GOALS bar).
- **Failing suite:** fix `src/test/crmEvents.test.ts` (`supabaseUrl required`) so referral logic is proven.
