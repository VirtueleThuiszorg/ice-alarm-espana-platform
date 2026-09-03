# PROJECT_REFS.md — every Supabase project-ref reference in this repo

> Audit produced 2026-08-11. Scope: every tracked file outside `node_modules/`,
> `dist/`, `test-results/`. Purpose: resolve the two-Supabase-project split by
> establishing, **from repo evidence rather than from any single doc's claim**,
> which project ref is authoritative — then classify every reference as CURRENT,
> HISTORICAL, or BUG.

---

## 0. Verdict — CONFIRMED by Lee 2026-08-11

**`crpsuhoixfdhjugprbuc` (ice-alarm-espana-prod, LifeLink Sync org, Pro) is authoritative.**

> Renamed in the Supabase dashboard 2026-09-03 (was `care-conneqt-prod`). The **ref** is
> what identifies the project and it has not changed; the display name is cosmetic.

Confirmed against the Supabase dashboard: **Pro tier, 24,299 requests at 100%, real
migration history, backup 7 hours old.** This independently corroborates every piece of
repo evidence in §1.

The `/goal` that commissioned this audit quoted `LEARN.md` **2026-06-17**, which states
that `cfwnrcogikjycjcobsay` is live and `crpsuhoixfdhjugprbuc` is stale. **That entry is
wrong.** It was superseded five weeks later, and is retained only because `LEARN.md` §4 is
append-only ("Never delete entries"). Both 2026-06-17 entries now carry an explicit
⛔ SUPERSEDED banner in place, so the claim can never again be read as current.

Consequently the goal's original stop condition — *"`grep -rn 'crpsuhoixfdhjugprbuc'`
returns zero hits"* — was **inverted**: satisfying it would have stripped the live
production ref out of the repo and replaced it with a cancelled project. It was **not
executed**; see §4. The revised stop condition is in §6.

### Refs in play

| Ref | Project | Status |
|---|---|---|
| `crpsuhoixfdhjugprbuc` | ice-alarm-espana-prod (LifeLink Sync, Pro) | ✅ **AUTHORITATIVE** — LOCKED 2026-07-22, dashboard-confirmed 2026-08-11, renamed 2026-09-03 |
| `cfwnrcogikjycjcobsay` | Lee-owned migration target | ⛔ **CANCELLED** 2026-07-22 — never was live, never a deploy target again |
| `qkfvojbcxaptufsepupo` | ice-alarm-espana-platform (VirtueleThuiszorg, Free) | 🕓 **DEFERRED** — empty (no migrations, no backups). A possible **future** migration target. **Not** to be deleted; the earlier delete decision is **withdrawn**. |
| `pduhccavshrhfkfbjgmj` | ICE (pre-rebrand Lovable Cloud) | ☠️ **dead** — "never touch" |

> **Decision reversal recorded.** `qkfvojbcxaptufsepupo` was previously marked "to be
> DELETED to prevent accidental use" in `LAUNCH_SCOPE.md` §0, `LAUNCH_CHECKLIST.md` and
> `AUDIT_NIGHT.md` item 55. All three were corrected on 2026-08-11 — it is DEFERRED, not
> stale, and deleting it is no longer a launch task.

---

## 1. Evidence for the verdict

Ordered strongest first. Nothing here rests on a doc simply asserting a conclusion.

1. **Runtime/config files contain the authoritative ref and *never* the cancelled one.**
   Across `index.html`, `.github/workflows/deploy-functions.yml`, `.env.example`, and two
   applied cron migrations, the only literal project ref is `crpsuhoixfdhjugprbuc`.
   `cfwnrcogikjycjcobsay` appears in **zero** runtime or config files — it survives only in
   prose. A ref that no executable artefact points at is not the live backend.

2. **`index.html` records the correction in the opposite direction.** Lines 28–29 read:
   *"Supabase project (LOCKED): crpsuhoixfdhjugprbuc … **Previously pointed at the CANCELLED
   migration-target project; corrected here.**"* Someone already migrated this file *from*
   `cfwnrcogikjycjcobsay` *to* `crpsuhoixfdhjugprbuc`. Re-inverting it would undo a
   deliberate fix.

