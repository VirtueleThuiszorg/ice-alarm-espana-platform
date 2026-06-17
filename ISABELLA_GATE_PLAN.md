# ISABELLA_GATE_PLAN.md

> Pre-implementation plan for adding **server-side enforcement** of the Isabella
> per-function toggles (`public.isabella_settings.enabled`) — gating discretionary
> functions only, while **never** gating safety-critical ones.
> Date: **2026-06-16** · Status: **PLAN ONLY — nothing implemented.** · Read-only trace.
> Builds on `CRITICAL_VERIFICATION_2026-06.md` (toggles confirmed unenforced server-side).

---

## 1. Exposure — what is actually enabled

### 1a. Seed-default state (verified)

Source: `supabase/migrations/20260213142641_1b14a779-e38f-4260-b201-c76b08e4485b.sql`.
The migration seeds **19** of the 52 UI functions; **only `chat_widget` is `true`**, the
other 18 are `false`. The remaining **33 UI functions have NO row at all.**

| Seed-default | Functions |
|---|---|
| `enabled = true` (1) | `chat_widget` |
| `enabled = false` (18, seeded) | `abandoned_signup_recovery`, `b2b_outreach_campaigns`, `birthday_calls`, `courtesy_calls`, `device_offline_response`, `fall_detection_triage`, `followup_calls`, `inbound_email`, `inbound_phone_calls`, `inbound_sms`, `inbound_whatsapp`, `lead_followup_calls`, `low_battery_alerts`, `onboarding_checkins`, `partner_enquiry_handling`, `payment_reminders`, `sos_button_triage`, `welcome_calls` |
| **No row** (33) | all other UI functions (`emergency_escalation_alert`, `bulk_offline_alert`, the boss-intelligence, member-lifecycle, partner, content, compliance, and remaining device-infra functions, etc.) |

### 1b. Live production state — **NOT AVAILABLE in this environment**

A live `select function_key, enabled from public.isabella_settings` could **not** be run:
the Supabase project is not linked (`supabase projects list` → "Cannot find project ref";
no `supabase/.temp/`), there is no DB URL in any `.env`, and the Supabase MCP is not
authenticated. Per safety rules I did **not** authenticate or modify anything. **The
numbers above are seed-default only.** Lee (or an authenticated session) must run the
read-only query to confirm the real production enabled-set before relying on it.

### 1c. ⚠️ Why this exposure makes the fix dangerous if done naively

The existing helper `isIsabellaFunctionEnabled()` in
[src/lib/isabella-function-config.ts](src/lib/isabella-function-config.ts) ends with
`return data?.enabled ?? false` — it is **fail-closed**: a missing row *or* a failed
lookup yields `false` (disabled).

If a gate were bolted on using that semantics for every function, then **at the seed
state all four safety-critical functions would be BLOCKED**:

- `sos_button_triage` — seeded `false` → blocked
- `fall_detection_triage` — seeded `false` → blocked
- `emergency_escalation_alert` — **no row** → blocked
- `bulk_offline_alert` — **no row** → blocked

That is the exact opposite of what is acceptable for a life-safety service. It is the
central reason safety-critical functions must be **exempt from the gate entirely** (never
looked up, always fail-open), not merely "seeded true".

> Doc-drift note: `CLAUDE.md` §5 says "50 functions … lists all 50". The UI
> `FUNCTION_KEY_MAP` actually contains **52** functions (`ISABELLA_FUNCTION_CONFIG` has
> more, incl. 3 staff-rota functions not shown in the admin UI). Flagged, not yet fixed.

---

## 2. Classification of all 52 UI functions

Categories: **SAFETY-CRITICAL** (must always run; never gated; fail-open),
**DISCRETIONARY** (safe to gate honestly; fail-closed acceptable),
**UNSURE** (Lee decides). Capability/`critical` data from `ISABELLA_FUNCTION_CONFIG`.

### SAFETY-CRITICAL (4) — must NEVER be blocked by a toggle or a failed lookup

| Function | Reasoning |
|---|---|
| `sos_button_triage` | The SOS button path — the core life-safety function. `critical: true`. Must always triage/escalate. |
| `fall_detection_triage` | Fall-detection alert path; a fall on a vulnerable person is a medical emergency. `critical: true`. |
| `emergency_escalation_alert` | Notifies admin + call-centre on real emergencies (`alert.escalated_to_human`). `critical: true`. Suppressing it would silence the emergency-notification chain. |
| `bulk_offline_alert` | Mass device outage = fleet-wide loss of emergency coverage. `critical: true`. The alert itself must fire regardless of toggles. |

### UNSURE (7) — flag for Lee

| Function | Reasoning |
|---|---|
| `device_offline_response` | A single device going offline can mask a real emergency (pendant smashed in a fall, member unreachable) but is often benign (battery/coverage). Acuity below SOS — Lee to decide if it joins safety-critical. |
| `inbound_phone_calls` | Inbound voice can be a live emergency channel. Safe to gate **only if** a human/Twilio fallback always answers when Isabella is off; otherwise gating could drop emergency calls. |
| `inactivity_check` | Extended device inactivity can be a welfare signal for an isolated member, but the action is a gentle outreach, not dispatch. Borderline. |
| `gdpr_deletion_request` | `critical: true`, but legal-critical, not life-safety. Should likely be "never silently gated" on a compliance axis rather than the safety axis. |
| `gdpr_export_request` | Legal/compliance obligation tracking; same axis question as deletion. |
| `sla_breach_alert` | `critical: true`. If the SLA in question is emergency-response time, this is safety-adjacent; if purely contractual, discretionary. Depends on which SLAs it tracks. |
| `audit_anomaly_detection` | Security/audit signal — suppressing it could hide an active incident. Not life-safety, but arguably should not be silently gated. |

