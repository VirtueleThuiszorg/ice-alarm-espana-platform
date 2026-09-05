# FULFILMENT_MODEL.md — from payment to a pendant that has been proven to work

> **Status:** DESIGN. Nothing in this document is implemented on `main` at the time it is
> written. Per GOALS.md G5, no row below is marked working until a named test proves it.
>
> **Date:** 2026-09-05 · **Verified against:** `cc0bddb` (main) · **Author:** WP2 of the
> 5 September CC master brief.
>
> **This document cannot be implemented in full during this run.** The state machine needs a
> migration, and the migration-drift gate holds every schema change until Lee runs
> `supabase db push` (PENDING_FOR_LEE.md D-3). The design lands now; the migration lands as a
> PR held for Lee. Saying so here is the point — a design doc that quietly implies its schema
> exists is how a plan becomes a lie.

---

## 0. The decision this document implements

**D4 — monitoring-ready CHANGES. It is now two conditions, not one:**

1. at least one emergency contact, **and**
2. the pendant has been **tested in the member's home, with an operator answering**.

**D9 — only `call_centre_supervisor`, `admin` and `super_admin` may move a fulfilment state
backwards.**

The fulfilment states, in order:

```
paid → allocated → programmed → dispatched → delivered → tested
```

---

## 1. What exists today — verified, not asserted

### 1-A There is no fulfilment state machine. There are two unrelated ones.

| | Enum | Values on `cc0bddb` | Who writes it |
|---|---|---|---|
| `orders.status` | `order_status` | `pending`, `processing`, `shipped`, `delivered`, `cancelled`, **`confirmed`**, **`awaiting_stock`** | `useOrderActions.ts` (client) and `_shared/post-payment.ts` (server) |
| `devices.status` | `device_status` | `active`, `inactive`, `faulty`, `returned`, `in_stock`, `reserved`, `allocated`, `with_staff`, `live` | `_shared/post-payment.ts`, admin device screens |

They are joined only by `order_items.device_id` and `devices.reserved_order_id`, and **nothing
keeps them consistent.** An order can read `delivered` while its device still reads `allocated`,
and no code notices.

### 1-B Two corrections to the brief

The brief states `order_status` is `pending|processing|shipped|delivered|cancelled`. It is
**seven** values: `20260228170000_add_missing_order_statuses.sql` added `confirmed` and
`awaiting_stock`.

That matters twice over:

- `useOrderActions.ts:9` types the parameter as the **five** original values, and
  `OrdersPage.tsx` offers only those five in its filter and its actions. So **an order that
  `post-payment.ts` puts into `awaiting_stock` cannot be seen or moved by the admin UI.** An
  order that failed to allocate a device — precisely the one a human needs to act on — is the
  one the screen cannot show.
- That migration's own comment says the values are "used by `stripe-webhook`". They are not:
  `stripe-webhook/index.ts` does not touch `orders` at all. The write is in
  `_shared/post-payment.ts:115`. The comment is stale, and a stale comment about the payment
  path is worth correcting where it stands.

### 1-C Allocation already exists, and is better than the brief assumes

`_shared/post-payment.ts` §5 already: finds pendant `order_items`, picks an `EV-07B` with
`status='in_stock'` and no member, and moves it to `allocated` with `member_id`, `assigned_at`,
`reserved_order_id`, `reserved_at`. If no device is free it sets the order to `awaiting_stock`.

So `paid → allocated` is **implemented and running**. This design does not rebuild it. It names
it, gives it a state that the rest of the system can read, and fixes the fact that its failure
mode is invisible (1-B).

### 1-D `programmed` and `tested` do not exist anywhere

`grep -rn "programmed|'tested'"` across `supabase/migrations`, `src` and `supabase/functions`
returns **nothing**. There is no column, no enum value, no field on any screen, and no record
anywhere that a pendant was ever configured or that anyone ever pressed it and heard a voice.

**This is the gap D4 exists to close, and it is the whole reason readiness needs a second
condition.** Today a member can be `active`, hold a `delivered` pendant, have three emergency
contacts, and be counted monitoring-ready by
`member_monitoring_readiness` — without a single human ever having confirmed the device works
in the place it will be used.

### 1-E The transition rules live in a React hook, which means they do not exist

`useOrderActions.updateOrderStatus` takes a status, writes it, and sets `shipped_at` or
`delivered_at` on the way past. It does not check what the previous status was. It does not
check who is asking. There is no ordering, no audit of the move, and **no server-side rule of
any kind** — RLS decides *whether* you may write the row, never *which value* you may write.

