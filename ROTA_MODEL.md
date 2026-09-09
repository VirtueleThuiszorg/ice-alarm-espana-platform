# ROTA_MODEL.md — the 2026 rota, and making it self-maintaining

> **Status:** DESIGN + verified facts. Source of truth for the historical rota is
> `docs/rota/rota_2026_clean.csv`, committed alongside this document.
>
> **Date:** 2026-09-09 · **Verified against:** `48e1a16` (main) · **Author:** rota goal.
>
> Every number below was recomputed from the CSV, not taken from the brief. **Two of the
> brief's figures were wrong and are corrected in §2.** Nothing here is marked working until a
> named test proves it (GOALS.md G5).

---

## 1. The rota as it actually is

Four operators. Three run a strict six-day cycle; the fourth runs every night of the year.

| Person | Email | Role in the cycle | 2026 shifts |
|---|---|---|---|
| Albert Soares | `asoares@icealarm.es` | afternoons only — 4 afternoons, 2 off | 233 afternoons |
| Carmen Nicolas | `cnicolas@icealarm.es` | 2 afternoons, 2 off, 2 mornings | 115 mornings, 102 afternoons |
| Mary Bonner | `mbonner@icealarm.es` | mornings only — 4 mornings, 2 off | 226 mornings |
| Travis Nelison | `travis@icealarm.es` | **every night, all year** | 365 nights, +24 mornings, +30 afternoons |

Shift windows come from `supabase/functions/_shared/shift-time.ts` `SHIFT_BOUNDS` and are not
redefined here: morning 07–15, afternoon 15–23, night 23–07.

### The cycle, and the proof that it is strict

Six-day pattern, and the phase anchored on **2026-12-31** (the last row of the sheet):

```
                       ← 6 days →            2026-12-31
  Albert      A   O   O   A   A   A          afternoon
  Carmen      M   A   A   O   O   M          morning
  Mary        O   M   M   M   M   O          OFF
```

Every day therefore has exactly one morning, one afternoon and one OFF among the three, plus
Travis on nights. **Verified over all 365 rows:** no row is missing a slot, and the night column
is Travis 365 times.

Walking that pattern across the whole year produces **65 days that differ from the sheet**, and
every one is explained:

| Cause | Days |
|---|---|
| The person was on holiday (`*_holiday` = True) | 54 |
| Carmen moved off her own afternoon onto Mary's morning to cover Mary's holiday | 11 |
| **Unexplained** | **0** |

So "strict 6-day cycle, never broken" is true, and the cycle is safe to extend mechanically.

### Holidays and bank holidays

Full year: **Albert 16, Carmen 28, Mary 18** days; **14** Torremolinos bank holidays. All three
match the brief.

---

## 2. Two corrections to the brief

### 2-A Travis's long days: 52 dates, not 30 — and two of them are 24 hours

The brief says *"30 days Travis works afternoon 15–23 straight into his night."* That figure is
right as far as it goes, but it is not the whole set. Recomputed over 2026:

| Shape | Days | What it means |
|---|---|---|
| afternoon + night | **30** | **15:00 → 07:00 continuous — 16 hours on shift without a break** |
| morning + night | **24** | 07:00–15:00, then 23:00–07:00. 16 hours in a 24-hour window, with an 8-hour gap |
| **all three** | **2** | **07:00 → 07:00. Twenty-four hours continuous.** `2026-05-20`, `2026-07-18` |

**52 distinct dates** carry more than one Travis shift (30 + 24 = 54 shift-pairs, minus the 2
dates counted in both rows).

This matters for three reasons:

1. The brief's assertion *"no person has two shifts on one date except Travis on his 30 flagged
   days"* **would fail as written** — it is 52 dates. The assertion is implemented against the
   true figure, per shape, in §5.
2. The warning cannot be one flag. A 16-hour continuous shift and a split 16-hour day are
   different risks and the screen should not present them identically.
3. **A single operator awake for 24 hours is the only person answering a life-safety alarm.**
   Both 24-hour dates are in the past and outside the import window, so nothing is seeded for
   them — but the generator and the swap flow must not be able to create another one silently.
   Lee's decision stands: *warn, do not block* (§4).