### DISCRETIONARY (41) — safe to gate honestly (fail-closed acceptable)

`low_battery_alerts`, `inbound_sms`, `inbound_whatsapp`, `inbound_email`, `chat_widget`,
`courtesy_calls`, `welcome_calls`, `onboarding_checkins`, `payment_reminders`,
`followup_calls`, `birthday_calls`, `lead_followup_calls`, `abandoned_signup_recovery`,
`partner_enquiry_handling`, `b2b_outreach_campaigns`, `new_sale_notification`,
`cancellation_alert`, `failed_payment_escalation`, `daily_boss_briefing`,
`weekly_revenue_summary`, `negative_feedback_alert`, `membership_anniversary`,
`subscription_renewal_reminder`, `medical_profile_incomplete`, `device_not_activated`,
`upgrade_suggestion`, `stock_low_alert`, `device_health_monitor`, `sim_expiry_warning`,
`provisioning_stalled`, `new_partner_signup`, `partner_first_referral`,
`partner_commission_due`, `partner_inactive_warning`, `partner_agreement_expiring`,
`auto_generate_scheduled_content`, `content_approval_reminder`,
`auto_publish_approved_content`, `blog_post_performance`, `social_engagement_alert`,
`operational_cost_due`.

Reasoning (shared): these are engagement, marketing, sales, owner-reporting, partner,
content, and non-urgent operational/finance functions. None is on the life-safety path;
honestly disabling them (and a failed settings lookup defaulting to "off") causes no
safety harm — only missed convenience/automation.

> **Sub-capability caveat (important for the design):** several discretionary inbound
> functions (`inbound_sms`, `inbound_whatsapp`, `inbound_email`, `chat_widget`) carry an
> `escalate` capability. Gating should suppress only Isabella's *autonomous response*, never
> the *escalate-to-human* path — a distressed contact reaching out on these channels must
> still be able to reach a human even when the auto-responder is off.

---

## 3. Proposed gate design (prose only — NOT implemented)

### Where the helper would sit

A single shared gate in `supabase/functions/_shared/` (e.g. `isabella-gate.ts`), imported
by the execution paths (`ai-run`, `ai-execute-action`, and the dispatch paths in
`ai-dispatch-events`). One canonical implementation, one place to audit — mirroring how
`_shared/cors.ts` and `_shared/post-payment.ts` are already shared. The frontend helper in
`isabella-function-config.ts` stays as-is (UI display); enforcement lives server-side.

### A static safety-critical allowlist, baked into code (not the DB)

The set of SAFETY-CRITICAL function keys would be a **hardcoded constant in the shared
gate**, not a DB flag. The gate would, as its very first step, check membership in that
allowlist and **return "allowed" immediately** for any safety-critical key — without ever
querying `isabella_settings`. This guarantees that neither a toggle set to `false`, a
missing row, nor a DB outage can ever block SOS/fall/emergency paths. Deriving the list
from code (cross-checked against `ISABELLA_FUNCTION_CONFIG.critical`) keeps it out of
reach of the admin UI entirely.

### Per-category treatment

- **SAFETY-CRITICAL →** never gated. Gate short-circuits to "run". No DB read. **Fail-open
  by construction.** (Optionally: log that a safety-critical function ran while its toggle
  was off, for observability — but never block.)
- **DISCRETIONARY →** gated honestly. Gate reads `isabella_settings.enabled` for the key.
  **Fail-closed is acceptable** *for the disabled decision* — if the row says `false`,
  don't run. However, a **DB/lookup error should be distinguished from an explicit
  `false`**: on transient error the gate should prefer to allow-and-log (so a flaky DB
  doesn't silently halt all automation), whereas an explicit `false` means "off". This is
  a deliberate refinement over the current `?? false` helper.
- **UNSURE →** **do not gate until Lee classifies them.** Until then, treat as
  pass-through (run, do not block) so the fix cannot accidentally suppress a possibly
  safety-relevant path. Revisit once §2 UNSURE rows are decided.

### The fail-open rule (the core safety guarantee)

> No code path that can affect SOS, fall detection, emergency escalation, or fleet-outage
> alerting may be made conditional on a successful `isabella_settings` read. Safety-critical
> functions are exempt from the gate at the code level (static allowlist, checked before any
> DB access), so they continue to run even if the settings table is misconfigured,
> unseeded, or unreachable. The gate may only ever *prevent* a DISCRETIONARY function from
> running, and even then it should allow-and-log on infrastructure error rather than
> fail silent.

### Open items before implementation

1. **Lee to classify the 7 UNSURE functions** (§2).
2. **Confirm live production enabled-set** (§1b) once an authenticated/linked session is
   available — the seed-default is not necessarily prod.
3. **Decide the discretionary error-handling policy** (allow-and-log on DB error vs strict
   fail-closed) — recommended: allow-and-log, to avoid a DB blip halting all automation.
4. **Seed/normalise rows** for any discretionary function lacking a row, so "no row" is not
   confused with "explicitly off" (separate migration; out of scope here).
