# Operator Card — Design Spec

**Living document. Do not date the filename.**
Canonical location: this repository. Supersedes `ICE_OPERATOR_CARD_SPEC_2026-09-02.md`,
which lived in the Claude project rather than in git — which is why the goal brief for the
emergency-contact readiness work pointed at a file that could not be found. That brief was
wrong, not the agent that reported it missing.

**Reconciled 2026-09-04** from two sources, both retained in full:
1. The card design (bands, call routing, 112, print, missing fields) — Cowork session, 2 Sep.
2. The emergency-contact state contract (§5.1) — increment 2 of the readiness goal, 3 Sep.

**Purpose:** one member overview an operator can act from — reachable from the CRM and
during a live alert.

---

## 0. Decisions already made

| Question | Answer | Consequence |
|---|---|---|
| Where does it open from? | **Both** — CRM/members row, and the pre-alert view when a member rings in | One component, two mounts. Not two panels. |
| How do operators call? | **Browser softphone** | Click-to-call goes through Twilio and the existing `sos-conference-*` spine. No `tel:` links. |
| Printable? | **Yes**, for when the system is down | Fixed single column, no hover-only data, no colour-only status, 112 script visible in print. |

## 0.1 The attention budget

`src/pages/call-centre/SOSAlertPage.tsx`, with `SOSActionPanel` as the right-hand column, is
what an operator looks at while a real person is in trouble. Everything on it competes for
the attention of somebody under stress, working fast, possibly at 3am. The card has a strict
attention budget, and anything that spends it without changing what the operator does is a
defect.

That cuts both ways, and both halves are load-bearing:

- A fact that **changes what the operator does** must be impossible to miss.
- A fact that **does not** must not be loud, or the loud things stop being loud.

This principle governs every band below, and §5.1 is its hardest case.

## 1. Do not build this from scratch

Most of it exists, built for live alerts, in `src/components/call-centre/sos/`:

`SOSTakeoverScreen` · `SOSMedicalPanel` · `SOSCallControls` · `SOSParticipantStrip` · `SOSSituationPanel` · `SOSVitalsStrip` · `SOSTimeline` · `SOSActionPanel` · `SOSIsabellaFeed`

`SOSMedicalPanel` already renders blood type, doctor + call button, hospital preference,
**special instructions in a highlighted panel**, conditions, medications and allergies.
`useSOSConference` and `sos-conference-create/join/leave/status` already run Twilio
conferences into `voice_call_sessions`, `conference_rooms` and `conference_participants`.

**The work is a second entry point and the missing fields — not a new screen.** Building a
separate CRM panel would diverge from the SOS screen within a sprint, and then operators have
two layouts and one of them is wrong under pressure.

Concretely: extract the read-only body of `SOSTakeoverScreen` into `MemberOperatorCard`, then
mount it three ways — modal from the members/CRM row, standalone route for the pre-alert
view, and inside the existing takeover screen with actions armed.

## 2. Layout — triage order, not CRM order

A CRM shows fields by category. An operator needs them by *what I need in the first ten
seconds*. Order is the design.

**Band 1 — Instruction banner (only if present)**
`members.special_instructions`. Full width, highest contrast, never collapsed, never
truncated. This is where "IF WE SEE A DAISY PENDANT CALL, IT IS DAVID EVANS CALLING" lives.
341 of your 431 records have content for this.

**Band 2 — Who**
Name · nickname (what they answer to — "Leigh") · age from DOB · gender · language +
`language_notes` · membership type and status.

**Band 3 — Where** *(the band that dispatches an ambulance)*
`address_line_1` + `address_line_2` (floor/apartment — "Apt 12 - 3rd Floor") · city ·
province · postal code · **key safe** · **key holder name + number** · **GPS + map link** ·
device last known location with its timestamp.

Access detail sits *with* the address, not in a separate tab. An operator reading an address
to 112 needs "third floor, key safe by the meter" in the same breath.

**Band 4 — Medical**
Conditions · medications · allergies · blood group · mobility · **hearing** (it changes how
you run the call, so it belongs here not in a footnote) · meds location · doctor + medical
centre.

**Band 5 — Contacts**
Emergency contacts 1–3 in priority order, then key holders, each with a call button and a
visible outcome from the current incident (`Not tried` / `Ringing` / `No answer` /
`Spoke to`). Then the member's own numbers.

**The three states this band can be in are specified in §5.1. That section is normative.**

**Band 6 — Device**
IMEI · watch or pendant · online/offline · battery · last check-in · docking station.

**Band 7 — Actions**
Call member · call each contact · **112** · log outcome · escalate. Never a bare row of
equal-weight buttons — see §4.

Bands 1–3 must fit above the fold at 1366×768. That is the constraint that keeps the design
honest.

## 3. Call actions — Twilio, not `tel:`

`DRAFT_OPERATOR_PROCEDURES.md` (D4) already flags this: *"the button is a `tel:` link, so it
dials through the operator's own device/softphone. If a workstation cannot place calls, that
button does nothing useful."*

With softphone confirmed, every call action on the card routes through the existing
conference spine:

