# Shift no-show: what production actually says

> Read from production on 12 September 2026 at 10:19 UTC, read-only, by
> `.github/workflows/shift-noshow-facts.yml` (run #3). Every number below is from that run.
> Reproduce it: Actions → *Shift no-show facts* → Run workflow.

The brief named three candidate causes and asked which one explains the flood. **None of them
does on its own, and the biggest factor was not on the list.**

---

## The numbers

| | |
|---|---|
| Travis Nelison | role `call_centre`, **`is_on_call = false`**, active |
| `shift_alert_log`, last 7 days | **6 rows**, one per (date, shift), **all still open** |
| dedupe keys holding more than one open row | **0** |
| `staff_shifts`, last 7 days | **128 rows**, **0** (date, type) pairs duplicated |
| `staff_presence` | `is_online = false`, last heartbeat **2026-09-09 09:15 UTC** — 3 days old |
| `notification_log`, `shift.no_show`, 7 days | **100 rows**, **2** recipients, **10** distinct instants |
| …of those, naming Travis | **60** |
| database `TimeZone` | **UTC** (Madrid is +2 today) |

The six alert rows, with the Madrid time each was raised:

| shift_date | shift_type | raised (UTC) | raised (Madrid) |
|---|---|---|---|
| 2026-09-12 | morning | 05:06:00 | **07:06** |
| 2026-09-11 | afternoon | 15:00:02 | **17:00** |
| 2026-09-11 | morning | 05:06:00 | **07:06** |
| 2026-09-11 | night | 21:06:00 | **23:06** |
| 2026-09-10 | afternoon | 15:00:01 | **17:00** |
| 2026-09-10 | night | 21:06:01 | **23:06** |

---

## What explains "65 in the bell"

### 1. Fan-out is the multiplier, and nobody had done the arithmetic

**100 rows ÷ 10 distinct instants = 10 rows per event**, and 10 = **2 recipients × 5 channels**.
`notification_log` holds one row per recipient **per channel**, and `notify-admin` dispatches to
every admin and super_admin.

So **six** alerts about Travis became **sixty** rows. The bell was not repeating one alert sixty
times; it was showing the per-channel ledger of six.

That is the single largest factor in what a reader sees, and it is not a defect in the monitor at
all — it is what the notification log is for. It does mean a count of bell rows is not a count of
events, and anybody diagnosing by eye will over-estimate by an order of magnitude.

### 2. Cause 1 (the dedupe read) is OUT

Zero keys hold more than one open row. The partial unique index from `20260303123455` held
perfectly: exactly one row per (type, person, date, shift). `.maybeSingle()` never saw a set, so
it never returned the error the brief suspected.

**The runner was still wrong about it** — it discarded the insert's result and notified either
way — which is fixed in #438. But that is a latent defect, not what happened here.

### 3. Cause 2 (duplicate shift rows) is OUT

128 shift rows, not one duplicated (date, type) pair.

### 4. Cause 3 (two clocks) is REAL, and the timestamps prove it

The database runs in **UTC**; the shift windows in `staff_on_shift_now` are compared against
`CURRENT_TIME`, which is therefore UTC — while the windows themselves (07:00 / 15:00 / 23:00) are
**Madrid** wall-clock. So the view's idea of each shift is shifted two hours late in Madrid terms,
and the runner keys its rows on Madrid.

Read the table above with that in mind:

- The **07:06 Madrid** alerts are logged as `morning`. At 05:06 UTC the view's morning branch
  cannot match (it needs `CURRENT_TIME` ≥ 07:00 UTC). What matched was the **third** branch —
  *last night's night row* — and the runner wrote its own key: morning, today.
- The **23:06 Madrid** alerts are logged as `night`. At 21:06 UTC the night branches cannot match
  either; the **afternoon** row did. Logged as night.

So each of those rows is a scheduled shift of one kind, recorded against a dedupe key of another.
One shift can therefore produce more than one alert — a different key each time the two clocks
disagree — and the dedupe index cannot help, because the keys genuinely differ.

#438 and #436 fix this by keying the alert to the **scheduled row's own** `shift_date` and
`shift_type` and measuring the grace period from that shift's start.

---

## The finding that contradicts the brief, and matters more than the rest

**The platform has no record of Travis being online.** `staff_presence` says
`is_online = false`, and `last_heartbeat_at` is **2026-09-09 09:15:41.997+00** — three days before
these alerts.

It is also *exactly equal* to `session_started_at`, to the millisecond. A row whose last heartbeat
is its first is a session that pinged once and never again.

Two readings, and they need different work:

1. **The heartbeat is not being written.** If `last_heartbeat_at` never advances after sign-in,
   then nobody is ever "present" by the platform's own measure — and the presence-based definition
   landed in #436 will not, by itself, have stopped these six alerts. This is the more likely
   reading, given the millisecond-exact equality.
2. **He genuinely was not signed in on those nights**, in which case the alerts were correct about
   him being absent and merely wrong about how many and which shift.

Either way, **the fix shipped this week does not close this on its own**, and saying otherwise
would be the same mistake the brief is about: believing a status without checking the row behind
it. The next step is to establish whether `staff_presence.last_heartbeat_at` advances at all for a
signed-in operator — a question about the client heartbeat, not about the monitor.

---

## What was fixed anyway, and why it was still worth fixing

- The definition of "present" (#436) — one shared rule for the runner and the strip, and three
  states rather than two.
- The two clocks (#436) — the alert is keyed to the scheduled row, not to the runner's clock.
- Listening to the index (#438) — a refused insert no longer notifies; all four alert types claim
  through `ON CONFLICT DO NOTHING` and notify only when a row lands.
- An alert that is over says so (#438) — open rows close when the person goes on duty, with one
  retraction rather than silence, and the key is freed so a later absence in the same shift is not
  swallowed.
- Titles, not routing keys (#433) — the bell rendered `shift.no_show` as its title for **every**
  notification type, because `notification_log` has no title column and the mapper used
  `event_type`.

## The heartbeat question: ANSWERED, and it was reading 1

> Added 12 September 2026, from the code rather than from production — the answer was in the
> client all along and needed no query.

`useStaffHeartbeat` took an `isOnDuty` argument and returned early unless it was set:

```ts
export function useStaffHeartbeat(staffId: string | null, isOnDuty: boolean) {
  ...
  if (!staffId || !isOnDuty) { ...; return; }   // no ping, no interval
```

and `CallCentreHeader` passed `isOnDuty = !!staffInfo?.is_on_call`.

So `last_heartbeat_at` advanced **only while `staff.is_on_call` was already true**. Reading 1 of
the two above — "the heartbeat is not being written" — is correct, and the millisecond-exact
equality is its signature: one ping, sent when the button was last pressed on 9 September, and
nothing since.

**What that means for the fix shipped this week.** The rule in `_shared/presence.ts` is
*present = on duty OR fresh heartbeat*. Its second branch could never decide anything, because a
heartbeat could only be fresh when the first branch was already true. PRESENT-BUT-NOT-ON-DUTY —
the state the nudge exists for, and the state Travis was actually in — **was unreachable in
production**. The three states were two wearing a third's name, and #436 would not by itself have
stopped these six alerts, exactly as this document suspected.

The gate is removed and the table comment corrected
(`20260912140000_presence_is_not_duty.sql`); presence is now observed for any signed-in staff
session, on duty or not, which is what "observation" means. The header of `_shared/presence.ts`
claimed the operator had been "sending a heartbeat every thirty seconds" — that sentence was
false when written and is true now; it has been corrected rather than quietly left.

## Still open
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **not set** as repository secrets, though
  three workflows name the latter. Whatever in them needs it has never worked.
