# docs/perf/BASELINE.md — where the platform actually was, before any of it was fixed

> **This is the BEFORE table.** It is committed first, on purpose and before a single
> optimisation, so that every later claim has something to be measured against. A
> performance report with no baseline is a press release.

- **Measured:** 2026-09-11, on the **production build** (`npm run build`), served by
  `vite preview`, driven by Playwright + CDP.
- **Command:** `npm run perf:measure` → `docs/perf/measurements.json`, rendered by
  `npm run perf:report`.
- **Budgets:** `perf/budgets.json` — the same file the scorecard, the vitest and the
  CI Performance job read. One number, one place.
- **Score:** out of 10, one point per check, no partial credit. The ten checks are the
  ten conditions in the brief; `src/test/perf/scorecard.ts` is the only thing that
  decides, and `src/test/perf/scorecard.test.ts` (21 assertions) proves the decider.

## What is real in these numbers, and what is not

**Real.** The production bundle, a real Chromium, real React Router, the real
`AuthContext` and `ProtectedRoute`, the real `supabase-js` client building and parsing
its own requests, real layout and paint. LCP, CLS and long tasks are the browser's own
`PerformanceObserver` numbers. The **mobile** profile is 4× CPU throttling and Slow 4G
(1.6 Mbps / 150 ms RTT) applied through CDP; **desktop** is unthrottled cable. Route JS
is gzipped and totalled from the Vite build manifest — the shell chunk plus the route's
own chunk and everything they statically import — because `vite preview` serves
uncompressed and a number scraped from it would be ~3.5× the truth.

**Modelled.** The backend is `e2e/helpers/supabaseStub.ts`, seeded with 50-row lists so
render cost is measured on the shape of a working day rather than an empty state. That
makes `DB q` an **exact count of the requests each page issues** — which is the number
this audit exists to drive down — but it means **`p95` is not a measurement of Postgres
and is deliberately left blank**. An unmeasured query plan scores as a **fail**, not a
pass: the scorer treats `null` explicitly rather than letting it default to zero. That
column is filled from `EXPLAIN ANALYZE` evidence, not from this harness.

**Two environment substitutions, both recorded rather than hidden.**

1. **Third-party origins are aborted at the network edge.** This sandbox cannot reach
   `fonts.googleapis.com`, and the request does not fail fast — it hangs until the
   connection resets, which put LCP at **13 seconds** on pages that render in well
   under one. That is a fact about the sandbox and nothing about the application.
   Aborting immediately puts the browser on the same fallback-font path a real user
   gets when Google Fonts is unreachable. *That the app depends on a third-party font
   host at all is itself a finding.*
2. **The service worker is blocked** — and this one is not a convenience, it is a
   **defect this audit found**. See below.

## A defect found while building the harness: the service worker caches the API

`public/sw.js` routes **every Supabase GET** through `networkFirst(request, API_CACHE)`.
Two consequences, neither of them theoretical — both were observed in this harness:

- **Member medical records, emergency contacts and alert history are written into
  CacheStorage on the device's disk.** On a shared or lost device that is exactly the
  data this product exists to protect.
- **When the fetch fails, the worker answers the API call with `offline.html`.** The
  client receives a 200-shaped HTML document where it expected JSON, with status 503.
  In this harness every authenticated page rendered its error state and the stub never
  saw the request at all. On a flaky mobile connection — the normal condition for this
  product's users — a member's page does not show stale data, it shows nothing.

The brief's rule is "never cache API", and the worker breaks it today. Fixed separately;
recorded here because it is the reason the harness blocks the worker, and a reader is
entitled to know that the numbers below were taken with it off.

## A second finding, from the harness rather than the numbers

On the **mobile profile, 29 of 36 routes had no clickable link to them** from the page a
user would navigate from. Every surface puts its navigation in a Radix `Sheet`, which
does not *render* its links until it is opened, so there was no anchor in the DOM at
all. The harness now falls back to driving the router directly (`pushState` +
`popstate`) so a transition time exists for every route — the identical code path, minus
the anchor's own `onClick`. The navigation question that exposed is left where it
belongs: it is a UX finding, not a performance one.

## BEFORE — 2026-09-11, no optimisation applied

Measured on the production build, 36 routes. Score is out of 10 — one point per check, no partial credit.