```
callParticipant({ alertId?, memberId, target: 'member' | 'contact' | 'doctor' | '112', phone })
  → sos-conference-create / -join
  → voice_call_sessions + conference_participants row
  → card shows live state from that row
```

Three things this buys, all of which the current `tel:` links cannot give you:

1. **The card shows real call state** — ringing, connected, duration, who is on — rather than
   assuming the click worked.
2. **The timeline is truthful.** Every attempt is a row, including no-answers. That is what an
   incident review needs.
3. **`112 called` becomes a fact.** Today `SOSActionPanel.tsx:434` sets the flag on click:
   ```js
   window.open("tel:112", "_self");
   if (!emergencyServicesCalled) toggleEmergencyServices();
   ```
   The record says emergency services were called because someone clicked, not because a call
   connected. On a life-safety product that flag must come from the call, with the operator
   able to add the 112 reference number afterwards.

Also: `window.open(..., "_self")` navigates the tab. During a live alert that can take the
operator off the alert screen. Remove it regardless of what replaces it.

## 4. The 112 action

**Two steps, always.** Press → a panel opens with the script and a confirm. No single-click
path to dialling emergency services, and it is never styled the same as "call member".

**The panel renders the D4 script**, pre-filled from the record — it does not invent one.
From `DRAFT_OPERATOR_PROCEDURES.md`:

1. "ICE Alarm España monitoring centre" and your name
2. Member's name, age, exact address, access notes
3. GPS coordinates if they are outdoors
4. What has happened and their current state
5. Relevant medical conditions from the profile

Fields 2, 3 and 5 come straight from bands 2–4. Field 4 is the only thing the operator types.
A copy button for the whole block, because operators re-read it to dispatchers.

**After the call:** a required field for the 112 reference number, per D4's "note the
reference number in the alert".

**Regional routing:** 112 in Spain is operated per autonomous community. The record has the
province, so the card can show which centre it is reaching — useful when your members span
Almería, Málaga, Alicante and Murcia.

**Human-only.** Golden rule 7 says Isabella never triages or resolves an SOS. The 112 action
must be structurally unreachable to her, alongside the existing hard-blocked tools — not
merely absent from her prompt.

---

## 5. Band 5 in detail — contacts

## 5.1 The emergency-contact state contract

*Normative. Implemented by increment 2 of the readiness goal; reasoning retained verbatim.*

### 5.1.1 The three states

`emergency_contacts` for the alert's member resolves to exactly one of three states. The card
must render each of them differently, and must never render one as another.

| State | When | Presentation |
|---|---|---|
| **Loading** | the query has not returned | The contacts list shows *"Loading emergency contacts…"*. **No banner.** |
| **Present** (≥1) | the query returned rows | Unchanged: the contact list, the count badge, per-contact dial and add-to-call. **No readiness chrome at all** — this is the normal case and must stay quiet. |
| **None** (settled 0) | the query returned, zero rows | **The loud banner, §3.** |

### 5.1.2 Loading is not None — and this is the whole risk of the change

`contacts` initialises to `[]` and is `[]` *while the fetch is in flight*, so "loading" and
"this member has nobody" are the same value. A banner keyed on `contacts.length === 0` alone
therefore **flashes red on every single alert the operator opens**, for every member,
including members whose contacts are fine.

That failure mode is worse than the bug it replaces. A grey line an operator overlooks is bad;
a red banner an operator has been trained by repetition to dismiss is worse, because it will
also be dismissed on the one member for whom it is true. **The banner renders only on a
settled zero** — `contactsLoaded && contacts.length === 0`.

### 5.1.3 A failed read is not None either

If the contacts query errors, the state stays **unsettled**: no list, no banner. That is
honest — we do not know whether this member has contacts. It must never settle into "none",
which is the same conflation of *"the table was empty"* with *"I could not read the table"*
that `emergency-contact-notify` had (`READINESS_MODEL.md` §1-A, fixed in increment 1).

### 5.1.4 The NO EMERGENCY CONTACTS banner

#### Content

- **Heading:** NO EMERGENCY CONTACTS (uppercase)
- **Body:** "Nobody can be called for this member. Level 5 of the escalation ladder will do
  nothing."
- **Advice:** "Speak to the member directly. Escalate to 112 on your own judgement."

The advice line is not padding. A banner that reports a problem without saying what to do
instead costs attention and returns nothing. The operator's actual question is *"so what do I
do?"*, and the answer is: the member's own line still works, and 112 is now your call rather
than something the contact chain might have handled.

The Level-5 sentence is there because it is **true and non-obvious**. An operator watching the
ladder climb would otherwise reasonably assume the terminal tier will phone somebody. For this
member it cannot, and increment 1 makes that fire a loud admin alert
(`escalation.no_emergency_contacts`) rather than pass silently.

#### Placement

**Top of the action panel, above the JOIN CALL button.** Not inside the contacts panel, which
is below the fold and collapsed-feeling — that is where the old grey line was, and where it
was invisible.

#### Presentation requirements