So D9 cannot be implemented in the hook. A rule enforced only in the client is a suggestion:
anyone with a session and the anon key can `PATCH /rest/v1/orders?id=eq.…` with any value in the
enum. **D9 belongs in a `BEFORE UPDATE` trigger**, for the same reason readiness is a view and
not a column (READINESS_MODEL.md §2): a rule you can go around is not a rule.

---

## 2. The six states, and what each one asserts

A state is a claim about the world that somebody could check. If a state cannot be falsified by
looking, it is a mood and does not belong in an enum.

| State | The claim | Who or what sets it | Evidence it leaves |
|---|---|---|---|
| `paid` | The payment webhook cleared. Golden rule 4: nothing else puts an order here | `_shared/post-payment.ts` | `subscriptions` row exists |
| `allocated` | A specific physical device, by serial, is reserved for this member | `post-payment.ts` §5, automatic | `order_items.device_id`, `devices.reserved_order_id` |
| `programmed` | That device has been configured against this member: SOS number, fall sensitivity, SIM active | a named staff member | who + when |
| `dispatched` | It physically left, with a tracking reference | a named staff member | `tracking_number`, `shipped_at` |
| `delivered` | The courier says it arrived | staff, or a courier webhook later | `delivered_at` |
| `tested` | **A person pressed the button in the home they will use it in, and an operator answered.** | a named operator | who answered + when |

`tested` is the only state that is not about logistics. It is the one that means *the product
works for this person*, and it is the one D4 adds to readiness.

**`awaiting_stock` is not a state in this machine.** It is `paid` with a failed allocation —
a *condition*, not a place in the sequence. Modelling it as a sequence state is what let it
become invisible in 1-B. It should be a flag or a queue, and the order should still read `paid`.

---

## 3. Why this is a new column and not a reuse of `orders.status`

`orders.status` is load-bearing for money. `delivered` **creates a €50 partner commission**
(`useOrderActions.ts` → `createCommissionIfAttributed`, `partner_commissions`,
`trigger_event='device_delivered'`, released 7 days later). Its enum is also written by
`post-payment.ts` and read by `OrdersPage`, the partner pipeline and `process-commissions`.

Overloading it with three more values means every one of those readers silently acquires cases
it has never seen. `OrdersPage` already demonstrates the failure (1-B).

So: **`orders.fulfilment_state`, a new enum, added alongside.** `orders.status` keeps meaning
what it means to the commission path. The two are reconciled explicitly and testably, not by
hoping one enum can carry two jobs.

---

## 4. D9 — moving backwards, and the hazard the brief does not mention

Forward moves are ordinary work: any staff member may make them.

Backward moves are corrections — "this was marked dispatched by mistake", "the test did not
actually happen". D9 restricts them to `call_centre_supervisor`, `admin`, `super_admin`.

**The hazard: `delivered` pays a partner.**

`createCommissionIfAttributed` is idempotent per `order_id` — it returns early if a commission
row already exists — so moving `delivered → dispatched → delivered` will not double-pay.

**But nothing cancels the commission on the way back, and the job that pays it will not
notice.** `process-commissions/index.ts:59-73` validates each `pending_release` commission by
fetching its order and cancelling **only if `order.status === 'cancelled'`**. An order corrected
out of `delivered` back to `dispatched` is not cancelled — it is simply not delivered — so it
passes that check, and seven days later the €50 releases and is paid for a delivery that never
happened.

This is not hypothetical: it is exactly the correction D9 is written to allow.

**Therefore a backward move out of `delivered` must, in the same transaction, move any
`pending_release` commission for that order to `cancelled`.** Not "should" — the whole point of
allowing supervisors to correct a state is that the correction is complete. A partial correction
that leaves the money moving is worse than refusing the correction.

An already-released or already-paid commission must NOT be silently reversed; that is a finance
decision, and the right behaviour is to refuse the backward move and say why.

---

## 5. D4 — what changes in `member_monitoring_readiness`

Today (`20260904120000`):

```sql
count(ec.id) > 0 AS monitoring_ready
```

Under D4:

```sql
count(ec.id) > 0 AND <this member has an order in fulfilment_state 'tested'> AS monitoring_ready
```

Three properties must survive the change:

1. **Still derived, never stored.** READINESS_MODEL.md §2's argument is unchanged and gets
   stronger with a second input: two stored flags drift twice as many ways.
2. **Still `security_invoker = on`.** The new input is `orders`, so the view now delegates to
   `orders`' policies as well as `emergency_contacts`'. A member must not become able to see
   another member's readiness through the order join. **This needs its own isolation
   assertion** — it is the one place this change could open a hole.