3. **`LEARN.md` 2026-07-22 explicitly reconciles and cancels the 2026-06-17 claim** (log is
   newest-first, so it sits *above* the entry it overrides): *"that deploy targeted the
   now-**CANCELLED** `cfwnrcogikjycjcobsay`, NOT current prod."* The later entry names the
   earlier one and voids it.

4. **Empirical, tokened verification.** `STATE.md` §Stage 0 item 1: *"Linked project ref =
   `crpsuhoixfdhjugprbuc` — ✅ VERIFIED. Confirmed: prod is `crpsuhoixfdhjugprbuc` (tokened
   session, read-only)."* This is a live-database observation, not a doc copying a doc.
   Item 3 independently corroborates it: prod's 89 deployed functions are stale from
   2026-04-20 — consistent with the 2026-06-17 deploy having landed on a *different*
   project.

5. **Every canonical doc agrees.** `CLAUDE.md` Stack (the only auto-loaded doc),
   `LAUNCH_SCOPE.md` §0 (canonical for locked scope per `LEARN.md` §1), and
   `ice-alarm-espana-master-build-plan.md` §Architecture line 40 all name
   `crpsuhoixfdhjugprbuc` as the one true backend and mark the migration CANCELLED.

6. **Both cutover docs are banner-cancelled at the top.** `CUTOVER_RUNBOOK.md` line 4 and
   `CUTOVER_CHECKLIST.md` line 3 open with ⛔ CANCELLED notices instructing the reader to
   execute **no** step against `cfwnrcogikjycjcobsay`. Their many mentions of that ref are
   instructions-not-to-run, not live configuration.

**Conclusion:** the 2026-06-17 → 2026-07-22 sequence is a decision that was made, then
reversed. `crpsuhoixfdhjugprbuc` is live. Nothing in the repo contradicts this except the
superseded log entry.

---

## 2. Every reference, classified

Legend — **CURRENT**: correctly names the authoritative ref, leave alone.
**HISTORICAL**: names a dead/cancelled ref inside a frozen log, dated entry, or
cancelled runbook; correct as a record, must not be "fixed". **BUG**: actually wrong
or unresolved in a file that executes.

### 2.1 Runtime & config (executes — highest stakes)

| File | Line(s) | Ref named | Verdict |
|---|---|---|---|
| `index.html` | 28, 30–33 | `crpsuhoixfdhjugprbuc` | **CURRENT** — preconnect/dns-prefetch to live backend |
| `.github/workflows/deploy-functions.yml` | 10 | `crpsuhoixfdhjugprbuc` | **CURRENT** — documents required `SUPABASE_PROJECT_REF` secret |
| `.env.example` | 29 | `crpsuhoixfdhjugprbuc` | **CURRENT** — names backend for `supabase secrets set` |
| `supabase/migrations/20260716120000_sos_escalation_cron.sql` | 66, 88 | `crpsuhoixfdhjugprbuc` | **CURRENT** — ⚠️ **SOS path**, see §4 |
| `supabase/migrations/20260723120000_fix_cron_url_and_auth.sql` | 50, 72 | `crpsuhoixfdhjugprbuc` | **CURRENT** — ⚠️ applied cron URLs, see §4 |
| `vercel.json` | 5 | was `YOUR_SUPABASE_PROJECT_REF` | ✅ **FIXED** — now the authoritative ref, see §3.1 |
| `vite.config.ts` | — | was `YOUR_SUPABASE_PROJECT_REF` | ✅ **FIXED** — placeholder removed, now fails loud, see §3.2 |
| `supabase/functions/_shared/email-templates/invite.tsx` | 35 | was `YOUR_SUPABASE_PROJECT_REF` | ✅ **FIXED** — see §3.3 |
| `…/signup.tsx` | 37 | was `YOUR_SUPABASE_PROJECT_REF` | ✅ **FIXED** — see §3.3 |
| `…/email-change.tsx` | 37 | was `YOUR_SUPABASE_PROJECT_REF` | ✅ **FIXED** — see §3.3 |
| `…/recovery.tsx` | 32 | was `YOUR_SUPABASE_PROJECT_REF` | ✅ **FIXED** — see §3.3 |
| `…/magic-link.tsx` | 32 | was `YOUR_SUPABASE_PROJECT_REF` | ✅ **FIXED** — see §3.3 |
| `…/reauthentication.tsx` | 27 | was `YOUR_SUPABASE_PROJECT_REF` | ✅ **FIXED** — see §3.3 |

