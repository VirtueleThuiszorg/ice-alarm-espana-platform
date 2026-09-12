# docs/perf/AFTER.md — where the platform is now

The companion to `BASELINE.md`. Same 36 routes, same production build, same
Playwright + CDP harness, same `perf/budgets.json`. Scored by
`src/test/perf/scorecard.ts` — one point per check, ten checks, no partial credit.

- **Measured:** 2026-09-11, after the work in #391, #397, #399, #402, #405, #408,
  #409, #412, #413 and #414.
- **Commands:** `npm run perf:measure` → `npm run perf:p95` → `npm run perf:bundles`
  → `npm run perf:report`.
- **Mean score: 5.08 / 10**, from 3.97 at baseline. **Stop condition NOT met** —
  what remains, and why, is in the final section.

## What these numbers do and do not prove

Read this before the tables. Several columns changed meaning between BASELINE and
AFTER, and a comparison that ignores that is worse than no comparison.

### LCP is higher than the baseline, and most of it is real

`public.home` went 4352 ms → ~5000 ms on the mobile profile. Four things were
considered; two are real, one is ruled out, and one was wrong and is withdrawn:

1. **The fonts now load.** They did not before. `index.html` linked
   fonts.googleapis.com, which this site's own CSP forbids, so every page rendered
   in a system fallback while paying for two preconnects to a host it could not
   use (#412). Self-hosting made the intended design actually render, and a
   measured **+336 ms on `/` and +276 ms on `/pricing`** against a control arm
   with `/fonts/*` aborted. The AFTER number is the first honest measurement of
   this site as designed; the BEFORE number is a site with no webfonts.
2. **Twice the requests for the same bytes.** Splitting the shell and making the
   four authenticated layouts lazy (#397) took 102 KB gz off every route — and
   roughly doubled the number of chunks fetched. On the mobile profile's 150 ms
   RTT, round trips cost time that fewer, larger files did not:

   | route | requests | bytes | LCP |
   |---|---|---|---|
   | `public.home` | 43 → **79** | 621 → 625 KB | 4352 → 5016 ms |
   | `public.pricing` | 25 → **52** | 604 → 593 KB | 3684 → 4144 ms |
   | `join.wizard` | 37 → **67** | 625 → 609 KB | 3140 → **2828 ms** |
   | `auth.login` | 20 → **32** | 623 → 593 KB | 3720 → 3740 ms |

   This is an observation, not a proven cause: `join.wizard` gained 30 requests
   and got FASTER, so the effect is not uniform and has not been isolated the way
   the font cost was. It is recorded because it is the largest unexplained change
   and because the brief's "preload the shell chunks" — not done — is the obvious
   thing to test against it.
3. **Not the measurement point.** Checked rather than assumed: moving the vitals
   read back to exactly where BASELINE took it (at settle, before waiting for
   query quiescence) changed `public.home` from 5036 ms to 5016 ms. The reading
   point is not the cause, and both tables now read vitals at the same moment.
4. **Not sandbox load, and this was tested.** An earlier draft of this document
   blamed contention on the shared container. A runaway busy-wait loop was then
   found to have been pegging one of the four cores for the whole AFTER run; with
   it killed, the six gated routes re-measured at `public.home` 5036 ms,
   `public.pricing` 4128, `join.wizard` 2836, `auth.login` 3748,
   `member.dashboard` 5904, `cc.alerts` 6436 — every one inside normal run-to-run
   variance of the published numbers. **The claim was wrong and is withdrawn.**

### DB queries per load counts more than it used to

BASELINE counted queries when ANIMATIONS finished. That catches a partial
waterfall: `cc.alerts` reported 17, then 28, then 36 on three runs of identical
code. AFTER counts them once the page has stopped FETCHING, so the number is the
whole load and is reproducible. **Where a route's AFTER count is higher than its
BEFORE count, the load did not grow — the old number was short.** `member.support`
67 → 20 and `member.messages` 66 → 15 are real reductions; `public.home` 9 → 10 is
the counting change.

### p95 is measured for the first time, and one route's number is an artefact

BASELINE left `dbQueryP95Ms` blank on all 36 routes, and blank scores as a fail.
It is now measured against a real PostgreSQL built from the real migration set,
seeded to 20,000 rows per table, read through RLS as an admin — the widest reader,
so the ceiling for anyone.

35 routes come in at or under 18 ms. `member.device` reports **279 ms and that is
the instrument, not the page**: the tool times an unfiltered read and, when that
exceeds budget, re-times it as `ORDER BY <timestamp> DESC LIMIT 50`.
`order_items` has no index on `created_at`, so the generic shape scans. The reads
the page actually issues were timed by hand:

| query | time |
|---|---|
| `order_items` by `order_id` (`PaidSalesFeed`) | **0.9 ms** |
| `conversation_summaries` as the page reads it (member filter + `LIMIT 20`) | **1.7 ms** |
| `conversation_summaries`, unfiltered `count(*)` over 20,000 rows | 1,364 ms |

The last row is why this column is reported with its shape. The view added in #402
to remove an N+1 has three LATERAL subqueries per row; with a matching index and a
LIMIT, Postgres runs them for the twenty rows it returns. Reporting 1,364 ms as
that route's p95 would have condemned a view doing exactly what it was added to do.

### A migration this evidence nearly bought, and why it was dropped

The 279 ms on `order_items` first looked like a missing index: `usePendantOrder`
filters it by `item_type` and `device_id`, and neither was indexed. A migration
adding both was written and measured — **327 ms → 316 ms, inside noise**, because
at a realistic 25% selectivity the planner correctly prefers a sequential scan.

The reason it looked worse than that at first was a defect in the seeder: it gave
every row the FIRST label of an enum, so `WHERE item_type = 'pendant'` matched all
60,000 rows. The seeder now cycles labels, the migration was deleted unmerged, and
whether these columns need indexes is a question for production cardinality
(`pg_stat_statements`), not for this harness.

## AFTER

Measured on the production build, 36 routes. Score is out of 10 — one point per check, no partial credit.

| Route | Score | LCP mob | LCP desk | Warm | Cold | JS gz | DB q | p95 | N+1 | CLS | Long task |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `cc.dashboard` | **3/10** | 6440 | 1192 | 509 | 1603 | 365 | 16 | 18 | staff | 0.000 | 161 |
| `cc.alerts` | **3/10** | 6404 | 1164 | 167 | 1347 | 368 | 24 | 18 | alerts staff | 0.800 | 169 |
| `admin.dashboard` | **3/10** | 6892 | 1252 | 318 | 1543 | 371 | 31 | 18 | notification_log | 0.033 | 165 |
| `public.pendant` | **4/10** | 4840 | 936 | 1165 | 1067 | 360 | 9 | 18 | ok | 0.000 | 207 |
| `member.device` | **4/10** | 6116 | 1408 | 112 | 1046 | 342 | 23 | 279 | ok | 0.000 | 192 |
| `cc.members` | **4/10** | 5840 | 1108 | 287 | 841 | 334 | 23 | 18 | staff | 0.486 | 171 |
| `cc.messages` | **4/10** | 6064 | 1080 | 250 | 803 | 357 | 28 | 18 | staff | 0.494 | 180 |
| `cc.tasks` | **4/10** | 6000 | 1080 | 171 | 893 | 350 | 27 | 18 | staff | 0.494 | 165 |
| `cc.my-shifts` | **4/10** | 6100 | 1120 | 259 | 759 | 357 | 25 | 18 | staff | 0.438 | 173 |
| `admin.finance` | **4/10** | 6396 | 1276 | 93 | 1036 | 441 | 33 | 18 | orders payments subscriptions | 0.000 | 173 |
| `admin.staff` | **4/10** | 6092 | 1092 | 111 | 1006 | 375 | 14 | 18 | staff | 0.000 | 174 |
| `admin.settings` | **4/10** | 7128 | 1324 | — | — | 466 | 14 | 18 | ok | 0.000 | 171 |
| `admin.analytics` | **4/10** | 6392 | 1216 | 85 | 1242 | 446 | 14 | 18 | website_events | 0.021 | 169 |
| `public.home` | **5/10** | 5016 | 1420 | 243 | 1526 | 372 | 10 | 18 | ok | 0.000 | 183 |
| `public.pricing` | **5/10** | 4144 | 784 | 89 | 310 | 350 | 7 | 18 | ok | 0.153 | 171 |
| `member.dashboard` | **5/10** | 5792 | 1132 | 177 | 977 | 363 | 25 | 18 | members | 0.053 | 169 |
| `member.profile` | **5/10** | 6316 | 1424 | 241 | 1215 | 385 | 17 | 18 | ok | 0.000 | 170 |
| `member.contacts` | **5/10** | 5492 | 1048 | 67 | 1031 | 361 | 15 | 18 | ok | 0.000 | 156 |
| `member.support` | **5/10** | 6132 | 1392 | 148 | 1056 | 407 | 20 | 18 | ok | 0.000 | 166 |
| `member.messages` | **5/10** | 5320 | 1348 | 96 | 1622 | 348 | 15 | 18 | ok | 0.000 | 177 |
| `admin.members` | **5/10** | 5988 | 1104 | 94 | 1361 | 346 | 20 | 18 | ok | 0.000 | 166 |
| `admin.alerts` | **5/10** | 6092 | 1092 | 109 | 1129 | 352 | 13 | 18 | ok | 0.000 | 161 |
| `public.help` | **6/10** | 4460 | 828 | 1110 | 959 | 395 | 6 | 18 | ok | 0.008 | 187 |
| `public.blog` | **6/10** | 4204 | 768 | 1054 | 523 | 357 | 6 | 18 | ok | 0.000 | 200 |
| `public.terms` | **6/10** | 4148 | 788 | 1170 | 491 | 348 | 4 | 18 | ok | 0.000 | 169 |
| `public.privacy` | **6/10** | 4092 | 772 | 1203 | 501 | 347 | 5 | 18 | ok | 0.000 | 177 |
| `join.wizard` | **6/10** | 2828 | 532 | 111 | 1051 | 358 | 4 | 18 | ok | 0.000 | 179 |
| `member.medical` | **6/10** | 5348 | 1428 | 163 | 710 | 341 | 16 | 18 | ok | 0.000 | 165 |
| `member.subscription` | **6/10** | 6160 | 1388 | 221 | 568 | 349 | 20 | 18 | ok | 0.000 | 177 |
| `admin.devices` | **6/10** | 6132 | 1092 | 82 | 598 | 351 | 15 | 18 | ok | 0.000 | 175 |
| `admin.orders` | **6/10** | 6120 | 1164 | 102 | 756 | 353 | 14 | 18 | ok | 0.001 | 178 |
| `public.how-it-works` | **7/10** | 4944 | 936 | 196 | 902 | 358 | 5 | 18 | ok | 0.000 | 227 |
| `public.contact` | **7/10** | 4480 | 848 | 171 | 894 | 352 | 5 | 18 | ok | 0.000 | 169 |
| `auth.login` | **7/10** | 3740 | 716 | 98 | 889 | 357 | 3 | 18 | ok | 0.000 | 162 |
| `auth.staff-login` | **7/10** | 3712 | 692 | 82 | 894 | 356 | 3 | 18 | ok | 0.000 | 172 |
| `partner.join` | **7/10** | 3912 | 712 | 54 | 926 | 363 | 3 | 18 | ok | 0.000 | 154 |

Units: ms except JS (KB gz). `—` is unmeasured, which scores as a fail.

### Weight and requests (cold load, reported not scored)

| Route | Mobile requests | Mobile bytes | Desktop requests | Desktop bytes |
|---|---|---|---|---|
| `public.home` | 79 | 625 KB | 81 | 761 KB |
| `public.how-it-works` | 67 | 607 KB | 68 | 644 KB |
| `public.pricing` | 52 | 593 KB | 52 | 593 KB |
| `public.pendant` | 70 | 609 KB | 71 | 641 KB |
| `public.contact` | 55 | 596 KB | 55 | 596 KB |
| `public.help` | 56 | 640 KB | 56 | 640 KB |
| `public.blog` | 51 | 600 KB | 51 | 600 KB |
| `public.terms` | 46 | 589 KB | 46 | 589 KB |
| `public.privacy` | 45 | 588 KB | 45 | 588 KB |
| `join.wizard` | 67 | 609 KB | 67 | 609 KB |
| `auth.login` | 32 | 593 KB | 32 | 593 KB |
| `auth.staff-login` | 31 | 592 KB | 31 | 592 KB |
| `partner.join` | 40 | 603 KB | 40 | 603 KB |
| `member.dashboard` | 118 | 655 KB | 118 | 655 KB |
| `member.profile` | 105 | 675 KB | 105 | 675 KB |
| `member.medical` | 96 | 638 KB | 97 | 638 KB |
| `member.contacts` | 94 | 657 KB | 94 | 657 KB |
| `member.device` | 108 | 645 KB | 108 | 645 KB |
| `member.subscription` | 100 | 640 KB | 100 | 640 KB |
| `member.support` | 104 | 692 KB | 104 | 692 KB |
| `member.messages` | 94 | 636 KB | 94 | 636 KB |
| `cc.dashboard` | 123 | 722 KB | 160 | 722 KB |
| `cc.alerts` | 123 | 721 KB | 130 | 721 KB |
| `cc.members` | 107 | 695 KB | 113 | 695 KB |
| `cc.messages` | 128 | 709 KB | 127 | 709 KB |
| `cc.tasks` | 122 | 700 KB | 122 | 700 KB |
| `cc.my-shifts` | 122 | 709 KB | 121 | 709 KB |
| `admin.dashboard` | 148 | 677 KB | 146 | 677 KB |
| `admin.members` | 111 | 657 KB | 118 | 657 KB |
| `admin.alerts` | 113 | 656 KB | 114 | 656 KB |
| `admin.devices` | 115 | 655 KB | 115 | 655 KB |
| `admin.finance` | 122 | 748 KB | 133 | 748 KB |
| `admin.orders` | 115 | 658 KB | 115 | 658 KB |
| `admin.staff` | 112 | 676 KB | 112 | 676 KB |
| `admin.settings` | 149 | 779 KB | 149 | 779 KB |
| `admin.analytics` | 116 | 753 KB | 116 | 753 KB |

### Failing checks, by how many routes fail them

| Check | Routes failing |
|---|---|
| LCP mobile cold | 36 / 36 |
| Route JS (gz) | 36 / 36 |
| Longest long task | 36 / 36 |
| DB queries / load | 26 / 36 |
| Transition cold | 17 / 36 |
| No N+1 | 11 / 36 |
| Transition warm | 8 / 36 |
| CLS | 6 / 36 |
| DB query p95 | 1 / 36 |
| LCP desktop cold | 0 / 36 |

**Stop condition: NOT met.** Worst routes: `cc.dashboard` (3/10), `cc.alerts` (3/10), `admin.dashboard` (3/10), `public.pendant` (4/10), `member.device` (4/10).

## Everything still below 10, and why

No route is at 10/10 and the stop condition is not met. Stated by check, worst
first, so the next loop starts from facts rather than from this document's tone.

### Route JS ≤ 250 KB gz — 36 / 36 fail

Shell is **326.5 KB gz**, down from 428.7 KB (#397, which made the four
authenticated layouts lazy). Every route is shell + page, so the shell is the
floor and no route can pass while it stands.

The 250 KB budget is reachable and the work is identified but not done: `en.json`
is **85.7 KB gz and eager in the shell**, and recharts, leaflet and date-fns are
not split per route.

> **Superseded, 12 Sep 2026.** This section originally reported a second,
> tighter budget of 150 KB gz for public routes and called it *unreachable* —
> react + react-dom + react-router + supabase-js + i18next are over it before any
> product code is added. Lee has withdrawn that budget rather than leaving a row
> that can never go green: public routes are now held to the same 250 KB as
> everything else. The reasoning is recorded in the header of
> `perf/budgets.json`. Nothing about the measured numbers changed — only what
> they are compared against.

### LCP ≤ 2.5 s mobile — 36 / 36 fail

Only `join.wizard` (2828 ms) is close. Dominated by the shell above; see the
caveats at the top for what changed against the baseline and why.

### Longest long task ≤ 100 ms — 36 / 36 fail

Every route lands at 150–230 ms. Baseline was 220–290 ms, so this improved
without being addressed directly — it tracks the shell parse. Untouched.

### DB queries ≤ 6 per load — 26 / 36 fail

Real reductions: `member.support` 67 → 20, `member.messages` 66 → 15 (the
`conversation_summaries` view, #402), `notification_log` 4 → 2 per authenticated
page (#409). The remaining heavy routes are dashboards that genuinely assemble
many panels; the duplicate reads named in the brief (`members` ×6,
`member_monitoring_readiness` ×4 on `/dashboard`) are still there.

### No N+1 — 11 / 36 fail, from 23 / 36

`conversation_messages`, `messages` and `notification_log` are gone from the list.
`alerts`/`staff` on the call-centre surface and `members` on `member.dashboard`
remain.

### CLS < 0.1 — 6 / 36 fail

`cc.alerts` at 0.800 is the worst on the platform and is unaddressed.
`cc.messages`, `cc.tasks`, `cc.members` and `cc.my-shifts` sit at 0.44–0.49.

### Transitions — cold 17 / 36, warm 8 / 36

Not worked. The brief's `usePrefetchRoute` hook and the react-query staleTime
tiers were not built, and they are the two things that would move this column.

### DB query p95 ≤ 100 ms — 1 / 36 fails

`member.device` at 279 ms, an artefact of the harness's generic query shape. See
the caveats above.

## What the brief asked for that was not done

Listed plainly rather than buried:

- **`usePrefetchRoute`** — chunk + react-query prefetch on hover/focus/touchstart.
- **staleTime tiers** — reference 30 min, lists 2 min, alerts realtime-only.
- **Skeletons on every page.**
- **Realtime multiplexing** — 48 channels are still per-component; the brief asks
  for one subscription per layout shared through context.
- **Images** — png/jpg → webp/avif with width/height and lazy below the fold. The
  fonts half of that work package was done (#412, #413); the images half was not.
- **`select("*")` sweep** — 144 call sites, not swept. Where a page's reads were
  rewritten for the N+1 work the columns were narrowed, but the sweep itself
  remains.
- **Index gaps from `pg_stat_statements`** — not done. The one index hypothesis
  this harness produced was measured and rejected (see above); finding real gaps
  needs production statistics.
- **Edge-function cold vs warm timing** — not measured.
- **Supabase vs Vercel region RTT** — not measurable from this sandbox, which
  reaches neither host from the browser.
- **Lighthouse CI** — the Performance job gates bundle size, query count, N+1,
  CLS and the post-load query rate, but does not run Lighthouse. Wall-clock
  metrics are reported rather than gated, deliberately: the first version of that
  gate went red on its own first CI run because `join.wizard` measured 2,544 ms
  locally and 4,071 ms on a GitHub runner.