### 2-B A holiday day is not always an uncovered shift

The brief says *"every remaining holiday gap is Travis."* True — but two of the 17 holiday days
in the import window needed no cover at all, because they fell on days the person was **OFF
anyway** under the cycle: Albert, `2026-09-16` and `2026-09-17`.

An importer that assumes "holiday ⇒ someone must cover" would invent two cover rows that never
happened. Cover rows are therefore taken **only** from the sheet's `morning_covering` /
`afternoon_covering` columns, never inferred from the holiday flags.

---

## 3. What is imported, and what is deliberately not

**Imported: `2026-09-10` → `2026-12-31`. 113 days.**

Rows before 2026-09-10 are **not** imported. The brief's reason is the right one and worth
restating: the grid in the spreadsheet does not reflect the swaps that actually happened, so the
earlier part of the year is a plan, not a record. Importing it would put 250 days of
approximately-true history into a system whose whole purpose is to be exactly true. **History
stays in the spreadsheet.**

### `staff_shifts` — 339 rows

113 days × 3 shifts. Counted by who actually works, not by whose shift it nominally is:

| | mornings | afternoons | nights | total |
|---|---|---|---|---|
| Mary | 72 | — | — | 72 |
| Albert | — | 73 | — | 73 |
| Carmen | 32 | 34 | — | 66 |
| Travis | 9 | 6 | 113 | **128** |
| | 113 | 113 | 113 | **339** |

`is_confirmed` = true (this is a rota that has been worked or agreed, not a proposal).
`notes` = the row's `note` column where present — 7 rows in the window carry one.

### `staff_holidays` — 9 rows

One row per **contiguous** range per person, `status='approved'`, `reviewed_by` = Lee.

| Person | Ranges | Days |
|---|---|---|
| Albert | 1 — `09-14 → 09-17` | 4 |
| Mary | 1 — `09-10 → 09-13` | 4 |
| Carmen | **7** — `10-04`, `10-08`, `10-14→16`, `10-26`, `11-01`, `12-13`, `12-19` | 9 |

Carmen's are mostly single days, which is why she has 7 rows for 9 days. `reason` comes from the
row's note where the sheet gives one (*"in Dublin — short notice cannot be helped"*, *"Wedding in
Uk"*).

### `staff_shift_covers` — 17 rows

Every shift whose `*_covering` column names somebody. The shift **belongs to the person who
worked it**; the cover row records whose it was.

- **15** are holiday cover: Travis takes the shift (13), Carmen takes Mary's morning (2).
- **2** are the knock-on: on `09-10` and `09-11` Carmen vacates her own afternoon to cover Mary's
  morning, so Travis takes Carmen's afternoon. The sheet marks these `Carmen (moved)`. These
  are covers **not** caused by the cover's own holiday, and the importer must not link them to
  a holiday row — `holiday_id` stays NULL.

### Bank holidays

6 fall in the window: `09-29`, `10-12`, `11-02`, `12-07`, `12-08`, `12-25`.

They are **not** a property of a shift — everyone shares them, and 2027's are not yet known. So
they go in their own table (`public.bank_holidays`, date + name + region), with RLS and an
isolation assertion, rather than a boolean on `staff_shifts` that would have to be written 3×
per day and could disagree with itself.

---

## 4. Continuing the cycle

`generate_rota(from_date, to_date)` extends the §1 pattern plus Travis's nights, on demand from
**Admin → Staff → Rota → "Generate next quarter"**.

- Phase is anchored on `2026-12-31` (Albert afternoon, Carmen morning, Mary OFF) — the last row
  of the sheet, so the first generated day continues it without a seam.
- **It never overwrites.** `staff_shifts` already has `UNIQUE(staff_id, shift_date, shift_type)`;
  the function inserts with `ON CONFLICT DO NOTHING`, so re-running it is a no-op and it cannot
  destroy a hand-made swap.
- It generates the **cycle**, not the exceptions: no holidays, no covers. A generated quarter is
  the default rota, which humans then bend.
- It warns, and does not block, when a generated day would give one person more than 12 hours
  (§2-A). The warning is returned, not raised — a function that refuses to generate December
  because Travis is doubled on one day in it is a function nobody will run.

