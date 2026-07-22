# STAGE_0B_PLAN.md — Backend Sync (plan for sign-off)

> **Status: PLAN — awaiting Lee's approval. NOTHING executes on prod until approved.**
> Human gate applies (touches the SOS/escalation path, cron, and prod schema).
> Created 2026-07-22. Backend: `crpsuhoixfdhjugprbuc` (care-conneqt-prod).

## Relay constraint (how this runs)

CC does **not** write to prod autonomously. Every prod action below is either (a)
run by Lee, or (b) run by CC **only after** Lee approves **and** a working
`SUPABASE_ACCESS_TOKEN` is present in the execution sandbox (it is currently NOT —
Stage-0 items 1–4 stay blocked until it is). `STATE.md` is updated **per step**,
and each "VERIFIED" line names **who ran it + the evidence** (never "looks done").

## Findings accepted (from Lee's Stage-0 report)
- **5 unapplied migrations** in the repo vs prod (incl. `pricing_source` — Prompt 4 depends on it).
- **3 migrations use the broken cron pattern** `current_setting('app.settings.supabase_url')` (no `missing_ok`) → throws "unrecognized configuration parameter" every fire ≈ the **~694 errors/day**. Of these, **2 are already applied**, **1 is unapplied**.
- **2 edge functions never deployed** to prod.
- **No CI deploy pipeline** → deployed functions silently drift from `main`.

---

## 1. Fix the broken cron pattern

### Decision (robust fix)
Each broken cron does `net.http_post(url := current_setting('app.settings.supabase_url') || '/functions/v1/…', headers := … 'Bearer ' || current_setting('app.settings.service_role_key'))`. **Two** GUCs — one public (URL), one **secret** (service-role key). So:

- **URL → hardcode the public project URL** in the cron SQL: `https://crpsuhoixfdhjugprbuc.supabase.co`. It is not a secret, and the backend is LOCKED (LAUNCH_SCOPE §0). Removes the `app.settings.supabase_url` GUC dependency entirely.
- **Service-role key → Supabase Vault** (recommended) read via `vault.decrypted_secrets`. The key is **set once by Lee, out of band** (dashboard/SQL), **never committed** (golden rule #9). Each cron body **guards**: if the secret is missing it `RAISE WARNING` + returns (observable, no hard error) instead of throwing.
  - *Alternative if Vault is undesirable:* `ALTER DATABASE postgres SET app.settings.service_role_key = '<key>'` run **manually by Lee** (out of band, not in git) + read with `current_setting('app.settings.service_role_key', true)` (the `, true` = `missing_ok`, which alone stops the exception spike). Vault is preferred (encrypted at rest, rotation-friendly).

### Fixed cron template (applied to all 4 scheduled calls)
```sql
SELECT cron.schedule('<job-name>', '<schedule>', $CRON$
DO $$
DECLARE v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF v_key IS NULL THEN
    RAISE WARNING 'cron <job-name>: service_role_key missing from Vault — skipped';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := 'https://crpsuhoixfdhjugprbuc.supabase.co/functions/v1/<fn>',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
    body    := '<body>'::jsonb
  );
END $$;
$CRON$);
```

### Where the fix lands
- **Unapplied file — edit in place** (not yet on prod, so no corrective migration needed):
  `supabase/migrations/20260716120000_sos_escalation_cron.sql` — rewrite its 2 crons (`sos-escalation-runner`, `staff-shift-monitor`) to the fixed template.
- **New corrective migration** for the **2 already-applied** broken crons:
  `supabase/migrations/20260723120000_fix_cron_url_and_auth.sql` — `cron.unschedule(...)` then re-`cron.schedule(...)` with the fixed template for:
  - `ev07b-offline-monitor` (from applied `20260301100000_ev07b_offline_cron.sql`)
  - `shift-daily-reminders` (from applied `20260301150000_staff_rota_holidays.sql`)
  (Already-applied migrations are immutable — we correct forward, never edit them.)

> **Prerequisite (Lee, out of band, before the crons can succeed):** create the Vault secret
> `service_role_key` on prod (Dashboard → Project Settings → Vault, or
> `select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');`). Not in git.

---

## 2. Apply the 5 unapplied migrations to prod (ordered)

`supabase db push` applies in timestamp order. Final ordered set (after item 1 edits + folding in item 5's migration):

1. `20260616120000_bootstrap_first_admin.sql`
2. `20260617120000_pricing_source.sql`  ← **Prompt 4 review depends on this being live**
3. `20260617130000_fix_bootstrap_first_admin_is_active.sql`
4. `20260716120000_sos_escalation_cron.sql`  *(FIXED per item 1)*
5. `20260716130000_alert_escalations_call_placed.sql`  *(from the escalation-fail-loud branch — item 5; requires that branch merged first)*
6. `20260722120000_deactivate_non_pendant_products.sql`
7. `20260723120000_fix_cron_url_and_auth.sql`  *(new corrective — item 1)*

**Gate:** run `supabase migration list` first (read-only) to confirm local-vs-remote drift matches the accepted finding; `supabase db push --dry-run` to preview; then push. Take a Dashboard backup/point-in-time note before the push.

---

## 3. Redeploy ALL edge functions + CI deploy pipeline

### One-time full redeploy (covers the 2 never-deployed)
- `supabase functions deploy` (all functions, from `main`) against `crpsuhoixfdhjugprbuc`. Redeploying **everything** guarantees the 2 never-deployed ones land regardless of which they are; confirm by diffing the deployed list before/after. `deploy` reads `supabase/config.toml`, so per-function `verify_jwt` (e.g. SOS ingress `verify_jwt=false`) is preserved.
- **Sequencing:** land the escalation-fail-loud branch (item 5) **before** this deploy so the deployed `sos-escalation-runner` is the fail-loud version.

### New CI pipeline (so functions never silently go stale)
New workflow `.github/workflows/deploy-functions.yml` — on push to `main`:
```yaml
name: Deploy Edge Functions
on:
  push:
    branches: [main]
    paths: ['supabase/functions/**', 'supabase/config.toml']
concurrency: { group: deploy-functions-${{ github.ref }}, cancel-in-progress: false }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```
- **Repo secrets Lee must add:** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF=crpsuhoixfdhjugprbuc`.
- Also add a **DB-migration deploy** step/job (`supabase db push`) OR keep migrations manual under the human gate — **recommend migrations stay manual** (schema changes are higher-risk than function deploys); functions auto-deploy.
- **LAUNCH_CHECKLIST hard blocker to add:** *"Edge-function CI deploy pipeline live + green on main (functions provably match `main`, never hand-deployed)."*

---

## 4. Verification (evidence each step actually worked)

| Claim | How it's proven |
|---|---|
| Crons fire **without error, 24h clean** | `SELECT jobname, status, count(*) FROM cron.job_run_details WHERE start_time > now()-interval '24h' GROUP BY 1,2;` → the 4 jobs show `succeeded`, **0** `failed`. (Re-check after the Vault secret is set.) |
| **Offline-monitor detects** a test offline device | Insert a test `member_devices` row with `last_seen` older than the offline threshold; wait one cron tick; confirm `ev07b-offline-monitor` created the expected alert/`alert_communications` row; then clean up the test row. |
| **SOS escalation runner fails loud** | With the fail-loud runner deployed (item 5): force a sweep error (or missing Vault secret) and confirm a **LOUD `system.runner_failure` admin alert** fires + heartbeat logged — not a silent swallow. Covered by `src/test/escalationOutcome.test.ts`; confirm on prod once. |
| **Pricing tables live** | `SELECT * FROM pricing_plans;` / `pricing_settings` return the seeded rows; confirm `submit-registration` computes the charge from them (it already fails-closed if unset — STATE.md §2). |

---

## 5. Fold in `sos/escalation-fail-loud` (inventory + sequence)

**Branch inventory (`origin/sos/escalation-fail-loud`, 1 commit `1c3f255`):**
- `supabase/functions/sos-escalation-runner/index.ts` — major rework (fail-loud: LOUD admin alert on sweep/fatal error, heartbeat).
- `supabase/functions/_shared/escalation-outcome.ts` — **new** shared helper.
- `supabase/functions/notify-admin/index.ts` — change (supports the runner-failure alert).
- `src/test/escalationOutcome.test.ts` — **new** test (100 lines).
- `supabase/migrations/20260716130000_alert_escalations_call_placed.sql` — **new** migration.
- `STATE.md` — 1-line update.

**Sequence:** this is **SOS-path → human gate to merge.** Order: (1) Lee reviews + merges `sos/escalation-fail-loud` to `main` (or CC opens a PR for review); (2) its migration `20260716130000` joins the ordered push (item 2 step 5); (3) the function redeploy (item 3) then ships the fail-loud runner. Do **not** deploy the old runner and the new one out of order. *(Related branches noted in the Prompt-0 inventory — `sos/escalation-spec-failing-e2e`, `sos/wire-escalation-cron` — should be reconciled/closed against this; flag for Lee.)*

---

## 6. STATE.md updates (made per step, evidence-based)
- **Stage 0 items 1–4:** BLOCKED → real status (linked ref, migration diff, function diff, error-spike root cause = the cron GUC exception).
- **New "Stage 0b" section:** cron fix applied (which files/migration), 5 migrations pushed, functions redeployed + CI pipeline live, escalation-fail-loud landed, verification results (24h cron-clean, offline-monitor test, fail-loud proof, pricing live).
- **§1 SOS table:** escalation runner now fail-loud + crons firing cleanly (upgrade the 🟡/⬜ rows with named evidence).
- **Relay note:** each line records who ran the prod step and the proof.

---

## Execution order (once approved)
1. Lee: add Vault `service_role_key` + repo secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`).
2. CC: edit unapplied cron migration + write corrective cron migration (repo change, PR, human-gate review — SOS/cron).
3. Lee: review + merge `sos/escalation-fail-loud` (SOS human gate).
4. `supabase migration list` (read-only) → `db push --dry-run` → `db push` (ordered set).
5. `supabase functions deploy` (all) + add the deploy workflow + repo secrets.
6. Run the item-4 verifications; update STATE.md with evidence.
7. Add the CI-deploy LAUNCH_CHECKLIST hard blocker; tick items as verified.

## Open question for Lee
- **Vault vs `ALTER DATABASE` GUC** for the service-role key (item 1) — confirm the approach.
- Item 1 says "apply the fix to the unapplied migration files **now**", but the top-level instruction is "nothing executes / no changes yet." **Confirm:** may CC make the **repo-only** migration edits (unapplied file + new corrective migration) now as a PR for review, or hold those too until sign-off? (No prod action either way.)
