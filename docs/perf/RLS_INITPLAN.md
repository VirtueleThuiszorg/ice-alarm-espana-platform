# docs/perf/RLS_INITPLAN.md — the evidence for the RLS rewrite

Migration `20260911180000_rls_initplan.sql` changes **how often** a policy expression is
evaluated, and nothing else. This file is the measurement that justifies it, and the
proof that it did not change **what** the policies admit.

Reproduce with:

```
DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres ./scripts/perf/rls-explain.sh 20000
```

That script builds **two** throwaway databases from the real migration set — one without
the migration, one with — rather than rewriting and reverting in place. Reverting would
leave the planner's statistics and the shared buffers warmed by the first run, and the
second number would flatter itself.

## What changed

A policy expression is evaluated for **every row the planner considers**. A bare
`auth.uid()` in one makes that a per-row function call; a bare `is_staff(auth.uid())`
makes it a per-row **query against `staff`**. Wrapping the call in a scalar sub-select
hoists it to an InitPlan, which the planner runs **once**, before the scan, and compares
every row against the constant it produced.

`auth.uid()` is `STABLE` — by definition it returns the same value throughout a
statement — so hoisting it out of the per-row loop cannot change which rows a policy
admits. That is what makes this safe, and it is why only `STABLE`/`IMMUTABLE` helpers are
candidates.

## The numbers — 20,000 rows, read as an admin, same server, same rows

| Table | BEFORE | AFTER | Speed-up |
|---|---|---|---|
| `members` | 82.7 ms | 3.3 ms | **25×** |
| `alerts` | 82.5 ms | 3.0 ms | **28×** |
| `staff_shifts` | 77.8 ms | 3.3 ms | **24×** |
| `notification_log` | 85.6 ms | 3.3 ms | **26×** |

All four are now an order of magnitude inside the 100 ms p95 budget in `perf/budgets.json`.
Before, all four were within 15 ms of **blowing it on a single unfiltered read**.

## The plans, which say the same thing more precisely

**BEFORE** — the whole JWT-reading expression is re-computed per row, inside the filter:

```
Seq Scan on members (actual rows=20000 loops=1)
  Filter: (is_staff((NULLIF(COALESCE(current_setting('request.jwt.claim.sub'::text, true),
          ((COALESCE(NULLIF(current_setting('request.jwt.claim'::text, true), ''::text),
          NULLIF(current_setting('request.jwt.claims'::text, true), ''::text)))::jsonb
          ->> 'sub'::text)), ''::text))::uuid) OR …)
```

**AFTER** — the same conditions, resolved once into `$0`, `$1`, `$2`:

```
InitPlan 1 (returns $0)
InitPlan 2 (returns $1)
InitPlan 3 (returns $2)
Seq Scan on notification_log (actual rows=20000 loops=1)
  Filter: (is_admin($0) OR (admin_user_id = $1) OR ((admin_user_id IS NULL) AND is_staff($2)))
```

`staff_shifts` is the clearest case. Before, its filter called `get_staff_role(...)` per
row — and `get_staff_role` is itself a `SELECT` against `staff`. 20,000 rows meant 20,000
queries the planner never showed as such.

## What was NOT wrapped, deliberately

`has_care_consent(member_id, 'alerts')` takes a **column**. Its value varies per row, so
hoisting it would change which rows the policy admits. The rewrite matches only
`fn(auth.uid())` — a call whose *sole* argument is the current user — and that textual
shape is the safety property, not a shortcut.

## The proof that behaviour did not change

`./scripts/rls/run.sh`, which applies the real migration set to a real PostgreSQL and runs
the cross-tenant isolation suite:

| | assertions | result |
|---|---|---|
| Without the migration | 680 | **680 PASS, 0 FAIL** |
| With the migration | 680 | **680 PASS, 0 FAIL** |

Identical. The migration rewrote **310 of 332 policies**; the other 22 contained nothing to
hoist.

## What stops the next one arriving slow

`scripts/rls/isolation.sql` now carries a permanent check — *"EVERY policy resolves the
current user once per QUERY, not once per ROW"* — plus a control assertion that the sweep
examined policies at all, so "found nothing" can never be a vacuous pass. A new policy
written the natural way turns the RLS Isolation job **red on the PR that adds it**.

It has already earned its place three times:

1. It caught the **unqualified spelling**: the migration writes `public.is_staff(…)`, but
   `ALTER POLICY` re-renders from the parse tree and drops the schema prefix, so the
   migration's first verification did not recognise its own output.
2. It caught the **helpers that were still per-row** while only `get_staff_role` was being
   hoisted — which is how the rewrite grew from one function to all ten, and how
   `members` went from 56 ms to 3 ms.
3. It caught `system_settings / Staff can view non-credential settings` coming back
   **unwrapped after the rewrite had run** — because `isolation.sql` deliberately
   re-executes `20260908120000_settings_read_policies.sql` to prove that migration is
   idempotent, and each re-run recreated the policy in the old form. That file's policy is
   now written in the hoisted form at source, so the repository agrees with every database
   built from it.