**Two findings the goal's file list anticipated but the repo refutes:**

- **`supabase/functions/**/*.ts` contains no project ref at all.** All 86 edge functions read
  `SUPABASE_URL` from `Deno.env` (auto-injected by the Supabase runtime — `.env.example`
  lines 32–33). Correct by construction; nothing to reconcile. The only `supabase.co`
  literals under `supabase/functions/` are the six `.tsx` email templates above.
- **`src/integrations/supabase/client.ts` hardcodes nothing** — it reads
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. Also correct.
- **`supabase/config.toml` has no `project_id`** and `supabase/.temp/project-ref` is absent
  (gitignored). So the repo pins no link target on disk; the link is per-machine. That is
  why `STAGE_0B_RUNBOOK.md` passes `--project-ref` explicitly.

### 2.2 Docs naming the authoritative ref — CURRENT

All correct; no action.

| File | Line(s) |
|---|---|
| `CLAUDE.md` | 59 (Stack) |
| `LAUNCH_SCOPE.md` | 14 |
| `ice-alarm-espana-master-build-plan.md` | 40 |
| `STATE.md` | 18, 27, 54 |
| `LAUNCH_CHECKLIST.md` | 30, 75 |
| `STAGE_0B_PLAN.md` | 5, 28, 44, 86, 109 |
| `STAGE_0B_RUNBOOK.md` | 4, 31, 49, 65 |
| `CUTOVER_RUNBOOK.md` | 4, 10 (cancellation banner) |
| `CUTOVER_CHECKLIST.md` | 4 (cancellation banner) |

### 2.3 Docs naming cancelled/dead refs — HISTORICAL

Correct as records. **Must not be rewritten** — rewriting a dated log entry or a
cancelled runbook falsifies the history that makes the current decision auditable.

| File | Line(s) | Ref | Why it is correct as-is |
|---|---|---|---|
| `LEARN.md` | 2026-06-17 entries et al. | `cfwnrcogikjycjcobsay` | Append-only dated log. **Both 2026-06-17 entries now carry an inline ⛔ SUPERSEDED banner** naming the 2026-08-11 confirmation, so the wrong claim cannot be read as current. |
| `LEARN.md` | 2026-07-22 entry | `qkfvojbcxaptufsepupo` | Records the (now withdrawn) delete decision; the 2026-08-11 entry records the reversal to DEFERRED |
| `LEARN.md` | 100, 262 | `pduhccavshrhfkfbjgmj` | Records "dead ICE, never touch" |
| `LEARN.md` | 67, 98, 122, 252, 260, 265, 268 | `crpsuhoixfdhjugprbuc` | Dated entries, incl. two self-flagged stale TODOs (122, 268) |
| `CUTOVER_RUNBOOK.md` | 1, 5, 7, 11, 15, 16, 25, 31, 232, 235, 253–256, 268, 269, 275, 298, 352, 362 | `cfwnrcogikjycjcobsay` | Whole doc is ⛔-cancelled at line 3–7 |
| `CUTOVER_RUNBOOK.md` | 353, 363 | `crpsuhoixfdhjugprbuc` | Cancelled plan's "retire the old project" steps |
| `CUTOVER_CHECKLIST.md` | 3, 8, 23, 45 | `cfwnrcogikjycjcobsay` | Whole doc is ⛔-cancelled at line 3 |
| `LAUNCH_SCOPE.md` | §0 | cancelled + deferred | ✏️ **CORRECTED** — "to be DELETED" → **DEFERRED**, decision withdrawn |
| `LAUNCH_CHECKLIST.md` | ~87 | `qkfvojbcxaptufsepupo` | ✏️ **CORRECTED** — delete task struck through and marked WITHDRAWN; no longer a launch item |
| `AUDIT_NIGHT.md` | ~224 | `qkfvojbcxaptufsepupo` | ✏️ **CORRECTED** — item 55's deletion clause struck through and marked WITHDRAWN |
| `CLAUDE.md` | Stack | both non-authoritative refs | ✏️ **CORRECTED** — cancelled marked historical; `qkfvojbcxaptufsepupo` now DEFERRED, not "to be deleted"; points here |
| `ice-alarm-espana-master-build-plan.md` | 40 | `cfwnrcogikjycjcobsay` | Names it as CANCELLED |
| `STATE.md` | 29 | `cfwnrcogikjycjcobsay` | Records the 2026-06-17 reconciliation |
| `TECHNICAL_SPEC.md` | 11, 169 | `pduhccavshrhfkfbjgmj` | ⚠️ **stale, not historical** — see §3.4 |
| `REBRAND_CHECKLIST.md` | 142, 143 | `pduhccavshrhfkfbjgmj` + placeholders | Frozen rebrand record; also flags §3.1/§3.3 |

