# DRAFT operator procedures — awaiting Lee's sign-off

> **NOTHING HERE IS PUBLISHED.** These are drafts for review only. No row in
> `documentation` has been created or changed. Each procedure below carries the
> source in code it was written from, so you can verify the wording against real
> operations before anything reaches the people who handle emergencies.
>
> Drafted 2026-07-26 against `main` @ `1484714`.
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
> > "Hello [name], this is [your name] from ICE Alarm España. I can see your alert.
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
> - **No answer** → D5, Non-Response.
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

**Deliberately NOT in this draft, needs your ruling:** the old doc's
"< 30 seconds" response-time target and "monthly audit of response times".
Terms §3.2/§4.3 say we guarantee no specific response time, and we removed
every published number in the claims pass. If you want an *internal* target
that staff are measured against, say the number and I will write it as an
internal target, explicitly not a member promise.

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

**Check before publishing:** the rung timings are the code's current values.
Confirm they match what you want operationally — they are aggressive, and level 5
reaches family in two minutes.

---

## D4 — The 112 button

*Category `emergency` · visibility `staff` · importance 10 · NEW*

**Sources:** `SOSActionPanel.tsx` (red **112** quick action, sets the
emergency-services-called flag), `AlertDetailPanel.tsx` `handleCall112`.

### Draft

> ## Calling 112 From an Alert
>
> ### What the button does
> The red **112** button dials the Spanish emergency number from your device and
> marks the alert as *emergency services called*, so the rest of the team and the
> record know without asking. It dials — **it does not speak for you.**
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
> 1. "ICE Alarm España monitoring centre" and your name
> 2. Member's name, age, exact address, access notes
> 3. GPS coordinates if they are outdoors
> 4. What has happened and their current state
> 5. Relevant medical conditions from the profile in front of you
>
> ### After
> Note the reference number in the alert, tell the emergency contacts, keep the
> pendant channel open, and stay until responders arrive.

**Flag:** the button is a `tel:` link, so it dials through the operator's own
device/softphone. If a workstation cannot place calls, that button does nothing
useful and staff must have a desk phone. Worth confirming before this publishes.

---

## D5 — Member non-response (UPDATES `member-non-response-protocol-en`)

*Category `emergency` · visibility `staff` · importance 9*

The existing procedure's human steps are sound. It needs two corrections, not a
rewrite:

1. It was written for a world with no automatic escalation. Add: while you work
   through the steps, the ladder (D3) is climbing on its own — the family may
   already have been phoned at level 5 before you reach your own "call emergency
   contact" step. Say so, so operators do not double-call and confuse people.
2. Its "3 attempts over 5 minutes, then contacts, then 112 at 10 minutes"
   timeline is much slower than the ladder. **Which one governs?** I will not
   invent the answer — tell me, and I will make the two agree.

---

## D6 — When MedConneqt is unavailable

*Category `staff` · visibility `staff` · importance 7 · NEW*

**Sources:** `src/pages/call-centre/MedConneqtPage.tsx`, `src/config/medconneqt.ts`.
Depends on PR #91.

### Draft

> ## MedConneqt Is Not Loading
>
> MedConneqt handles medication-dispenser alarms. It is a **separate company's
> system** with its own login — your ICE Alarm España sign-in does not sign you in
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
> ICE Alarm España SOS alerts are entirely separate. A MedConneqt outage does not
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

## Open questions blocking publication

1. **Internal response-time target** — is there one, and is it a target or a
   promise? (D1)
2. **Do the ladder timings match intended operations?** Level 5 phones family at
   two minutes. (D3)
3. **Which timeline governs non-response** — the ladder or the written 10-minute
   protocol? They currently disagree. (D5)
4. **Can every operator workstation actually place a `tel:` call?** If not, the
   112 button needs a documented fallback. (D4)