---

## 5. Assertions — including the negatives

In the `#123` harness (`scripts/rls/isolation.sql`) unless marked otherwise:

**Seed shape**
1. Exactly **339** `staff_shifts` rows in `2026-09-10 … 2026-12-31`.
2. Every date in the window has exactly one `morning`, one `afternoon` and one `night`.
3. Per-person totals match §3 exactly (72 / 73 / 66 / 128).
4. **9** `staff_holidays` rows, all `approved`; per-person day totals 4 / 9 / 4.
5. **17** `staff_shift_covers` rows; the 2 `(moved)` rows have `holiday_id IS NULL`.
6. **6** bank holidays stored for the window.
7. Re-running the seed changes nothing (idempotence — row counts identical after a second run).

**The corrected long-day assertion (§2-A)**
8. In the window, exactly **6** dates have Travis on afternoon **and** night, and exactly **9**
   have morning **and** night; **no other person** has two shifts on any date.
9. No date in the window has all three shifts assigned to one person.

**Negatives — what must be proven not to happen**
10. A member (non-staff) can read **no** `staff_shifts` row.
11. An ordinary staff member cannot INSERT, UPDATE or DELETE another person's shift.
12. `generate_rota` cannot overwrite an existing shift: seed one hand-made row inside the target
    range, generate, and assert that row is unchanged.
13. `generate_rota` on a range that is already generated inserts **0** rows.
14. Bank holidays are not member-writable.

Each must be shown to FAIL against a deliberately broken version. An assertion that has not been
made to fail has not been tested.

---

## 6. §5 of the brief — escalation and the rota. **This is a finding, not a confirmation.**

The brief asks me to confirm that the SOS escalation ladder and `staff-shift-monitor` read
`staff_shifts` for "who is on shift now", and to **report rather than change** anything else.
Reporting:

| Function | What it actually reads | Reads the rota? |
|---|---|---|
| `staff-shift-monitor` | `staff_on_shift_now` — a view over `staff_shifts` | **Yes**, indirectly |
| `shift-daily-reminders` | `staff_shifts` | **Yes** |
| `sos-escalation-runner` | **`shift_escalation_chain`** | **No** |

`sos-escalation-runner/index.ts:289` selects `primary_staff_id`, `backup_staff_id`,
`supervisor_staff_id` from `shift_escalation_chain`, keyed `(shift_date, shift_type)` — the same
key as `staff_shifts`, but a **separate, hand-populated table**. Its only writer is
`useEscalationChain.ts`, i.e. an admin filling in the dialog on the rota page.

**So seeding the rota does not tell the SOS ladder who is on shift.** If no
`shift_escalation_chain` row exists for the current `(date, shift)`, the query returns null and
levels 2 and 3 have no staff to call.

Per the brief this is **reported and not changed** — it is the SOS path and it is Lee's gate. But
it should not be left implicit, so it is recorded in `PENDING_FOR_LEE.md` and in `STATE.md`. The
two tables holding the same key with different contents, one seeded and one not, is exactly the
shape of drift that a life-safety path cannot carry quietly.

---

## 7. Open questions for the human

**Q1 — the 24-hour days.** `2026-05-20` and `2026-07-18` had Travis on all three shifts. Both
are historical and neither is imported. Should the generator and swap flow *refuse* to create a
third, or keep warning only? §4 implements warn-only, per Lee's stated decision on the 30-day
case, but a 24-hour single-operator day is a different question from a 16-hour one.

**Q2 — does `generate_rota` also seed `shift_escalation_chain`?** It could, from the generated
shifts, which would close §6's gap for future quarters. It touches the SOS path, so it is not
done here and not decided here.

**Q3 — 2027 bank holidays.** Not in the sheet and not derivable. Someone has to enter the
Torremolinos calendar before the first 2027 quarter is generated, or the grid will shade nothing.

**Q4 — Carmen's 7 holiday rows for 9 days.** Single-day holidays are how the sheet records them.
If Lee would rather they were one "9 days across October–December" allowance, that is an
allowance-tracking question, not an import question, and it changes `staff_holiday_balance`.