### 2.4 `docs/archive/` — every hit accounted for

The goal requires this section explicitly. `docs/archive/` is **frozen by policy**
(`LEARN.md` §1: "point-in-time audit snapshot — frozen, never edited"). All five hits are
correct as point-in-time records and are excluded from every stop condition.

| File | Line | Ref | What it recorded, and why it is still correct |
|---|---|---|---|
| `AUDIT_REPORT_2026-06.md` | 129 | `crpsuhoixfdhjugprbuc` | "appears nowhere in tracked code" — true **in June 2026**, before the corrections in §2.1 landed. Now superseded, correctly frozen. |
| `AUDIT_REPORT_2026-06.md` | 175 | `crpsuhoixfdhjugprbuc` | Recorded pooler region `eu-west-1` for the then-new project |
| `AUDIT_REPORT_2026-06.md` | 300 | `crpsuhoixfdhjugprbuc` | Open action at the time: point Vercel env at it |
| `SPEC_GAP_ANALYSIS.md` | 68 | `cfwnrcogikjycjcobsay` | Recorded the then-live target "migration in progress" — that migration was later cancelled |
| `SPEC_GAP_ANALYSIS.md` | 82 | all three | Records the full chain ICE → Care → migration-target |

Also frozen and consistent: `AUDIT_REPORT_2026-06.md` 101, 132, 244–245 flag the same
`YOUR_SUPABASE_PROJECT_REF` placeholders that §3 below still finds open — an independent
corroboration that §3.1–§3.3 are genuine, long-standing bugs and not audit artefacts.

---

## 3. Real bugs this audit found — three fixed, one flagged

None of these are the two-project split. All four are *unresolved-placeholder* or
*stale-predecessor* bugs that the split was masking. §3.1–§3.3 are fixed in this change;
§3.4 is flagged for a separate pass (different concern, different doc).

### 3.1 `vercel.json:5` — sitemap rewrite pointed at a non-existent host ✅ FIXED
```diff
- "destination": "https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/generate-sitemap"
+ "destination": "https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/generate-sitemap"
```
`/sitemap.xml` in production resolved to an unregistered hostname → DNS failure. SEO
impact only, no safety impact. Introduced by the rebrand scrub of ICE's ref
(`REBRAND_CHECKLIST.md:142` says "Must be filled in Phase 2" — Phase 2 never filled it).

