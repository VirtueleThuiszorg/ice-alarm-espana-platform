# RECONCILE.md — three decisions the human must make

> Produced by the Truth Audit (2026-06-18), alongside `STATE.md`. This file states facts and
> frames decisions; it changes no code and recommends no deletions. Nothing here is acted on
> until Lee decides. All findings are from static source/migration review (file:line cited).

---

## 1. The AI situation — Isabella vs Clara

**Fact: "Clara" does not exist in the codebase. The real, wired-in assistant is "Isabella" (a.k.a. "Isabel"), and it runs on the Lovable AI gateway — both of which contradict CLAUDE.md.**

- **Reference counts:** `isabella` ≈ **548** in `src/`, ≈ **76** in `supabase/functions/`. `clara` = **3** hits in `src/`, all false positives (Spanish "clara"/"claramente" in `src/i18n/locales/es.json`), **0** in functions.
- **The persona is even internally inconsistent:**
  - Chat system prompt: **"Isabel"** — `supabase/functions/ai-run/index.ts:28`.
  - Voice greeting: **"Isabel"** — `src/components/admin/settings/VoiceSettingsSection.tsx:37-38`.
  - Voice conference handler: **"Isabella"** — `supabase/functions/isabella-voice-handler/index.ts:93-94`.
  - Chat widget UI label: neither — `t("chat.assistantName","Care Conneqt Assistant")` (`AIChatWidget.tsx:139`).
- **All infrastructure is named "isabella":** tables `isabella_settings`, `isabella_assessment_notes` (+ enum `isabella_note_type`); functions `isabella-voice-handler`, `isabella-assessment-log`; shared `_shared/isabella-gate.ts`; UI `IsabellaOperationsPage`, `IsabellaStatusBanner`, `SOSIsabellaFeed`; `useIsabellaSettings`; `isabellaGate.test.ts`; doc `ISABELLA_GATE_PLAN.md`.
- **Runs on the Lovable gateway, NOT Anthropic.** `grep -i anthropic` across `src/` + `functions/` = **0 hits**. `ai-run` POSTs to `https://ai.gateway.lovable.dev/v1/chat/completions` with `Bearer ${LOVABLE_API_KEY}` (`ai-run/index.ts:801,984,1165,1437`), model `google/gemini-3-flash-preview` (`:991,:1172`). **This directly violates the CLAUDE.md rule "Do not reintroduce Lovable… AI runs on the Anthropic API."** Eleven more functions hit the same gateway: `outreach-topic-insights`, `generate-ai-image`, `outreach-generate-drafts`, `outreach-followup-runner`, `generate-slot-content`, `rate-outreach-leads`, `facebook-publish`, `outreach-enrich-lead`, `media-draft`, `repurpose-content` (×2).

**Decision for Lee — pick one:**
- **(A) Adopt Isabella as the real name** → update CLAUDE.md/plan to say "Isabella", fix the Isabel/Isabella inconsistency to one spelling, and (separately) still migrate off the Lovable gateway to Anthropic per the golden rule.
- **(B) Rename Isabella → Clara** → a large mechanical rename across ~620 references, tables, functions, and UI, plus the gateway→Anthropic migration.
- **Either way, the Lovable→Anthropic migration is a standing golden-rule violation** that must be scheduled regardless of the name chosen. What is *good* today: the safety gate logic (`isabella-gate.ts`) and hard-block allowlist are real and test-proven (see STATE.md §3) — that work carries over under either name.

---

## 2. Scope beyond the 4-product care funnel (keep-or-archive — NOTHING deleted)

The core funnel is 4 devices + subscription + join + member dashboard + SOS/alerts. The following **~30 edge functions and ~8 admin surfaces sit outside it** and are almost entirely UNVERIFIED (no tests). Listed so a human can decide keep / defer / archive. **No recommendation to delete — inventory only.**

