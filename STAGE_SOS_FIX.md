# STAGE_SOS_FIX.md — SOS/Alerts safety reconciliation (PLAN ONLY)

> **Status: AWAITING LEE SIGN-OFF. No code has been changed.** Every work package
> below touches the SOS/alert path and is therefore behind the human gate
> (CLAUDE.md: SOS path never merges without explicit approval). This plan exists so
> Lee can approve/reject each WP individually before any implementation starts.
>
> Source: the 2026-07-22 read-only call-centre audit (4-agent sweep, file:line
> evidence re-verified against `main` before this plan was written).

## The core problem, in one paragraph

The `alerts` table has **two parallel operator paths that don't know about each
other**. The **queue** (`/call-centre/alerts`, `useAlerts.ts`) claims with
`claimed_by` and resolves/escalates via **direct table writes**. The **SOS takeover**
(`/call-centre/sos-alert`, `useSOSTakeover.ts`) accepts with `accepted_by_staff_id`
and resolves via the **`sos-alert-resolve` edge function** (conference teardown +
notifications). Consequences: an SOS claimed from the queue never appears as active
on the SOS page; a queue-resolve of an SOS leaves the Twilio conference alive and
sends no notifications; and `escalateAlert` flips a status flag while telling the
operator "Admin has been notified" when **nobody was notified**. For a life-safety
product this is the highest-priority inconsistency in the codebase.

---

## WP-A — One claim/accept path (single source of truth)

**Evidence:** queue claim sets `claimed_by` (`useAlerts.ts:328`); SOS accept sets
`accepted_by_staff_id` with a concurrency guard `.is("accepted_by_staff_id", null)`
(`useSOSTakeover.ts:141-146`). The SOS page derives `activeAlert` exclusively from
`accepted_by_staff_id` (`:126`), so queue-claimed SOS alerts are invisible there.

**Proposal (recommended):** make **`accepted_by_staff_id` the canonical ownership
field for every alert type**, and make the queue's Claim call the same guarded
accept routine:
1. Extract the guarded accept into one shared hook function (or small edge
   function) used by both surfaces; it sets `accepted_by_staff_id`, `accepted_at`,
   `status='in_progress'`, and — for SOS-type alerts — navigates the operator to
   `/call-centre/sos-alert` instead of the generic detail panel.
2. Keep `claimed_by` writes temporarily as a mirror (one release) for any reporting
   that reads it, then drop with a reversible migration once verified unused.
3. Concurrency: both paths inherit the `.is(...null)` guard → two operators can no
   longer double-claim from different screens.

**Alternative (cheaper, weaker):** leave both fields but have queue-claim for
SOS-type alerts delegate to `acceptAlert`. Rejected as recommendation because it
preserves two ownership fields indefinitely.

**Risk:** low-medium — touches claim UX for all alert types. **Test:** unit test on
the shared accept (guard blocks second claimer); extend `sosEscalation.e2e.test.ts`
to assert a queue-claimed SOS surfaces as `activeAlert`.

## WP-B — Queue Resolve goes through `sos-alert-resolve`

**Evidence:** queue resolve is a direct `alerts` UPDATE (`useAlerts.ts:347-352`);
SOS resolve invokes `sos-alert-resolve` (`useSOSTakeover.ts:187`) which does
conference teardown + notifications.

**Proposal:** `useAlerts.resolveAlert` calls the **same edge function** for all
alerts (the function should no-op gracefully on teardown when no conference
exists — verify, and add that guard server-side if absent). Direct client-side
`status='resolved'` writes are removed. Same resolve dialog gains the SOS page's
false-alarm flag so data quality matches.

**Risk:** medium — changes the resolve path for every alert; must confirm
`sos-alert-resolve` handles non-SOS alert types (glucose/battery/offline) without
side effects. **Test:** contract test for the edge function (SOS with live
conference, SOS without, non-SOS); e2e assertion that resolve from the queue tears
down an open conference.

## WP-C — Escalation writes a real escalation + real notification

**Evidence:** `escalateAlert` only does `.update({ status: "escalated" })`
(`useAlerts.ts:372`) then toasts *"Admin has been notified"* (`:381`). No
`alert_escalations` row, no notification of any kind. The toast is **false**.

**Proposal:**
1. Route manual escalation through a small edge function (service-role) that:
   inserts an `alert_escalations` row (level, escalated_by, reason 'manual'),
   updates status, and sends the admin notification (same WhatsApp/notification
   channel the auto-escalation runner uses — reuse `_shared` helpers, no new
   pattern).
2. The toast becomes truthful: success only after the function confirms the
   notification was dispatched; on failure it says so loudly (G2 fail-loud, same
   philosophy as the escalation runner).

**Risk:** low — additive; manual escalation is currently a no-op beyond the flag.
**Test:** unit/contract: escalate → row exists + notification logged; failure path
surfaces an error toast, not a false success.

