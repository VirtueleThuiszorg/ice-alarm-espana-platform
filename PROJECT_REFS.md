# PROJECT_REFS.md — every Supabase project-ref reference in this repo

> Audit produced 2026-08-11. Scope: every tracked file outside `node_modules/`,
> `dist/`, `test-results/`. Purpose: resolve the two-Supabase-project split by
> establishing, **from repo evidence rather than from any single doc's claim**,
> which project ref is authoritative — then classify every reference as CURRENT,
> HISTORICAL, or BUG.

---

## 0. Verdict

**`crpsuhoixfdhjugprbuc` (care-conneqt-prod, LifeLink Sync org, Pro) is authoritative.**

The `/goal` that commissioned this audit quoted `LEARN.md` **2026-06-17**, which states
that `cfwnrcogikjycjcobsay` is live and `crpsuhoixfdhjugprbuc` is stale. **That entry was
superseded five weeks later and is now false.** It is retained in the log because
`LEARN.md` §4 is explicitly append-only ("Never delete entries") — its presence is not
an assertion of current truth.

Consequently the goal's stop condition — *"`grep -rn 'crpsuhoixfdhjugprbuc'` returns zero
hits"* — is **inverted**: satisfying it would strip the live production ref out of the repo
and replace it with a project documented as CANCELLED. See §4 for why that is unsafe and
what was therefore *not* changed.

### Refs in play

| Ref | Project | Status |
|---|---|---|
| `crpsuhoixfdhjugprbuc` | care-conneqt-prod (LifeLink Sync, Pro) | ✅ **AUTHORITATIVE** — LOCKED 2026-07-22, `LAUNCH_SCOPE.md` §0 |
| `cfwnrcogikjycjcobsay` | Lee-owned migration target | ⛔ **CANCELLED** 2026-07-22 — never a deploy target again |
| `qkfvojbcxaptufsepupo` | empty (VirtueleThuiszorg org, Free) | 🗑️ to be **deleted** |
| `pduhccavshrhfkfbjgmj` | ICE (pre-rebrand Lovable Cloud) | ☠️ **dead** — "never touch" |

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
   `care-conneqt-master-build-plan.md` §Architecture line 40 all name
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
| `vercel.json` | 5 | `YOUR_SUPABASE_PROJECT_REF` | 🐛 **BUG** — unresolved placeholder, see §3.1 |
| `vite.config.ts` | 25 | `YOUR_SUPABASE_PROJECT_REF` | 🐛 **BUG** — unresolved placeholder, see §3.2 |
| `supabase/functions/_shared/email-templates/invite.tsx` | 35 | `YOUR_SUPABASE_PROJECT_REF` | 🐛 **BUG** — see §3.3 |
| `…/signup.tsx` | 37 | `YOUR_SUPABASE_PROJECT_REF` | 🐛 **BUG** — see §3.3 |
| `…/email-change.tsx` | 37 | `YOUR_SUPABASE_PROJECT_REF` | 🐛 **BUG** — see §3.3 |
| `…/recovery.tsx` | 32 | `YOUR_SUPABASE_PROJECT_REF` | 🐛 **BUG** — see §3.3 |
| `…/magic-link.tsx` | 32 | `YOUR_SUPABASE_PROJECT_REF` | 🐛 **BUG** — see §3.3 |
| `…/reauthentication.tsx` | 27 | `YOUR_SUPABASE_PROJECT_REF` | 🐛 **BUG** — see §3.3 |

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
| `care-conneqt-master-build-plan.md` | 40 |
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
| `LEARN.md` | 71, 81, 97, 102, 106, 107, 123, 130, 133, 238, 253, 255, 261, 262 | `cfwnrcogikjycjcobsay` | Append-only dated log; 2026-07-22 entry supersedes 2026-06-17 |
| `LEARN.md` | 82 | `qkfvojbcxaptufsepupo` | Records the delete decision |
| `LEARN.md` | 100, 262 | `pduhccavshrhfkfbjgmj` | Records "dead ICE, never touch" |
| `LEARN.md` | 67, 98, 122, 252, 260, 265, 268 | `crpsuhoixfdhjugprbuc` | Dated entries, incl. two self-flagged stale TODOs (122, 268) |
| `CUTOVER_RUNBOOK.md` | 1, 5, 7, 11, 15, 16, 25, 31, 232, 235, 253–256, 268, 269, 275, 298, 352, 362 | `cfwnrcogikjycjcobsay` | Whole doc is ⛔-cancelled at line 3–7 |
| `CUTOVER_RUNBOOK.md` | 353, 363 | `crpsuhoixfdhjugprbuc` | Cancelled plan's "retire the old project" steps |
| `CUTOVER_CHECKLIST.md` | 3, 8, 23, 45 | `cfwnrcogikjycjcobsay` | Whole doc is ⛔-cancelled at line 3 |
| `LAUNCH_SCOPE.md` | 16, 18 | cancelled + to-delete | States the cancellation/deletion decisions |
| `LAUNCH_CHECKLIST.md` | 87 | `qkfvojbcxaptufsepupo` | Open task: delete the empty project |
| `AUDIT_NIGHT.md` | 224 | `qkfvojbcxaptufsepupo` | Open prod task item 55 |
| `CLAUDE.md` | 59 | both cancelled refs | Names them *as* cancelled/to-delete — the useful form |
| `care-conneqt-master-build-plan.md` | 40 | `cfwnrcogikjycjcobsay` | Names it as CANCELLED |
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