| Requirement | Why |
|---|---|
| **Not colour alone** | GOALS.md G3. An icon (`Siren`), an uppercase bold heading and a full sentence. Strip the colour and the meaning survives intact. |
| **Contrast ≥ 4.5:1** | The state it replaces was `text-xs text-zinc-500` — `#71717a` on an effective `#232326`, **3.2:1** by the WCAG 2.1 relative-luminance formula, below the 4.5:1 floor for that size. The banner is `red-100`/`red-200` on `red-950`, far above it. |
| **≥ 14px, weighted** | `text-base` heading, `text-sm` body. The old line was 12px. |
| **`role="alert"`** | Reaches a screen reader without the operator hunting for it. |
| **Not collapsible, not dismissible** | An operator under load must not be able to make it go away and then forget. There is no close button and no persisted dismissal. |
| **No new query** | It reuses the fetch `SOSActionPanel` already performs. A second read of the same fact on the SOS path is exactly what `READINESS_MODEL.md` §2 argues against; the card already had the truth and only mis-rendered it. |

#### What the banner is NOT

- **Not a blocker.** It never disables JOIN CALL, the member dial, 112, or resolution. It
  informs; it does not gate. An operator must always be able to work the alert.
- **Not the readiness view.** The `member_monitoring_readiness` view (increment 3) exists for
  the *staff queue*, not for this card. The card must keep deriving from the contact rows it
  already has, so there is one source of truth on the SOS path.
- **Not a substitute for the queue.** The card is harm reduction on a call that is already
  happening. Preventing that call from happening unprepared is the admin queue's job
  (`READINESS_MODEL.md` §6-C).

### 5.1.5 Proven by

`src/test/operatorCardNoContacts.test.tsx` — banner absent while loading, present on a
settled zero, absent with ≥1 contact, and not colour-dependent. Written negative-first: the
assertions that matter most are the two **absences**, because a banner that is merely present
is easy and a banner that is present only when true is the actual requirement.

---

## 6. Print view

One CSS print stylesheet on the same component. Bands 1–5 only; device state and action
buttons are meaningless on paper. Black on white, every status as a word not a colour, the
112 script block included, and a "printed at" timestamp so nobody works from a stale sheet.
A4 portrait, single column.

The §5.1 zero-contacts state must survive printing as words, not colour — an operator working
from paper during an outage needs it most.

## 7. Fields that do not exist yet

The card cannot be finished before these land. All are in §4 of
`ICE_FIELD_MAPPING_SPEC_2026-09-02.md` *(also a Claude-project doc, not in this repo — bring
it across before relying on it)*, with counts from the real export:

| Field | Records | Band | Table |
|---|---:|---|---|
| Key safe | 96 | 3 | `member_access` *(new)* |
| GPS coordinates | 108 | 3 | `members.gps_lat/lng` |
| Google map link | 90 | 3 | `members.map_link` |
| Key holder name / tel | 36 / 18 | 3, 5 | `emergency_contacts.contact_type` |
| Mobility | 70 | 4 | `medical_information.mobility` |
| Hearing | 76 | 4 | `medical_information.hearing_notes` |
| Meds location | 86 | 4 | `medical_information.meds_location` |
| Nickname | 46 | 2 | `members.nickname` |
| Postal address (separate) | 45 | — | `member_addresses` *(new)* |

Build order: **migrations → import → card.** Built earlier, it ships with eight empty boxes
and operators stop trusting it.

## 8. Build sequence

| Step | Work | Status |
|---|---|---|
| 0 | §5.1 zero-contacts state | **done** — increment 2 |
| 1 | Migrations from mapping spec §4 (RLS + isolation test per new table) | |
| 2 | Rewrite the CRM import mapping; load the ~122 live members | |
| 3 | Extract `MemberOperatorCard` from `SOSTakeoverScreen` — read-only, no behaviour change to the alert path | |
| 4 | Mount it as a modal from the members/CRM row | |
| 5 | Replace `tel:` actions with the Twilio `callParticipant` contract (§3) | |
| 6 | 112 confirm + script panel + reference-number capture (§4) | |
| 7 | Print stylesheet (§6) | |
| 8 | Pre-alert route for inbound member calls | |

Steps 3 and 5 touch the SOS path, so per `CLAUDE.md` they need the human gate before merge
and the SOS→operator E2E test staying green.

## 9. Genuinely unresolved

1. **`DRAFT_OPERATOR_PROCEDURES.md` D5 asks which timeline governs** — the old "3 attempts /
   5 minutes / 112 at 10 minutes" procedure, or the automatic escalation ladder. Two
   documents currently disagree, and the card surfaces whichever one is authoritative. This is
   an operational ruling, not a design choice.
2. **Does an operator ever open this card for a member who is not theirs to see?** RLS today
   gives staff broad member read access. If the card becomes one click from the CRM list, it
   is worth deciding whether opening it is an audited event.
3. **The other Claude-project docs are still outside git** —
   `ICE_LIVE_READINESS_2026-09-02.md`, `ICE_PAYER_DESIGN_2026-09-02.md`,
   `ICE_FIELD_MAPPING_SPEC_2026-09-02.md`. Any brief that references them will fail the same
   way this one did. Bring them into the repo or stop citing them in goal briefs.
