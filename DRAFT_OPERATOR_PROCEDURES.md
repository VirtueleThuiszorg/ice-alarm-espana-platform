# DRAFT operator procedures — awaiting Lee's sign-off

> **NOTHING HERE IS PUBLISHED.** These are drafts for review only. No row in
> `documentation` has been created or changed. Each procedure below carries the
> source in code it was written from, so you can verify the wording against real
> operations before anything reaches the people who handle emergencies.
>
> Drafted 2026-07-26 against `main` @ `1484714`. **Revision 2** incorporates
> Lee's four rulings of 2026-07-26:
>
> 1. **No response-time target** — none published, none internal. Procedures stay
>    qualitative. (The ladder rungs in D3 are not a target: they describe what the
>    system does on its own, and staff need them to understand what is happening.)
> 2. **Ladder timings confirmed as-is** — 15s browser → 30s on-shift mobile → 60s
>    supervisor → 90s admin → 120s emergency contacts.
> 3. **The ladder governs non-response.** The old "3 attempts / 10 minutes"
>    timeline is deleted everywhere it appears — it was the dangerous
>    contradiction, telling staff one thing while the system did another.
> 4. **112 dials via the workstation softphone** — click to dial, no desk-phone
>    fallback needed.
>
> **How to publish once approved:** Admin → Settings → Documentation → New, or a
> seed migration. Each draft states the slug / category / visibility / importance
> it should take. The Spanish copies are **not** drafted yet — they should be
> translated only from the wording you finally approve, not from these drafts.

---

## Cross-cutting correction: Isabella is NOT in the emergency path

Every existing emergency doc predates the AI strip. The public site, the
`/how-it-works` journey and the product copy were all corrected to say a **real
operator answers**. The procedure library was not.

**What is true in code today:** a pendant SOS reaches operators through
`ev07b-sos-alert` → the alerts table → realtime to the call-centre UI. No AI
sits in that path. Isabella's remaining scope is the public chat widget and
staff-side assistance; her hard-blocked tools (`manage_alert` escalate/resolve
among them) are unreachable in code, not merely discouraged.

**Consequence for the library:** any sentence implying an assistant triages,
answers, or resolves an alert must go. I have not edited the five existing
emergency docs — you sign those off. Draft replacements are below.

---

## D1 — SOS Alert Response Protocol (REPLACES `sos-alert-response-protocol-en`)

*Category `emergency` · visibility `staff` · importance 10 · replaces the doc that
still says "Click Claim Alert" and promises "< 30 seconds".*

**Sources:** `src/hooks/useSOSTakeover.ts` (accept path, statuses),
`src/components/call-centre/sos/SOSAlertBar.tsx` (the button and its labels),
`src/components/call-centre/sos/SOSActionPanel.tsx` (quick actions),
`supabase/functions/ev07b-sos-alert/index.ts` (ingress).

### Draft

> ## SOS Alert Response Protocol
>
> **Priority: CRITICAL**
>
> ### What happens before you see it
> The member presses SOS on their pendant, or the pendant detects a fall. The
> alert arrives in the call-centre directly. **No automated system speaks to the
> member first** — until an operator accepts, nobody has talked to them.
>
> ### 1. Accept the alert
> The red SOS bar appears at the top of every call-centre page, with a tone.
> Press **Accept Alert**.
>
> - Accepting is what puts your name on it. The alert moves to `accepted`, your
>   staff record is written to it, and the bar clears for every other operator —
>   so two people cannot both think they have it.
> - If someone accepted a half-second before you, the button reports that
>   honestly instead of pretending you own it. Move to the next alert.
> - Accepting does **not** pause the escalation ladder's earlier rungs — see D3.
>
> ### 2. Speak to the member through the pendant
> Two-way voice opens on the pendant itself. You do not need to dial.
>
> > "Hello [name], this is [your name] from Care Conneqt. I can see your alert.
> > Are you all right?"
>
> Listen before asking a second question — a member who has fallen may need time.
>
> ### 3. Work out what is needed
> Their profile is on your screen already: address, medical conditions,
> medication, emergency contacts, preferred language. Do not ask them to spell
> an address you can already see.
>
> - **Emergency confirmed** → D4 (112) immediately, then keep talking to them.
> - **They are unhurt** → confirm, offer to tell a family member, log it.
> - **No answer** → D5, Non-Response. Do not work to a stopwatch of your own:
>   the ladder is already running and will bring others in.
> - **Accidental press** → confirm it was accidental and resolve as a false alarm.
>
> ### 4. Stay with them
> Do not close the channel because help is on the way. Stay until responders
> physically arrive or the member ends it.
>
> ### 5. Resolve
> Resolve from the alert panel with notes and, if it was one, the false-alarm
> flag. Resolving ends the conference, releases participants, and — for a real
> alert, not a false alarm — notifies the emergency contacts who were involved.
> Write the notes for the next person, not for the file.