| Route | Score | LCP mob | LCP desk | Warm | Cold | JS gz | DB q | p95 | N+1 | CLS | Long task |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `cc.dashboard` | **1/10** | 4364 | 844 | 598 | 1208 | 449 | 23 | — | alerts staff | 0.803 | 234 |
| `member.profile` | **2/10** | 4900 | 1192 | 361 | 1157 | 469 | 17 | — | notification_log | 0.000 | 253 |
| `admin.dashboard` | **2/10** | 4524 | 948 | 360 | 1233 | 450 | 31 | — | notification_log | 0.033 | 228 |
| `admin.settings` | **2/10** | 5124 | 924 | — | — | 544 | 15 | — | notification_log | 0.000 | 247 |
| `public.pendant` | **3/10** | 4180 | 828 | 1162 | 1002 | 443 | 8 | — | ok | 0.000 | 223 |
| `member.dashboard` | **3/10** | 4284 | 816 | 127 | 1065 | 447 | 27 | — | members notification_log | 0.054 | 231 |
| `member.subscription` | **3/10** | 4128 | 1144 | 176 | 1013 | 439 | 20 | — | notification_log | 0.000 | 255 |
| `cc.alerts` | **3/10** | 4348 | 820 | 146 | 142 | 449 | 27 | — | alerts notification_log staff | 0.803 | 252 |
| `cc.messages` | **3/10** | 4044 | 752 | 176 | 221 | 440 | 17 | — | staff | 0.493 | 239 |
| `cc.tasks` | **3/10** | 4088 | 752 | 159 | 119 | 435 | 17 | — | staff | 0.493 | 259 |
| `admin.finance` | **3/10** | 4596 | 936 | 88 | 1125 | 531 | 23 | — | payments subscriptions | 0.000 | 255 |
| `admin.analytics` | **3/10** | 4716 | 972 | 114 | 1191 | 535 | 16 | — | notification_log website_events | 0.021 | 229 |
| `public.home` | **4/10** | 4352 | 1248 | 256 | 1054 | 445 | 9 | — | ok | 0.000 | 232 |
| `public.help` | **4/10** | 3860 | 744 | 1116 | 1014 | 469 | 5 | — | ok | 0.000 | 236 |
| `member.medical` | **4/10** | 4516 | 752 | 195 | 917 | 437 | 18 | — | notification_log | 0.000 | 247 |
| `member.contacts` | **4/10** | 4248 | 820 | 98 | 923 | 456 | 17 | — | notification_log | 0.000 | 255 |
| `member.device` | **4/10** | 4108 | 1144 | 129 | 944 | 441 | 23 | — | notification_log | 0.000 | 232 |
| `member.support` | **4/10** | 4692 | 1132 | 156 | 961 | 486 | 67 | — | conversation_messages messages notification_log | 0.000 | 226 |
| `member.messages` | **4/10** | 3892 | 712 | 115 | 510 | 436 | 66 | — | conversation_messages messages notification_log | 0.000 | 244 |
| `cc.members` | **4/10** | 3780 | 772 | 157 | 240 | 431 | 16 | — | staff | 0.000 | 237 |
| `cc.my-shifts` | **4/10** | 4148 | 788 | 133 | 110 | 442 | 16 | — | staff | 0.003 | 243 |
| `admin.members` | **4/10** | 4112 | 768 | 98 | 809 | 440 | 14 | — | notification_log | 0.000 | 244 |
| `admin.alerts` | **4/10** | 4156 | 784 | 118 | 733 | 438 | 14 | — | notification_log | 0.000 | 235 |
| `admin.devices` | **4/10** | 4208 | 752 | 80 | 695 | 437 | 14 | — | notification_log | 0.000 | 265 |
| `admin.orders` | **4/10** | 4260 | 756 | 112 | 875 | 440 | 13 | — | notification_log | 0.001 | 254 |
| `admin.staff` | **4/10** | 4180 | 788 | 85 | 844 | 460 | 16 | — | notification_log staff | 0.000 | 226 |
| `public.pricing` | **5/10** | 3684 | 668 | 92 | 307 | 435 | 6 | — | ok | 0.159 | 290 |
| `public.blog` | **5/10** | 3384 | 652 | 1199 | 499 | 433 | 5 | — | ok | 0.000 | 240 |
| `public.terms` | **5/10** | 3552 | 656 | 1172 | 565 | 433 | 4 | — | ok | 0.000 | 241 |
| `public.privacy` | **5/10** | 3572 | 668 | 1235 | 543 | 432 | 4 | — | ok | 0.000 | 244 |
| `public.how-it-works` | **6/10** | 4024 | 768 | 205 | 596 | 439 | 5 | — | ok | 0.000 | 248 |
| `public.contact` | **6/10** | 3576 | 688 | 188 | 471 | 434 | 4 | — | ok | 0.000 | 240 |
| `join.wizard` | **6/10** | 3140 | 556 | 88 | 930 | 450 | 4 | — | ok | 0.000 | 239 |
| `auth.login` | **6/10** | 3720 | 700 | 99 | 909 | 454 | 3 | — | ok | 0.000 | 258 |
| `auth.staff-login` | **6/10** | 3652 | 684 | 71 | 894 | 454 | 3 | — | ok | 0.000 | 224 |
| `partner.join` | **6/10** | 3684 | 700 | 59 | 937 | 459 | 3 | — | ok | 0.000 | 267 |