### 3.2 `vite.config.ts` — silent placeholder fallback ✅ FIXED (fails loud now)
Previously:
```
process.env.VITE_SUPABASE_URL ?? "https://YOUR_SUPABASE_PROJECT_REF.supabase.co"
```
A missing `.env` yielded a client pointed at a dead host **and no startup error**. The
file's own TODO called it an anti-pattern; `AUDIT_REPORT_2026-06.md:101` called it
"de-fanged … still fails silently rather than loud". That conflicts with **G2 — fail safe,
loud, and logged — never silent**: auth is a critical path and this failed quietly.

**The fix is not "substitute the real ref"** — that would be worse, because a missing
`.env` would then silently connect a dev build to *production*. Instead there is now no
default at all: a `requireEnv()` helper throws, naming the missing variable and where to
set it. Proven both directions:

- `vite build` with no env → fails with `VITE_SUPABASE_URL is not set…`
- `vite build` with the env CI supplies → `✓ built in 17.72s`

CI already injects both vars (`.github/workflows/ci.yml`), so this is safe there.
⚠️ **Vercel must have `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set** — if it
does not, the build will now fail loudly instead of shipping a dead client. That is the
intended behaviour, but it is a behaviour change worth knowing before the next deploy.

### 3.3 Six email templates — broken logo URLs ✅ FIXED (ref), ⚠️ asset still owed
`invite`, `signup`, `email-change`, `recovery`, `magic-link`, `reauthentication` all
embedded the placeholder host. All six now use the authoritative ref.

⚠️ **Not fully resolved:** per `REBRAND_CHECKLIST.md:143` a ICE Alarm España logo must also be
uploaded to the `email-assets/logo.png` storage object. Until then the images 404.
Mitigating fact found during this audit: **no edge function currently imports these
templates**, so no live email is affected today — the bug is latent, not in production.

### 3.4 `TECHNICAL_SPEC.md:11,169` — names the dead ICE project as current ⚠️ FLAGGED, not fixed
> "**Backend:** Lovable Cloud (Supabase project `pduhccavshrhfkfbjgmj`)"

Stated in the present tense as current architecture, not as history. `pduhccavshrhfkfbjgmj`
is the dead ICE ref ("never touch"), and the platform is no longer on Lovable Cloud at all
(`CLAUDE.md`: AI runs on the Anthropic API; Lovable is a "do not reintroduce" item). Line
169 also says "120 files" of migrations; the real count is **137**. This is a **G5 honesty**
defect in a doc that reads as current spec.

**Left for a separate pass**, deliberately: it is a different concern (rewriting a spec
doc's architecture section), it names a *third* ref that this change was not scoped to, and
folding it in here would mix a docs-rewrite into a ref-reconciliation PR.

---

## 4. What was deliberately NOT changed, and why

The goal's stop condition would have had me rewrite all 17 non-archive
`crpsuhoixfdhjugprbuc` hits to `cfwnrcogikjycjcobsay`. **No ref was rewritten.** Reasons:

1. **It would break the SOS path.** `20260716120000_sos_escalation_cron.sql` lines 66/88 set
   the pg_cron URLs for `sos-escalation-runner` and `staff-shift-monitor`;
   `20260723120000_fix_cron_url_and_auth.sql` lines 50/72 do the same for
   `ev07b-offline-monitor` and `shift-daily-reminders`. Repointing these at a cancelled
   project means SOS escalation cron calls a dead host. **G1**: the SOS path is never
   mocked, never "temporarily disabled", and carries a mandatory human gate.
   `CLAUDE.md` looping discipline forbids auto-merging SOS-path changes outright.
2. **It would violate golden rule 1** ("One Supabase project. Never introduce a second
   database or sync layer") by making the repo point at two projects at once mid-rewrite.
3. **These migrations are already applied to production.** Editing applied migration files
   changes history without changing the database — the cron rows in prod would still hold
   the old URL. A corrective migration would be required, not a text edit.
4. **It would undo a deliberate prior fix** — `index.html`'s comment (§1.2) shows the repo
   was already corrected in the opposite direction.

**Resolved 2026-08-11.** Lee confirmed `crpsuhoixfdhjugprbuc` against the dashboard and
directed: annotate the historical hits, fix the three placeholder bugs, and leave
`index.html`, `deploy-functions.yml` and the two cron migrations alone. That is what this
change does.

If the cutover is ever *revived*, it is a new project decision requiring its own plan
(secrets, data, function deploy, Vercel env, prod cron correction) under the human gate —
not a find-and-replace.

---

## 6. Stop condition (revised) — and how it verifies

The original condition was inverted (§0). The operative one is:

> Zero `cfwnrcogikjycjcobsay` or `qkfvojbcxaptufsepupo` hits outside `docs/archive` and the
> historical log.

**Interpretation, stated explicitly.** "Zero hits" is read as *zero hits that present either
ref as current or actionable* — not zero occurrences of the strings. Deleting the names
outright would erase the cancellation record Lee asked to have **annotated**, would gut two
runbooks whose entire subject is that project, and would make this audit unable to name what
it classifies. So every surviving occurrence outside `docs/archive` is now in exactly one of
these four buckets, and nothing else:

1. **`LEARN.md`** — the append-only historical log; the two wrong entries carry inline
   ⛔ SUPERSEDED banners.
2. **`CUTOVER_RUNBOOK.md` / `CUTOVER_CHECKLIST.md`** — ⛔-cancelled historical runbooks,
   banners re-confirmed 2026-08-11.
3. **`PROJECT_REFS.md`** (this file) — the audit record itself.
4. **Annotated status statements** in `CLAUDE.md`, `LAUNCH_SCOPE.md`,
   `LAUNCH_CHECKLIST.md`, `AUDIT_NIGHT.md`, `STATE.md`, `ice-alarm-espana-master-build-plan.md`
   — each naming the ref *as* CANCELLED (historical) or DEFERRED.

**Zero remain in any runtime or config file** — that part is literal and absolute:

```bash
# Must print nothing. Runtime/config surface only.
grep -rn 'cfwnrcogikjycjcobsay\|qkfvojbcxaptufsepupo\|YOUR_SUPABASE_PROJECT_REF' \
  index.html vercel.json vite.config.ts .env.example \
  src/ supabase/functions/ supabase/migrations/ .github/