**Response times (ruling 1 applied):** no target appears in this draft — not
"< 30 seconds", not an internal one, and the old doc's "monthly audit of
response times" is gone with it. The procedure says *quickly* and explains why
speed matters (every second of delay climbs the ladder and rings a real
person's phone), which is the honest motivator and needs no number.

---

## D2 — Two-way voice and calling the member

*Category `emergency` · visibility `staff` · importance 9 · NEW*

**Sources:** `SOSActionPanel.tsx` quick actions (call member, SMS, 112),
`AlertDetailPanel.tsx` `handleCallMember`, `sos-conference-*` functions.

### Draft

> ## Talking to the Member During an Alert
>
> ### The pendant channel comes first
> An accepted SOS gives you two-way voice through the pendant. Use it before
> anything else: it is already open, it is hands-free, and a member on the floor
> cannot reach a phone.
>
> ### If the pendant channel will not carry
> **Call member** dials the number on their profile from your device.
>
> ### Bringing others onto the call
> A conference can be opened so a supervisor or a family member joins without
> the member having to repeat anything. Leaving the conference does not end it;
> resolving the alert does.
>
> ### If you cannot hear them
> Do not assume silence means a false alarm. An open channel with no voice is a
> **non-response** (D5). Say out loud who you are and what you are doing — a
> member who can hear but not answer is reassured by it, and it is on the
> recording.

---

## D3 — Escalation chain (REPLACES `emergency-escalation-guidelines-en`)

*Category `emergency` · visibility `staff` · importance 10 · replaces the doc naming
"Operations Manager / On-Call Manager / Director", none of which exist as roles.*

**Sources:** `supabase/functions/sos-escalation-runner/index.ts` — header comment
plus `NORMAL_TIMINGS` / `UNRESPONSIVE_TIMINGS` and the level-by-level target
selection; `migration 20260716120000_sos_escalation_cron.sql` (per-minute wake).

### Draft

> ## What Happens If Nobody Accepts
>
> The escalation ladder runs **automatically**. It is not something you trigger,
> and it does not wait for anyone to notice. It exists so an unaccepted alert
> cannot go quiet.
>
> ### The rungs
>
> | Level | Normal | Unresponsive member | Who it reaches |
> |---|---|---|---|
> | 1 | 15s | 15s | Browser alert + tone to logged-in operators |
> | 2 | 30s | 30s | On-shift staff mobile — rota primary, then backup, then any on-shift staff |
> | 3 | 60s | 45s | Supervisor mobile — the rota's supervisor first, then all supervisors |
> | 4 | 90s | 60s | Admin mobile |
> | 5 | 120s | 90s | The member's own emergency contacts are called |
>
> Alerts flagged unresponsive climb faster, because silence is worse than noise.
>
> ### What this means at your desk
> - **Accept quickly and you stop the ladder climbing.** Every rung above 1 rings
>   a real person's mobile, at any hour.
> - The ladder only advances when a human was actually reached. If a rung's call
>   connects to nobody, it does not count as progress — it will be retried rather
>   than skipped past.
> - Level 5 phones the member's family directly. By then several staff phones
>   have already rung.
>
> ### Escalating deliberately (not the ladder)
> Some situations need a human escalation regardless of timing. Raise to a
> supervisor immediately for: abuse, violence or a threat; any mention of
> self-harm; repeat SOS from the same member in 24 hours; a member you cannot
> identify; or anything you are unsure about. **Being unsure is a good enough
> reason.** Keep helping the member while you escalate.
>
> ### If the ladder itself fails
> The runner reports its own failures loudly to admins rather than dying
> quietly, and a dead-man's-switch watches its heartbeat. If you ever see an
> alert sitting unaccepted with no escalation activity, treat it as a live
> emergency and a system fault: handle the member, then tell an admin at once.

**Confirmed by Lee 2026-07-26:** these rung timings are correct and intended,
including level 5 reaching family at two minutes. They are stated here because
operators need to know what is happening around them — they are not a
performance target, and no target exists.

---

## D4 — The 112 button

*Category `emergency` · visibility `staff` · importance 10 · NEW*

**Sources:** `SOSActionPanel.tsx` (red **112** quick action, sets the
emergency-services-called flag), `AlertDetailPanel.tsx` `handleCall112`.

### Draft

> ## Calling 112 From an Alert
>
> ### What the button does
> The red **112** button click-dials the Spanish emergency number through your
> softphone, and marks the alert as *emergency services called* so the rest of
> the team and the record know without anyone having to ask. It places the call —
> **it does not speak for you.**
>
> ### When to press it
> Press it without waiting for permission when: the member confirms a medical
> emergency; they are unresponsive after a confirmed SOS; a crime, fire or gas
> leak is reported; they are trapped or in danger; or anything life-threatening.
>
> **If you are weighing it up, press it.** An ambulance stood down costs money.
> The other mistake costs a life.
>
> ### What to say
> 1. "Care Conneqt monitoring centre" and your name
> 2. Member's name, age, exact address, access notes
> 3. GPS coordinates if they are outdoors
> 4. What has happened and their current state
> 5. Relevant medical conditions from the profile in front of you
>
> ### After
> Note the reference number in the alert, tell the emergency contacts, keep the
> pendant channel open, and stay until responders arrive.

**Resolved (ruling 4):** workstations run a softphone, so the `tel:` link dials
correctly. No desk-phone fallback is documented, because none is needed.

---

## D5 — Member non-response (REPLACES `member-non-response-protocol-en` / `-es`)

*Category `emergency` · visibility `staff` · importance 9 · **full replacement**, not a patch*

**Sources:** `supabase/functions/sos-escalation-runner/index.ts` (the ladder and
its unresponsive timings), `useSOSTakeover.ts`, `SOSActionPanel.tsx`.

**Ruling 3 applied.** The old procedure told operators to make 3 call attempts
over 5 minutes, then phone emergency contacts, then call 112 at the 10-minute
mark. The system does not work that way and never waited for them: by 10 minutes
the ladder has already called on-shift staff, a supervisor, an admin and the
member's own emergency contacts. An operator following the old page would have
been working to a clock that had nothing to do with reality — and would have
duplicated calls to family the system had already made. **The whole timeline is
deleted, not softened.**

### Draft

> ## When the Member Does Not Answer
>
> ### What counts as non-response
> - The voice channel is open but nobody speaks
> - You can hear distress, struggle, or sounds you cannot account for
> - The channel connects and drops repeatedly
>
> **Silence is not a false alarm.** Treat it as a live emergency until you know
> otherwise.
>
> ### The ladder is already running
> You are not alone with this and you are not on a stopwatch. From the moment
> the alert arrived, the escalation ladder has been climbing on its own (D3):
> on-shift staff, then a supervisor, then an admin, then the member's own
> emergency contacts — all automatically, whether or not anyone accepted.
>
> **This changes what your job is.** It is not to work through a call list on a
> timer. It is to:
>
> ### What you do
>
> 1. **Say who you are, out loud, on the open channel.** A member who can hear
>    but cannot answer is reassured by it, and it is on the recording.
>    > "This is [name] from Care Conneqt. I can hear the line is open. Help is
>    > coming. I am staying with you."
>
> 2. **Read what the system already knows.** Their profile, medical conditions,
>    GPS location, and whether the pendant reported a fall. That is what the
>    emergency services will ask you for.
>
> 3. **Call 112 as soon as you believe the member is at risk** (D4). Do not wait
>    for a time to elapse and do not wait for permission. An unresponsive member
>    after a confirmed SOS is a reason to call — that is the whole point of the
>    button.
>
> 4. **Tell a supervisor.** They may already know, because the ladder may have
>    phoned them. Say it anyway.
>
> 5. **Check before you phone family yourself.** The ladder calls the member's
>    emergency contacts on its own. Look at the alert's escalation history first:
>    if a contact has already been called, phoning again to ask the same question
>    frightens people and wastes the minutes you have.
>
> 6. **Stay on the channel.** Do not close it because help is on the way.
>
> ### What is deliberately NOT in this procedure
> There is no attempt count and no minute-by-minute schedule for you to follow.
> The timings that matter are the system's, and they are in the escalation
> chain procedure. Your judgement about the member in front of you is not on a
> timer.

**On publish, the same deletion must reach these rows** — they carry fragments
of the old timeline or the withdrawn response-time target:

| Row | What must go |
|---|---|
| `member-non-response-protocol-en` / `-es` | replaced wholesale by the above |
| `sos-alert-response-protocol-en` / `-es` | "< 30 seconds" target; "10+ minutes" escalation trigger — both covered by D1/D3 |
| `fall-detection-alert-protocol-en` / `-es` | "< 30 seconds" response-time header |
| `working-hours-contact-en` / `-es` | "Emergency Alert — < 30 seconds" row in the response-time table (this one is **member-visible**) |
| `getting-started-en` / `-es` | "< 30 seconds" claim (**member-visible**) |
| `device-offline-alert-procedure-en` | "3 attempts" — a device-offline flow, not SOS non-response, so it needs a decision rather than deletion (see below) |

**One question this raises (not a blocker for D1–D8):** device-offline alerts
have their own separate timeline ("3 attempts", "6 hours", "12 hours") and are
**not** driven by the SOS ladder — `ev07b-offline-monitor` raises them, and the
ladder does not escalate them. So that procedure is not contradicted by ruling 3,
but it is unowned: nothing automatic chases an offline device. Worth deciding
separately whether those hour-based steps are real policy.

## D6 — When MedConneqt is unavailable

*Category `staff` · visibility `staff` · importance 7 · NEW*

**Sources:** `src/pages/call-centre/MedConneqtPage.tsx`, `src/config/medconneqt.ts`.
Depends on PR #91.

### Draft

> ## MedConneqt Is Not Loading
>
> MedConneqt handles medication-dispenser alarms. It is a **separate company's
> system** with its own login — your Care Conneqt sign-in does not sign you in
> there, and their alarms do not appear in our queue.
>
> ### If the page shows "MedConneqt can't be displayed inside the portal"
> Their system does not permit being embedded. Use **Open in new tab** — it works
> normally there. Report it once so it can be raised with them; do not report it
> repeatedly.
>
> ### If the page shows "MedConneqt isn't responding"
> We could not reach them at all. Press **Try again**. If it stays down, open it
> in a new tab to confirm, then tell a supervisor: **their alarms are not
> reaching anyone while their system is down, and we cannot see that from here.**
>
> ### If you are logged out inside the portal view
> Some browsers block another site's cookies inside an embedded page. Use
> **Open in new tab** and log in there.
>
> ### What this never affects
> Care Conneqt SOS alerts are entirely separate. A MedConneqt outage does not
> touch pendant alerts, the escalation ladder, or 112.

---

## D7 — Running an SOS drill safely

*Category `staff` · visibility `staff` · importance 8 · NEW*

**Sources:** `supabase/functions/sos-drill/index.ts` (create/cleanup, admin-only,
level-5 inert, dedicated drill member).

### Draft

> ## Running an SOS Drill
>
> ### Who can run one
> Admins and super-admins only.
>
> ### What a drill actually does
> It creates a clearly-labelled test alert belonging to a dedicated drill member.
> It appears in the queue and on the SOS bar with the tone, exactly like a real
> one, so operators can practise accepting and working it.
>
> ### What a drill cannot do — by design
> - **No phones ring.** The drill alert is created already at the top of the
>   ladder, so the escalation runner has no rung left to climb: no calls to
>   staff, supervisors, admins or emergency contacts, ever.
> - It does not enter through the device ingress, so no contact notifications,
>   partner alerts or admin notifications fire.
> - The drill member has no emergency contacts, and the function refuses to run
>   if it ever does.
>
> ### Before you start
> Tell the operators on shift that a drill is starting. The point is practising
> the response, not testing whether people can be startled.
>
> ### After
> Run **cleanup** to remove the drill alert. Do not leave drill alerts in the
> queue — a queue with fake alerts in it teaches people to distrust the queue.
>
> ### What a drill does NOT prove
> A drill exercises the operator's side. It does **not** test the pendant, the
> device ingress, Twilio calling, or the escalation ladder — those stay
> deliberately inert. Testing the real path end to end is a separate, planned
> live exercise.

---

## D8 — How alerts reach you (notifications)

*Category `staff` · visibility `staff` · importance 8 · NEW*

**Sources:** `SOSAlertBar.tsx` (realtime subscription + tone), `useSOSTakeover.ts`,
`NotificationBell.tsx`, `notification_log`.

### Draft

> ## How Alerts Reach You
>
> ### SOS alerts — the red bar
> A new SOS appears at the top of **every** call-centre page, with a tone, the
> moment it arrives. You do not have to be on the alerts page, and you do not
> have to refresh. When someone accepts, it clears from everyone else's screen.
>
> **Your browser tab must be open and you must be logged in.** The tone needs
> sound permitted in the browser — check it at the start of every shift.
>
> ### The notification bell
> Non-emergency items — member messages, tasks, shift and holiday updates. Not
> for emergencies: an SOS never waits behind a bell notification.
>
> ### If the bar has been silent for a long stretch
> Do not assume quiet means working. At shift start, confirm the queue is
> loading live data and your sound is on. If you suspect the feed is stale,
> reload the page and tell a supervisor — a monitoring screen that has quietly
> stopped updating is the most dangerous failure we have.

**Note for you:** notifications were dead for ~5 months and are now live. If you
want a shift-start "confirm you can hear the tone" step formalised, say so and I
will add it to the shift-start checklist (D9, not yet drafted).

---

## Not drafted, deliberately

- **Spanish copies** — translate from your approved English, not from drafts.
- **Daily Shift Procedures update** (D9) — depends on your answer about the
  sound check and on the holiday/cover approvals doc.
- **Holiday / cover approvals** (supervisor-owned) — not emergency-critical,
  happy to draft next.
- **Billing/pricing docs** — factual corrections identified in the audit
  (30-day notice, device return, missing withdrawal right); these are data fixes
  in the same class as the claims pass, and member-visible.

## Open questions — all four answered (2026-07-26)

1. ~~Internal response-time target~~ → **none.** No target published or internal;
   procedures stay qualitative. Applied in D1, and the withdrawn "< 30 seconds"
   is listed for deletion from four further rows in D5's table.
2. ~~Do the ladder timings match operations?~~ → **confirmed as-is.** Stated in
   D3 as system behaviour, explicitly not a target.
3. ~~Which timeline governs non-response?~~ → **the ladder.** D5 is now a full
   replacement and the "3 attempts / 10 minutes" schedule is deleted.
4. ~~Can workstations place a `tel:` call?~~ → **yes, softphone.** D4 says
   "click to dial via your softphone"; no fallback documented.

### One new question, raised by applying ruling 3

**Device-offline alerts are not covered by the ladder.** `ev07b-offline-monitor`
raises them, and the escalation runner does not chase them — so the offline
procedure's "3 attempts / 6 hours / 12 hours" steps are not contradicted by the
ruling, but nothing automatic backs them up either. Is that timeline real policy
a human is expected to follow, or should offline alerts get their own automated
handling? Not a blocker for D1–D8.