Units: ms except JS (KB gz). `—` is unmeasured, which scores as a fail.

### Weight and requests (cold load, reported not scored)

| Route | Mobile requests | Mobile bytes | Desktop requests | Desktop bytes |
|---|---|---|---|---|
| `public.home` | 43 | 621 KB | 44 | 663 KB |
| `public.how-it-works` | 30 | 612 KB | 31 | 648 KB |
| `public.pricing` | 25 | 604 KB | 25 | 604 KB |
| `public.pendant` | 39 | 649 KB | 39 | 649 KB |
| `public.contact` | 21 | 603 KB | 21 | 603 KB |
| `public.help` | 23 | 638 KB | 23 | 638 KB |
| `public.blog` | 21 | 468 KB | 22 | 602 KB |
| `public.terms` | 19 | 601 KB | 19 | 601 KB |
| `public.privacy` | 19 | 600 KB | 19 | 600 KB |
| `join.wizard` | 37 | 625 KB | 37 | 625 KB |
| `auth.login` | 20 | 623 KB | 20 | 623 KB |
| `auth.staff-login` | 20 | 623 KB | 20 | 623 KB |
| `partner.join` | 22 | 629 KB | 22 | 629 KB |
| `member.dashboard` | 58 | 621 KB | 58 | 621 KB |
| `member.profile` | 46 | 641 KB | 46 | 641 KB |
| `member.medical` | 41 | 607 KB | 41 | 607 KB |
| `member.contacts` | 36 | 625 KB | 36 | 625 KB |
| `member.device` | 52 | 615 KB | 53 | 615 KB |
| `member.subscription` | 45 | 611 KB | 46 | 611 KB |
| `member.support` | 84 | 658 KB | 104 | 658 KB |
| `member.messages` | 79 | 606 KB | 99 | 606 KB |
| `cc.dashboard` | 53 | 623 KB | 49 | 623 KB |
| `cc.alerts` | 57 | 623 KB | 47 | 623 KB |
| `cc.members` | 32 | 599 KB | 36 | 599 KB |
| `cc.messages` | 40 | 610 KB | 101 | 610 KB |
| `cc.tasks` | 39 | 604 KB | 43 | 604 KB |
| `cc.my-shifts` | 40 | 613 KB | 49 | 613 KB |
| `admin.dashboard` | 66 | 626 KB | 67 | 626 KB |
| `admin.members` | 36 | 610 KB | 44 | 610 KB |
| `admin.alerts` | 36 | 608 KB | 39 | 608 KB |
| `admin.devices` | 37 | 607 KB | 40 | 607 KB |
| `admin.finance` | 49 | 702 KB | 60 | 702 KB |
| `admin.orders` | 38 | 611 KB | 41 | 611 KB |
| `admin.staff` | 39 | 630 KB | 39 | 630 KB |
| `admin.settings` | 68 | 727 KB | 68 | 727 KB |
| `admin.analytics` | 40 | 706 KB | 41 | 706 KB |

### Failing checks, by how many routes fail them

| Check | Routes failing |
|---|---|
| LCP mobile cold | 36 / 36 |
| Route JS (gz) | 36 / 36 |
| DB query p95 | 36 / 36 |
| Longest long task | 36 / 36 |
| DB queries / load | 25 / 36 |
| No N+1 | 23 / 36 |
| Transition cold | 11 / 36 |
| Transition warm | 9 / 36 |
| CLS | 5 / 36 |
| LCP desktop cold | 0 / 36 |

**Stop condition: NOT met.** Worst routes: `cc.dashboard` (1/10), `member.profile` (2/10), `admin.dashboard` (2/10), `admin.settings` (2/10), `public.pendant` (3/10).