```

---

## 5. Reproducing this audit

```bash
for ref in crpsuhoixfdhjugprbuc cfwnrcogikjycjcobsay qkfvojbcxaptufsepupo pduhccavshrhfkfbjgmj; do
  echo "=== $ref"
  grep -rn "$ref" . --exclude-dir=.git --exclude-dir=node_modules \
                    --exclude-dir=dist --exclude-dir=test-results
done
grep -rn 'YOUR_SUPABASE_PROJECT_REF' . --exclude-dir=.git --exclude-dir=node_modules \
                                       --exclude-dir=dist --exclude-dir=test-results
```


## External names (ICE rebrand, 2026-09-02; infrastructure renamed 2026-09-03)

The 2026-09-02 rebrand renamed the product only, and this section recorded the
infrastructure names as deliberately left alone. Two of them have since been
renamed, so the record is updated rather than left contradicting reality:

- Supabase project — **renamed** `care-conneqt-prod` → **`ice-alarm-espana-prod`**
  (2026-09-03). Ref unchanged: `crpsuhoixfdhjugprbuc`. Nothing in the repo keys off
  the display name.
- GitHub repo — **renamed** `VirtueleThuiszorg/care-conneqt-platform` →
  **`VirtueleThuiszorg/ice-alarm-espana-platform`**. GitHub redirects the old path, so
  existing remotes and API calls keep working; re-point remotes at your convenience,
  not urgently.
- The Vercel project linked to it — not verified renamed. Treat as unchanged until
  someone checks the dashboard.

`package.json` `name` was changed to `ice-alarm-espana-platform` in the rebrand; it is
an npm field with no external consumer.

**Do not confuse the two ICE-named projects.** `qkfvojbcxaptufsepupo` is *also* named for
the ICE brand and is the **empty, DEFERRED** project — never a deploy target. Production
is the *ref* `crpsuhoixfdhjugprbuc`, not whichever project has "ice-alarm" in its name.
