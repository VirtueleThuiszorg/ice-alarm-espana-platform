# SPEC_GAP_ANALYSIS.md — TECHNICAL_SPEC vs current code

> READ-ONLY analysis. Date: **2026-06-16.** Baseline: current working tree
> (branch `feat/stripe-billing-actions`; deltas vs `main` noted).
> **Spec file:** the request named `SYSTEM_SPEC_REFERENCE.md` but no such file exists —
> the spec in the repo is **`TECHNICAL_SPEC.md`** (ICE Alarm España, generated 2026-06-16).
> Analysed that. Tags: **CONCERN** (should be there / safety-relevant) ·
> **DRIFT** (spec & code out of sync — update one) · **EXPECTED** (known rebrand/new work).
>
> **Headline:** the code substantially matches the spec. Routes, edge functions, and the
> SOS/§7.3 flow are essentially intact. The two most safety-critical Isabella rules
> (no emergency-service dispatch; false-alarm autonomous-resolve gate) **are code-enforced**.
> Most differences are stale spec counts (DRIFT) and rebrand/new-feature additions (EXPECTED).

---

## CONCERN (review first)

| # | Item | Evidence | Why it matters |
|---|---|---|---|
| C1 | **9 of 15 Isabella "non-negotiables" are PROMPT-ONLY, not code-enforced** | §6.3 rules #1,#3,#6,#7,#8,#9,#10,#11,#14 live only in agent system prompts (DB `ai_agent_configs` + the hardcoded fallback prompts in `ai-run/index.ts`). No code gate. | They depend entirely on the LLM obeying the prompt — a model error or prompt-injection could bypass medical-advice ban, identity verification, language lock, etc. Inherent to LLM agents, but should be a conscious risk acceptance for a life-safety service. **The 2 truly critical ones are NOT in this set — they're coded (see below).** |
| C2 | **`isabella_settings` toggles were not enforced server-side** (spec §6.2 implies they gate functions) | Confirmed earlier this session (`CRITICAL_VERIFICATION_2026-06.md`). **Resolved** by the `isabella-gate` work — merged to `main`, but **not yet deployed** to the new project. | Until deployed, toggling a discretionary function off does not stop it. Deploy is Step D of the cutover. Tracking, not a code gap. |
| C3 | **`feedback` table is in the spec (§3.8) but never created by any migration** | Agent diff: no `CREATE TABLE … feedback`. `FeedbackDashboardPage` reads `activity_logs` (entity=feedback), not a `feedback` table. | On the clean-start project there is no `feedback` table. Page still works (uses activity_logs), so low impact — but the spec is wrong. Confirm nothing else expects a `feedback` table. |
| C4 | **`ev07b-sos-alert` auth is a shared `x-api-key`, not HMAC** | Spec §7.3 says "POST ev07b-sos-alert (HMAC verify)"; code uses `req.headers.get("x-api-key")` vs `EV07B_CHECKIN_KEY` ([ev07b-sos-alert/index.ts:46-47](supabase/functions/ev07b-sos-alert/index.ts#L46)). | The SOS ingress is a static-secret check, weaker than the HMAC the spec implies. Acceptable, but the spec over-states the control. Decide whether HMAC is required before launch. |

> **The two safety rules you specifically called out are confirmed ENFORCED in code:**
> - **Emergency-services (#2):** no function dispatches/claims emergency services. The
>   deterministic path notifies the member's **emergency contacts** and the message says
>   *"Call 112 if necessary"* ([emergency-contact-notify/index.ts:131-132](supabase/functions/emergency-contact-notify/index.ts#L131)) — advisory to family, never an auto-dispatch.
> - **False-alarm gate (#12):** code-enforced in [sos-false-alarm-resolve/index.ts](supabase/functions/sos-false-alarm-resolve/index.ts) — requires ≥2 member responses ([:67-87](supabase/functions/sos-false-alarm-resolve/index.ts#L67)), refuses if any staff is in the conference ([:89-105](supabase/functions/sos-false-alarm-resolve/index.ts#L89)), only acts on incoming/in_progress ([:57](supabase/functions/sos-false-alarm-resolve/index.ts#L57)), logs a critical flag on refusal, and **never notifies emergency contacts**.

---

## Isabella §6.3 non-negotiables — enforcement map

| # | Rule | Enforcement |
|---|---|---|
| 1 | No medical advice | **Prompt-only** (ai_agent_configs / ai-run prompts) |
| 2 | Never claim/dispatch emergency services | **Code (by design)** — no dispatch fn; emergency-contact-notify says "call 112" |
| 3 | No outcome claims ("saves life" etc.) | **Prompt-only** (incl. Media Manager forbidden-phrases) |
| 4 | Never auto-publish content | **Partial code** — Media Manager `draft_only`; `auto_publish_approved_content` now gated by the merged `isabella-gate` (discretionary) |
| 5 | No autonomous sensitive-data mod | **Partial code** — `ai-execute-action` validates action_type vs `write_permissions`; rest prompt |
| 6 | No identity verify on outbound calls | **Prompt-only** |
| 7 | `[ESCALATE]` after 2 failed verifications | **Prompt-only** |
| 8 | Reason-first inbound handling | **Prompt-only** |
| 9 | Risk-based verification (Name+DOB+NIE) | **Prompt-only** |
| 10 | Language lock (no EN/ES mixing) | **Prompt-only** (reinforced by `languageInstruction` in ai-run) |
| 11 | Voice cadence (1–2 sentences) | **Prompt-only** (voiceInstructions in ai-run) |
| 12 | False-alarm autonomous-resolve gates | **Code-enforced** ✅ (`sos-false-alarm-resolve`) |
| 13 | Main Brain WhatsApp only for `sale.paid` | **Code** — `notify-admin` gates `sale.paid` on `whatsapp_paid_sales` ([:210-211](supabase/functions/notify-admin/index.ts#L210)) |
| 14 | Main Brain notifies in English | **Prompt-only** |
| 15 | "Always Human" excluded functions | **Code (UI list, advisory)** — `ALWAYS_HUMAN` ([IsabellaOperationsPage.tsx:152-156](src/pages/admin/IsabellaOperationsPage.tsx#L152)): emergency dispatch, physical handling, bank transfers, large refunds |

---

## DRIFT (spec ↔ code out of sync — update the spec)

| Area | Spec says | Actual | Tag |
|---|---|---|---|
| Tables | 105 | **112** distinct `public` tables created by migrations | DRIFT |
| Migration files | 120 | **123** | DRIFT |
| `products` columns | 11 | **+9** catalog columns (`slug`, `status`, `category`, `display_order`, `hero_image_url`, 4× `*_i18n`) via `20260420090000` | DRIFT |
| Tables not in spec | — | `webhook_events`, `shift_escalation_chain`, `staff_invites` | DRIFT |
| Routes not in spec | — | `/products`, `/products/:slug`, `/admin/products` (product catalog) | DRIFT (also EXPECTED — new feature) |
| Edge functions | 89 | `main` = **89 (match)**; working tree +`admin-subscription-action` (90) | DRIFT/EXPECTED |
| `feedback` table | listed §3.8 | not created in migrations | DRIFT (see C3) |
| SOS ingress auth | "HMAC verify" | `x-api-key` shared secret | DRIFT (see C4) |
| Backend project | `pduhccavshrhfkfbjgmj` | that's the **dead ICE ref**; live target now `cfwnrcogikjycjcobsay` (migration in progress) | DRIFT (see EXPECTED) |

**Routes:** SPEC-ONLY = none (every spec route still exists). CODE-ONLY = the 3 product-catalog routes. `/partner-dashboard` prefix matches. `/pendant` still renders `PendantPage` in this baseline (note: the `broken-link-fixes` branch redirects it to `/products/pendant` — not yet on main).

**Edge functions:** SPEC-ONLY = none (all 89 spec functions present, zero renames/removals). CODE-ONLY = `admin-subscription-action` (this session). `bootstrap-admin` is on its own branch, not this baseline.

---

## EXPECTED (known rebrand / new work — not defects)

| Item | Note |
|---|---|
| Brand | Spec is "ICE Alarm España"; code is rebranded **Care Conneqt** (same schema/logic — rebrand not rewrite). |
| ICE email leftovers | Spec §5.4 cites brand color `#E74C3C` + domain `notify.icehealthsync.com` — both are CLAUDE.md §11 pre-launch fixes (member/SEO-facing ICE debt). |
| Project ref | ICE `pduhccavshrhfkfbjgmj` → Care `crpsuhoixfdhjugprbuc` → migrating to Lee-owned `cfwnrcogikjycjcobsay` (clean start). |
| AI gateway (§5.10) | Spec = Lovable gateway via `LOVABLE_API_KEY`. **Current code STILL uses Lovable** (`ai.gateway.lovable.dev`) — **no drift**. Planned swap to Claude/Anthropic API is post-cutover (CLAUDE.md §4), not yet in code. |
| Product catalog | New feature (routes + `products` columns + seed) added after the spec. |
| Session additions | `isabella-gate` (merged to main), `admin-subscription-action` + `bootstrap-admin` (feature branches), order detail / broken-link fixes (branch). |

---

## §7.3 SOS / fall flow — verification

**Matches the spec, with the safety net confirmed Isabella-independent.** Pendant → `gps-gateway` (GT06) → `ev07b-sos-alert` inserts the `alerts` row, then deterministically fires `emergency-contact-notify` + `partner-alert-notify` + `notify-admin` with **no Isabella/toggle dependency** (verified this session). The toggle-gated `sos_button_triage`/`fall_detection_triage` → conference/voice layer is the *enhancement*; the deterministic notify + `sos-escalation-runner` 5-level chain is the *always-on safety net*. Resolutions match: staff `sos-alert-resolve`, Isabella `sos-false-alarm-resolve` (gated). Only deviation: ingress auth is `x-api-key`, not HMAC (C4).

---

## Recommended doc actions
- **Update `TECHNICAL_SPEC.md`** (it is the stale side for counts): 105→112 tables, 120→123 migrations, products column count, add product-catalog routes + the 3 new tables, and either correct the `feedback` table or remove it. Update the project ref and the HMAC claim.
- **Decide (Lee):** HMAC on `ev07b-sos-alert` (C4); whether any prompt-only non-negotiable (C1) warrants a code gate (e.g. a server-side block on outbound-call verification).