## 3. Real bugs this audit found

None of these are the two-project split. All four are *unresolved-placeholder* or
*stale-predecessor* bugs that the split was masking.

### 3.1 `vercel.json:5` — sitemap rewrite points at a non-existent host
```
"destination": "https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/generate-sitemap"
```
`/sitemap.xml` in production resolves to an unregistered hostname → DNS failure. SEO
impact only, no safety impact. Introduced by the rebrand scrub of ICE's ref
(`REBRAND_CHECKLIST.md:142` says "Must be filled in Phase 2" — Phase 2 never filled it).

### 3.2 `vite.config.ts:25` — silent placeholder fallback
```
process.env.VITE_SUPABASE_URL ?? "https://YOUR_SUPABASE_PROJECT_REF.supabase.co"
```
A missing `.env` yields a client pointed at a dead host **and no startup error**. The file's
own line 21 TODO calls it an anti-pattern; `AUDIT_REPORT_2026-06.md:101` calls it
"de-fanged … still fails silently rather than loud". This conflicts with **G2 — fail safe,
loud, and logged — never silent**: auth is a critical path and this fails quietly. The fix
is to *throw* on missing env, not to substitute a better default.

### 3.3 Six email templates — broken logo URLs
`invite`, `signup`, `email-change`, `recovery`, `magic-link`, `reauthentication` all embed
`https://YOUR_SUPABASE_PROJECT_REF.supabase.co/storage/v1/object/public/email-assets/logo.png`.
Every transactional email renders a broken image. Per `REBRAND_CHECKLIST.md:143` this
*also* needs a Care Conneqt logo uploaded to `email-assets/logo.png` — so fixing the ref
alone is insufficient.

### 3.4 `TECHNICAL_SPEC.md:11,169` — names the dead ICE project as current
> "**Backend:** Lovable Cloud (Supabase project `pduhccavshrhfkfbjgmj`)"

Stated in the present tense as current architecture, not as history. `pduhccavshrhfkfbjgmj`
is the dead ICE ref ("never touch"), and the platform is no longer on Lovable Cloud at all
(`CLAUDE.md`: AI runs on the Anthropic API; Lovable is a "do not reintroduce" item). Line
169 also says "120 files" of migrations; the real count is **137**. This is a **G5 honesty**
defect in a doc that reads as current spec.

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

**Open decision for Lee.** Confirm the authoritative ref. If it is
`crpsuhoixfdhjugprbuc` (as all evidence indicates), the goal's stop condition should be
replaced with:

```
grep -rn 'cfwnrcogikjycjcobsay\|qkfvojbcxaptufsepupo' . \
  --exclude-dir=docs/archive --exclude-dir=.git --exclude-dir=node_modules
```
…returning only HISTORICAL hits per §2.3 — which is **already true today**. In that case
Concern 1's remaining work is §3's four bugs, not a ref migration.

If instead the cutover is being *revived*, that is a new project decision requiring its own
plan (secrets, data, function deploy, Vercel env, prod cron correction) under the human
gate — not a find-and-replace.

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