| Area | Edge functions | Admin surface(s) |
|---|---|---|
| **YouTube** | `youtube-oauth-start`, `-oauth-callback`, `-integration-status`, `-disconnect`, `-publish` | VideoHubPage (`/admin/video-hub`) |
| **Facebook** | `facebook-publish`, `facebook-unpublish`, `facebook-metrics` | BlogManagerPage (`/admin/blog`), MediaManager |
| **AI outreach** | `outreach-enrich-lead`, `-generate-drafts`, `-send-email`, `-followup-runner`, `-pipeline-runner`, `-topic-insights`, `-unsubscribe`, `rate-outreach-leads` | AIOutreachPage (`/admin/ai-outreach`) |
| **Content / media gen** | `generate-content-plan`, `generate-slot-content`, `media-draft`, `repurpose-content`, `publish-scheduled`, `generate-ai-image` | MediaManagerPage (`/admin/media-manager`), BlogManagerPage |
| **Video render** | `video-render-queue`, `video-render-webhook` (+ `render-worker/` service) | VideoHubPage |
| **Partner / commission** | `process-commissions`, `partner-admin-create/-delete/-invite`, `partner-send-invite/-complete-invite/-validate-invite`, `partner-register/-verify`, `partner-alert-notify`, `track-invite-view`, `track-referral-click` | CommissionsPage, PartnersQAPage, PartnerPricingSettingsPage, Partners(+detail/add), **the whole `/partner/*` portal (9 routes)** |
| **CRM import** | *(no `crm-*` functions exist)* — UI + DB tables + the outreach fns above | CRMImportPage, ImportBatchesPage, CRMContactsPage(+detail) |

Context for the decision: the master plan §11 explicitly lists "B2B insurance/care-company/facility modules (**defer**)" and "4 of 5 AI personas (**delete**)" as *not* part of the launch scope, and the outreach/content/video/social surface is the kind of growth tooling that can wait behind the life-safety core. But several of these (partner referral tracking, commissions) may be commercially live already. **Lee decides keep/defer/archive per row.** If archived, move code — don't delete history.

---

## 3. Divergences from `care-conneqt-master-build-plan.md` (stated factually)

1. **Not a monorepo — a single Vite app.** No `pnpm-workspace.yaml`, no `packages/`, no `apps/`, no `services/`. Root `package.json` has no `workspaces` field; lockfile is `package-lock.json` (**npm**), not `pnpm-lock.yaml`. Contradicts plan §4 *and* CLAUDE.md's stack line ("pnpm workspaces monorepo").
2. **One app, not two surfaces.** A single `src/` SPA (`react-router-dom` `BrowserRouter`). "platform" vs "hub" is **route groups** (`src/pages/{admin,call-centre,staff,partner}` vs `{client,join}` + marketing), not `apps/platform` + `apps/hub`.
3. **No `packages/ui` / `packages/config`.** UI is `src/components/` with root `components.json` + `tailwind.config.ts` — a classic single shadcn/ui app. GOALS bar #9 ("reuse `packages/*`") and CLAUDE.md ("from `packages/ui`") reference packages that **do not exist**.
4. **AI on Lovable gateway, not Anthropic** (see §1) — diverges from plan §4/§9 and CLAUDE.md.
5. **Schema nouns differ from the plan.** Plan §5 specifies `user_roles`, `profiles`, `has_role()`, `subscription_tier`. Reality: **no `user_roles`** (roles on `staff.role`/`app_role`), **no `subscription_tier`** column (subscriptions use `status`/`plan_type`/`billing_frequency`). The security *intent* (trigger/admin-only roles, no client tier writes) is honoured differently than the plan's wording.
6. **Not a clean rebuild.** The plan called for "one clean migration set (not 83 accreted ones)"; reality is **126 accreted migrations** plus carried-forward Lovable-era artifacts (`gps-gateway/`, `render-worker/`, many root audit docs, a committed `dist/`). This is the evolved/ported old repo, not a greenfield monorepo.
7. **WP0–WP9 not reflected in the tree.** No WP0 monorepo foundation; the codebase predates the plan's work-package model. `STATE.md` (referenced by the plan/GOALS for loop tracking) did **not exist** until this audit.

**Decision for Lee — the through-line of all three lists:** this repository is the **rebranded, evolved ICE/Lovable application**, not the clean WP0–WP9 monorepo the master plan describes. The three choices to make now:
- **Isabella or Clara** (and schedule the mandatory Lovable→Anthropic migration either way);
- **keep / defer / archive** each scope-creep row in §2;
- **stay single-app or move toward the planned monorepo** (`apps/*` + `packages/*`).

Only after these decisions should feature loops (WP-style goals) be pointed at the gaps `STATE.md` exposes — starting with the two that carry life-safety and money: an **SOS→operator E2E test + escalation cron**, and a **checkout→activation contract/E2E test + closing the three webhook-only bypasses**, both behind the mandatory human gate.