3. **The two conditions stay separately visible.** The view keeps
   `emergency_contact_count` and gains `device_tested_at`, so the readiness queue can say
   *which* condition is missing. "Not ready" without a reason is not actionable, and the
   member-header notice (D10) has to name the specific thing the member can do.

**The count of ready members will drop to zero on the day this ships**, because no order has
ever been in `tested`. That is not a regression — it is the first honest number this system has
produced. It should be expected, announced, and not "fixed" by backfilling `tested` onto
historical orders, which would be inventing evidence that a test happened.

---

## 6. The schema increment

```
orders.fulfilment_state    fulfilment_state NOT NULL DEFAULT 'paid'
orders.allocated_at        timestamptz
orders.programmed_at       timestamptz
orders.programmed_by       uuid → staff(id) ON DELETE SET NULL
orders.tested_at           timestamptz
orders.tested_by           uuid → staff(id) ON DELETE SET NULL
```

`ON DELETE SET NULL` on both staff references, for the reason argued in #176: these are audit
columns, and losing *who* is recoverable while losing *whether* is not.

Plus:

- `CREATE TYPE fulfilment_state AS ENUM ('paid','allocated','programmed','dispatched','delivered','tested')`
- a `BEFORE UPDATE` trigger enforcing: forward moves by one step only; backward moves only for
  the three D9 roles; the commission cancellation of §4; and the timestamp/actor stamping that
  `useOrderActions` currently does client-side
- `member_monitoring_readiness` replaced per §5

`awaiting_stock` handling (§2) is deliberately **not** in this increment — it is a separate
concern with its own PR, and bundling it would make the state-machine migration irreversible in
practice.

---

## 7. Negative assertions — what must be PROVEN not to happen

Positive tests confirm the design was implemented. These confirm it cannot be gone around, and
they are the ones that matter (#123 harness, `scripts/rls/isolation.sql`):

1. A member cannot write `orders.fulfilment_state` at all.
2. An ordinary staff member CAN move `programmed → dispatched`.
3. An ordinary staff member CANNOT move `dispatched → programmed` — D9 refuses it in the
   database, not in the UI.
4. A `call_centre_supervisor` CAN.
5. Nobody can skip a step: `paid → dispatched` in one write is refused.
6. Moving out of `delivered` cancels a `pending_release` commission **in the same transaction**
   — assert the commission row, not the return value.
7. Moving out of `delivered` when the commission is already `released` is REFUSED, and the
   order still reads `delivered` afterwards.
8. A member sees their own readiness and NOT another member's, through the new `orders` join —
   the specific hole §5 could open.
9. `security_invoker` is still `on` after the view is replaced — read `pg_class.reloptions`, so
   assertion 8 cannot pass for the wrong reason.
10. A member with contacts but no `tested` order is NOT monitoring-ready. This is D4's whole
    content and it must be red before the change and green after.

Each must be shown to FAIL against a deliberately broken version. An assertion that has not been
made to fail has not been tested.

---

## 8. Increments — one concern per PR, each cut from `main`

| # | PR | Blocked by |
|---|---|---|
| 1 | This document | — |
| 2 | `useOrderActions` + `OrdersPage` handle all seven `order_status` values (1-B) — **no schema**, mergeable now | — |
| 3 | The `fulfilment_state` enum, columns and trigger | migration drift (D-3) |
| 4 | `member_monitoring_readiness` gains the second condition | 3 |
| 5 | The staff screen for `programmed` / `tested` | 3 |
| 6 | `awaiting_stock` as a condition rather than a state | 3 |

Increment 2 is deliberately first among the code: it is the live defect (an order needing human
attention that the admin screen cannot display), it needs no schema, and it can merge today.

---

## 9. Open questions for the human

**Q1 — who may record `tested`?** §2 says "a named operator". Should a *member* be able to
self-report a successful test, or must an operator confirm it from their side? Self-reporting is
the difference between a readiness number that moves and one that waits on staff time. Recording
it from the operator side is the difference between a readiness number that is true and one that
is polite. **This design assumes operator-confirmed** and does not implement self-report.

**Q2 — does a returned or faulty device un-test a member?** If a pendant is replaced, the new
one has not been tested in the home. Strictly, readiness should drop. That is correct and
unpopular. Not decided here.

**Q3 — the released-commission case (§4, assertion 7).** Refusing the backward move is the safe
default and what this design specifies. The alternative — allow it and raise a finance task — is
defensible. Lee's call.

**Q4 — should `tested` expire?** A pendant tested eighteen months ago and never pressed since is
evidence of very little. A re-test cadence would make readiness a live measure rather than a
one-off. Out of scope here, worth deciding before it is a year old.