## WP-D — "Call Emergency Services" button: wire it or remove it

**Evidence:** the destructive-styled quick-action renders with **no `onClick` at
all** (`CallCentreDashboard.tsx:242-245`). A life-safety-labelled control that does
nothing.

**Proposal (recommended):** wire it minimally and honestly — `tel:112` (same
mechanism as the SOS panel's 112 button) **and** persist
`emergency_services_called=true` on the currently-selected alert if one is open
(mirroring `SOSActionPanel.tsx:189-205`). If no alert is selected, the button is
disabled with a tooltip.
**Alternative:** remove the button until the telephony story is decided. Either
outcome is acceptable; a dead emergency button is not.

**Risk:** low. **Test:** click-through + flag persistence assertion.

## WP-E — Persist the queue's 112/NOK checkboxes

**Evidence:** `AlertDetailPanel` keeps `emergencyServicesCalled` / `nextOfKinNotified`
in **local state only** (`AlertDetailPanel.tsx:127-128,747-758`) — silent data loss;
the SOS panel's identical flags persist to `alerts`.

**Proposal:** copy the SOS panel's persistence (UPDATE the same `alerts` columns),
and hydrate the checkboxes from the alert row on open so they survive reloads and
are consistent across the two screens.

**Risk:** low. **Test:** toggle → reload → state retained; visible on SOS screen.

## WP-F — Small SOS-takeover defects (batched)

All confirmed on the live page; each is a one-liner-to-small fix but sits on the
SOS path, so listed for explicit approval as a batch:

| # | Defect | Evidence |
|---|---|---|
| F1 | **Resolution Type silently dropped** — dialog collects it, page discards it (`_resolutionType`), edge fn always receives `"other"` | `SOSCallControls.tsx:149-160`, `SOSAlertPage.tsx:219-228`, `useSOSTakeover.ts:35-39` |
| F2 | Participant-strip "remove" removes **self**, not the chosen participant | `SOSAlertPage.tsx:230-235` |
| F3 | `joinConference` announces the operator as hardcoded `"Staff"` | `useSOSConference.ts:253` |
| F4 | "MEMBER UNRESPONSIVE" banner can never light — `is_unresponsive` isn't in the select list | `useSOSTakeover.ts:56-60` |
| F5 | Queue sound-mute toggle is cosmetic — `playAlertSound` ignores `soundEnabled` | `useAlerts.ts:407`, `CallCentreDashboard.tsx:27,146` |

**Risk:** low each; F1 improves resolution data quality immediately. **Test:** F1
contract assertion (resolution_type round-trips); F4 banner renders for a seeded
unresponsive alert; F5 unit test on the gate.

## WP-G — Hygiene: delete the dead duplicate takeover screen

**Evidence:** `src/components/call-centre/sos/SOSTakeoverScreen.tsx` (402 lines) is
a near-verbatim copy of `SOSAlertPage` and **imported nowhere**. It will drift from
the live screen and is exactly the "duplicate parallel implementation" §16 bans.

**Proposal:** delete the file. No behaviour change possible (dead code). Zero risk;
still listed here because it *looks* like SOS code.

---

## Flagged for LATER (noted per Lee — not in this stage's scope)

1. **Call-centre hard-DELETE of members** (`MemberDetailPage.tsx:147-150` does a raw
   row DELETE from a browsing surface). Later fix: soft-delete (status flag +
   retention) and restrict the destructive action to admin role. Touches RLS +
   GDPR-retention questions → its own gated WP.
2. **SubscriptionTab writes `subscriptions.status` client-side**
   (`SubscriptionTab.tsx:89-92`) — brushes golden rules #3/#4 (plan/status changes
   must be webhook/server-driven). Later fix: move pause/resume/cancel behind a
   server-side function that validates role + syncs the payment provider.

## Sequencing, size, gates

Order: **A → B → C → D/E (parallel) → F → G.** A and B are the structural pair and
should land together or A-then-B in quick succession; C–G are independent.
Estimated total: ~2–3 focused days of work, each WP a separate small PR.

**Every PR from this plan requires Lee's explicit approval before merge** (SOS
path). Definition of done per WP: named tests green (including the existing
`sosEscalation.e2e.test.ts` suite untouched-and-green), typecheck/lint zero, STATE.md
updated honestly, and no behaviour change outside the WP's stated scope.

## Acceptance criteria for the stage as a whole

- One ownership field, one resolve path, for every alert — verified by test.
- No operator-facing control on the alerts/SOS surfaces that lies (false "admin
  notified" toast, dead emergency button, non-persisting safety checkboxes,
  dropped resolution type): each either works truthfully or is removed.
- `sosEscalation.e2e.test.ts` + `escalationOutcome.test.ts` green throughout;
  new tests added per WP as named above.
