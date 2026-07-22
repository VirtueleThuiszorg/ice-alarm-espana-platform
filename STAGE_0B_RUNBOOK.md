# STAGE_0B_RUNBOOK.md — copy-paste execution (tokened terminal)

> Approved (Lee, 2026-07-22). Run in the **tokened terminal session** on `main`,
> repo root. Prod = `crpsuhoixfdhjugprbuc`. Companion to `STAGE_0B_PLAN.md`.
> **Human gate:** touches SOS/escalation, cron, prod schema, function deploys.

---

## STEP 0 — Out-of-band prerequisites (do once, before the commands)

### (a) Vault secret for the crons (prod SQL editor, service role)
The fixed crons read the service-role key from Vault. Create it once — **never in git**:
```sql
-- Paste the project's SERVICE ROLE key in place of the placeholder:
SELECT vault.create_secret(
  '<PASTE_SERVICE_ROLE_KEY_HERE>',
  'service_role_key',
  'pg_cron -> edge function auth (STAGE_0B)'
);

-- Verify (shows the NAME only, never the value):
SELECT name FROM vault.secrets WHERE name = 'service_role_key';
```

### (b) GitHub repo secrets — for the deploy-functions CI (Settings → Secrets and variables → Actions)
Add exactly these two **repository secrets**:

| Secret name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | a Supabase personal access token for the **LifeLink Sync** org |
| `SUPABASE_PROJECT_REF` | `crpsuhoixfdhjugprbuc` |

### (c) DECISION before pushing — `sos/escalation-fail-loud`
That branch (adds migration `20260716130000_alert_escalations_call_placed.sql`,
`_shared/escalation-outcome.ts`, and escalation-runner refinements) is **still
unmerged** (SOS human gate). Choose one:
- **Merge it first** (recommended) → its migration joins this push and the
  refined runner deploys in the same pass; **or**
- **Defer it** → Stage 0b runs on the current `main` runner (which already has
  base `system.runner_failure` alerting) and the branch folds in a later pass.
Do NOT push migration `20260716130000` without also deploying the matching
runner code (they reference the same `alert_escalations` columns).

---

## STEP 1 — Link + preview (READ-ONLY, safe)
```bash
export SUPABASE_ACCESS_TOKEN='<token>'
supabase link --project-ref crpsuhoixfdhjugprbuc   # may prompt for the DB password
supabase migration list                            # confirm the ~6 unapplied migrations
supabase db push --dry-run                         # preview exactly what will run
```
**Gate:** the dry-run lists only the intended migrations (bootstrap_first_admin,
pricing_source, fix_bootstrap_first_admin_is_active, sos_escalation_cron [FIXED],
deactivate_non_pendant_products, fix_cron_url_and_auth [+ alert_escalations_call_placed
if the branch was merged in STEP 0c]). If anything unexpected appears, STOP.

## STEP 2 — Apply migrations
```bash
supabase db push
```

## STEP 3 — Redeploy ALL edge functions (covers the 2 never-deployed + refreshes all 89)
```bash
supabase functions deploy --project-ref crpsuhoixfdhjugprbuc
```
*(Honours per-function `verify_jwt` from `supabase/config.toml` — SOS ingress stays `verify_jwt=false`.)*
After this, future function changes on `main` auto-deploy via `.github/workflows/deploy-functions.yml`.

---

## STEP 4 — Verifications (evidence — record outputs for STATE.md)
```sql
-- (i) crons scheduled with the fixed pattern
SELECT jobname, schedule, active FROM cron.job
 WHERE jobname IN ('sos-escalation-runner','staff-shift-monitor','ev07b-offline-monitor','shift-daily-reminders');

-- (ii) 24h error window — must trend to ZERO failures after the fix + Vault secret
SELECT jobname, status, count(*)
  FROM cron.job_run_details
 WHERE start_time > now() - interval '24 hours'
 GROUP BY 1,2 ORDER BY 1,2;

-- (iii) pricing tables live (Prompt 4 depends on this)
SELECT * FROM pricing_plans;
SELECT * FROM pricing_settings;   -- (whichever the pricing_source migration created)
```
```bash
# (iv) offline-monitor detects a test offline device:
#   insert a member_devices row with last_seen older than the offline threshold,
#   wait one 2-min tick, confirm ev07b-offline-monitor created the expected alert,
#   then delete the test row.
# (v) escalation runner fail-loud: force a sweep error (or leave the Vault secret
#   briefly unset) and confirm a LOUD system.runner_failure admin alert fires.
```

## STEP 5 — go/no-go
- **24h cron-clean window:** re-run query (ii) 24h after STEP 2/Vault-secret. **GO** only when the four jobs show `succeeded` and **zero** `failed` across the window.
- Report results back; CC updates `STATE.md` + `LAUNCH_CHECKLIST.md` with the evidence and posts the go/no-go.

---

## Rollback (if a step misbehaves)
- Migrations: `supabase migration repair` / restore from the pre-push PITR snapshot (take one before STEP 2).
- Crons: `SELECT cron.unschedule('<jobname>');` for any misbehaving job.
- Functions: redeploy the prior version from a previous commit.
