# SOS_ESCALATION_SPEC.md — the intended SOS escalation rule (extracted, not invented)

> **Purpose.** This document states what the escalation code is *designed* to do, with
> `file:line` evidence, and proves that the runner that performs it is **not currently
> scheduled** — so the automatic human-callout safety net never fires on its own.
>
> **Method.** Static read of the escalation functions and the full migration set on branch
> `sos/escalation-spec-failing-e2e` (2026-07-16). No runtime DB was exercised (Supabase MCP
> unauthenticated; no Deno/E2E harness in-repo). Every claim below is traceable to source.
> Where the code is silent or self-contradictory, this doc says so rather than filling the gap.
>
> **Scope guard.** This is a spec + evidence document produced under the life-safety human gate.
> It changes no function, migration, cron, or app code. It is the input to the failing E2E test
> (`src/test/sosEscalation.e2e.test.ts`) and to a later loop that schedules the runner.

---

## (a) The escalation ladder the code is DESIGNED to perform

Source of truth: [`supabase/functions/sos-escalation-runner/index.ts`](../supabase/functions/sos-escalation-runner/index.ts).
The runner scans `alerts` where `status = 'incoming'` and `alert_type IN ('sos_button','fall_detected')`
([`index.ts:95-100`](../supabase/functions/sos-escalation-runner/index.ts#L95-L100)), computes `elapsed = now − received_at`
([`index.ts:109`](../supabase/functions/sos-escalation-runner/index.ts#L109)), and escalates to the next due level.

### The ladder (normal timings)

| Level | Timeout after `received_at` | Target | Who / what it reaches | Evidence |
|------:|-----------------------------|--------|-----------------------|----------|
| 1 | 15 s | `browser_alert` | Client-side audio/toast in the operator dashboard — **not a callout to a person** | [`index.ts:26`](../supabase/functions/sos-escalation-runner/index.ts#L26), [`:146-156`](../supabase/functions/sos-escalation-runner/index.ts#L146-L156) |
| 2 | 30 s | `mobile_call` | On-shift staff: `shift_escalation_chain` primary → backup → on-call fallback by `escalation_priority` (Twilio call to `personal_mobile`) | [`index.ts:27`](../supabase/functions/sos-escalation-runner/index.ts#L27), [`:174-229`](../supabase/functions/sos-escalation-runner/index.ts#L174-L229) |
| 3 | 60 s | `mobile_call` | Supervisor: chain `supervisor_staff_id` → fallback all `role = 'call_centre_supervisor'` | [`index.ts:28`](../supabase/functions/sos-escalation-runner/index.ts#L28), [`:231-271`](../supabase/functions/sos-escalation-runner/index.ts#L231-L271) |
| 4 | 90 s | `mobile_call` | Admins: `role IN ('admin','super_admin')` | [`index.ts:29`](../supabase/functions/sos-escalation-runner/index.ts#L29), [`:273-298`](../supabase/functions/sos-escalation-runner/index.ts#L273-L298) |
| 5 | 120 s | `emergency_contact_call` | Member's `emergency_contacts` by `priority_order` (Twilio call) | [`index.ts:30`](../supabase/functions/sos-escalation-runner/index.ts#L30), [`:300-322`](../supabase/functions/sos-escalation-runner/index.ts#L300-L322) |

### The ladder (unresponsive timings — tighter)

When `alerts.is_unresponsive = true` (set during Isabella triage), the timeouts tighten to
**15 s / 30 s / 45 s / 60 s / 90 s** for levels 1–5
([`index.ts:34-40`](../supabase/functions/sos-escalation-runner/index.ts#L34-L40)).

### Stepping rules (how the runner advances)

- Per invocation, per alert, it picks the **highest** level whose timeout has elapsed and is
  `> escalation_level_reached` ([`index.ts:114-121`](../supabase/functions/sos-escalation-runner/index.ts#L114-L121)).
- It records each attempt in `alert_escalations` (`target_type`, `target_staff_id`, `target_phone`)
  and advances `alerts.escalation_level_reached`
  ([`index.ts:148-153`](../supabase/functions/sos-escalation-runner/index.ts#L148-L153) and the per-level inserts).
- It de-dupes per level via a lookup on `alert_escalations(alert_id, escalation_level)`; if a level's
  row is `responded = true` it **stops escalating** that alert
  ([`index.ts:124-134`](../supabase/functions/sos-escalation-runner/index.ts#L124-L134)).
- Escalation stops implicitly when the alert leaves `status = 'incoming'` (operator accept/resolve),
  because the scan filter no longer selects it ([`index.ts:98`](../supabase/functions/sos-escalation-runner/index.ts#L98)).

Table shapes backing the ladder:
`alert_escalations` (enum `escalation_target_type = browser_alert | mobile_call | emergency_contact_call`) —
[`20260302160000_sos_alert_escalations.sql`](../supabase/migrations/20260302160000_sos_alert_escalations.sql);
`alerts.escalation_level_reached` / `alerts.is_unresponsive` —
[`20260302180000_sos_extend_alerts.sql`](../supabase/migrations/20260302180000_sos_extend_alerts.sql);
`shift_escalation_chain` —
[`20260302210000_shift_escalation_chain.sql`](../supabase/migrations/20260302210000_shift_escalation_chain.sql).

### Ingress that creates the alert the runner acts on

Pendant SOS enters at [`ev07b-sos-alert/index.ts`](../supabase/functions/ev07b-sos-alert/index.ts): it authenticates
ingress, de-dupes 5 min, and inserts the `alerts` row with `status: "incoming"`
([`ev07b-sos-alert/index.ts:168-182`](../supabase/functions/ev07b-sos-alert/index.ts#L168-L182)) — this is exactly the
row the runner later scans for. It also fires `emergency-contact-notify` (SMS/email, immediate, level-independent)
([`:196-211`](../supabase/functions/ev07b-sos-alert/index.ts#L196-L211)). Note: that immediate notify and the runner's
level-5 `emergency_contact_call` are **two different channels** to the same contacts.

### The shift-monitor safety net (separate runner)

[`staff-shift-monitor/index.ts`](../supabase/functions/staff-shift-monitor/index.ts) is the night-cover SPOF net:
no-show (grace 5 min, [`:15`](../supabase/functions/staff-shift-monitor/index.ts#L15)), no-coverage
([`:187-243`](../supabase/functions/staff-shift-monitor/index.ts#L187-L243)), and stale-heartbeat disconnect
(90 s, [`:18`](../supabase/functions/staff-shift-monitor/index.ts#L18)) → `notify-admin` + `notify-staff-whatsapp`.
Its header declares "**Runs every 2 minutes via pg_cron**" ([`:8`](../supabase/functions/staff-shift-monitor/index.ts#L8)).

---

## (b) How the runner is INTENDED to be triggered, and proof it is NOT scheduled

### Intended trigger: pg_cron → `net.http_post` (the pattern already used in this stack)

The runner's own header says: *"Designed to be called every 10 seconds via cron or pg_cron"*
([`sos-escalation-runner/index.ts:2`](../supabase/functions/sos-escalation-runner/index.ts#L2)). The stack's
established mechanism is **pg_cron calling the edge function over HTTP with `pg_net`**, seen twice:

- `ev07b-offline-monitor` — `'*/2 * * * *'`
  ([`20260301100000_ev07b_offline_cron.sql:17-31`](../supabase/migrations/20260301100000_ev07b_offline_cron.sql#L17-L31))
- `shift-daily-reminders` — `'0 19 * * *'`
  ([`20260301150000_staff_rota_holidays.sql:19-33`](../supabase/migrations/20260301150000_staff_rota_holidays.sql#L19-L33))

Both call `cron.schedule(name, expr, $$ SELECT net.http_post(url := …/functions/v1/<fn>, headers := …bearer service_role…, body := '{}') $$)`.
`pg_cron` + `pg_net` are enabled ([`20260122103824_…sql:1-2`](../supabase/migrations/20260122103824_ff8a9c0f-3584-4c0d-9cf4-24b56beedff3.sql#L1-L2),
[`20260122103806_…sql:1`](../supabase/migrations/20260122103806_9e986543-163a-4df4-81ce-4c436a58ee48.sql#L1)).
`TECHNICAL_SPEC.md:700` documents the *intended* schedule `staff-shift-monitor | */2 * * * *`.

### Proof it is NOT scheduled (the gap)

There are **exactly two** `cron.schedule(...)` calls in the entire migration set:

```
supabase/migrations/20260301150000_staff_rota_holidays.sql:19  → 'shift-daily-reminders'   ('0 19 * * *')
supabase/migrations/20260301100000_ev07b_offline_cron.sql:17   → 'ev07b-offline-monitor'   ('*/2 * * * *')
```

`grep -rn "cron.schedule(" supabase/migrations/` returns **only** those two. Neither
`sos-escalation-runner` nor `staff-shift-monitor` appears in any `cron.schedule`, in `config.toml`,
or in any deploy script (`grep -rn "sos-escalation-runner\|staff-shift-monitor"` across the repo hits
only their own source, docs, and STATE.md — never a scheduler). Therefore:

> **Levels 2–5 of the SOS ladder (every human callout) never fire automatically.** The runner is
> live, correct code that nothing invokes. Likewise `staff-shift-monitor` is dead unless called by
> hand. This confirms `STATE.md §1` (rows marked 🔴) and directly violates golden rule #8 and GOALS G2.

The only always-on human notification on an SOS today is the **immediate** `emergency-contact-notify`
SMS/email fired inline by `ev07b-sos-alert` ([`:196-211`](../supabase/functions/ev07b-sos-alert/index.ts#L196-L211)) —
it is *not* the escalation ladder and does **not** call staff/supervisor/admin.

---

## (c) Ambiguities & contradictions found (flagged, not resolved)

1. **Sub-minute cadence vs. classic pg_cron granularity.** The ladder's first meaningful callout is at
   **30 s** and the runner is designed for a **10 s** cadence
   ([`index.ts:2`](../supabase/functions/sos-escalation-runner/index.ts#L2)). Classic 5-field pg_cron
   (`* * * * *`) has a **1-minute floor** — as used by the two existing jobs. A 1-minute schedule would
   miss the 15 s/30 s/45 s/60 s timings badly. Sub-minute needs pg_cron's interval-string form
   (`cron.schedule('job','10 seconds', …)`, available on recent pg_cron) or an external scheduler. **The
   intended interval is therefore under-specified in code** — the header says 10 s but no scheduled job
   exists to compare against. The wiring loop (STEP 2B) must choose and justify this explicitly.

2. **Tier-skipping under sparse invocation.** The next-level selection takes the *highest* elapsed level
   ([`index.ts:114-121`](../supabase/functions/sos-escalation-runner/index.ts#L114-L121)). If the runner is
   invoked sparsely (e.g. first run long after `received_at`), an alert can jump straight to level 5,
   **skipping the staff/supervisor/admin callouts entirely**. The design only steps 1→2→3→4→5 cleanly when
   invoked frequently relative to the 15/30/60/90/120 s ladder. This is a *robustness* argument for a tight
   interval, and a latent bug if cadence is coarse. Flagged; not a call to change the logic in this loop.

3. **Timezone mismatch across the two runners.** The escalation runner derives shift type from **UTC**
   (`now.getUTCHours()`, [`index.ts:161`](../supabase/functions/sos-escalation-runner/index.ts#L161)), while
   `staff-shift-monitor` uses **Europe/Madrid** ([`staff-shift-monitor/index.ts:53-64`](../supabase/functions/staff-shift-monitor/index.ts#L53-L64)).
   For 1–2 hours around shift boundaries the two disagree on which `shift_escalation_chain` row is "current",
   so level-2/3 chain lookups can target the wrong shift's staff. Flagged as a real inconsistency.

4. **`is_unresponsive` provenance.** The tighter ladder depends on `alerts.is_unresponsive`, documented as
   set "during Isabella triage" ([`20260302180000_sos_extend_alerts.sql`](../supabase/migrations/20260302180000_sos_extend_alerts.sql)).
   A raw pendant SOS via `ev07b-sos-alert` does **not** set it (that insert omits the column
   [`:168-182`](../supabase/functions/ev07b-sos-alert/index.ts#L168-L182)), so a pendant-only SOS uses the
   **normal** ladder. The E2E test therefore encodes the normal ladder for the pendant path and treats the
   unresponsive ladder as a separate documented case.

5. **Two channels to emergency contacts.** As noted in (a), contacts are notified twice by different code
   paths (immediate SMS/email at ingest vs. level-5 voice call in the runner). Not a contradiction in intent,
   but worth stating so the test asserts the **level-5 voice callout** specifically, not the ingest SMS.

**No gaps were filled with assumptions.** Where the intended interval is not pinned by code (item 1), this
doc says so and defers the decision to the wiring loop rather than inventing a number.
