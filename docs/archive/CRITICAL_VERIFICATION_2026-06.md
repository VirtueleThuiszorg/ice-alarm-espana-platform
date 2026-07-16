# CRITICAL_VERIFICATION_2026-06.md

> Point-in-time verification of two critical findings. **Read-only trace, no code changed.**
> Date: **2026-06-16** · Verifier: Claude Code · Method: direct code trace with file:line evidence.
> Frozen snapshot — supersede with a new dated file, do not edit (per `LEARN.md` §6).

---

## TASK A — Isabella enforcement

**Feb 2026 finding:** *"Isabella settings toggles are UI-only and never checked at execution."*

**VERDICT: STILL TRUE.** The per-function `public.isabella_settings.enabled` toggles are
read **only by the frontend**. No edge function reads that table, and there is no shared
server-side gate.

### Supporting evidence

- `isabella_settings` appears in **zero** edge functions. It is referenced only in
  frontend / generated code:
  - [src/hooks/useIsabellaSettings.ts](src/hooks/useIsabellaSettings.ts) — reads/writes the table (the admin toggle).
  - [src/lib/isabella-function-config.ts](src/lib/isabella-function-config.ts) — the `FUNCTION_KEY_MAP` config.
  - [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) — generated types.
  - `grep -rn "isabella_settings" supabase/functions/` → **(none)**.
- `supabase/functions/_shared/` contains no Isabella gate (only `cors.ts`, `email*.ts`,
  `post-payment.ts`, `rate-limit.ts`, `twilio-credentials.ts`, `validation.ts`).

### Per-path answer

| Path | Reads `isabella_settings.enabled`? | What it actually gates on |
|---|---|---|
| `ai-run` | **NO** | [ai-run/index.ts:839](supabase/functions/ai-run/index.ts#L839) checks `agent.enabled` (the `ai_agents` table — a *different*, agent-level flag), and even that is bypassed for `chat_widget` and `voice_call` (`!isChatWidget && !isVoiceCall`). |
| `ai-execute-action` | **NO** | [ai-execute-action/index.ts:37](supabase/functions/ai-execute-action/index.ts#L37) gates only on `action.status === "approved"`. No enabled check of any kind. |
| `ai-dispatch-events` | **NO** | Batch path [ai-dispatch-events/index.ts:153-162](supabase/functions/ai-dispatch-events/index.ts#L153-L162) checks `ai_agents.enabled`; the immediate `createEvent` dispatch path [lines 81-109](supabase/functions/ai-dispatch-events/index.ts#L81-L109) dispatches with **no enabled check at all**. |

**Is there a shared gate they all call?** No.

### Key distinction (why the "one-click pause" guarantee does not hold as described)

There are **two different "enabled" concepts**, and they are not the same table:

1. **`ai_agents.enabled`** — coarse, agent-level on/off (the ~5 agents). Partially
   enforced: stops `ai-run` for non-chat/non-voice requests, and stops batch dispatch.
   **Bypassed** for the `chat_widget` and `voice_call` sources — which is exactly the
   path the default-enabled `chat_widget` function uses.
2. **`isabella_settings.enabled`** — the 50 per-function toggles shown in the admin
   Isabella Operations page and written by `useIsabellaSettings.ts`. **Never read
   server-side.**

The CLAUDE.md §5 "one-click pause" guarantee depends on (2) being enforced at execution.
It is not. Turning a function off in the admin UI changes only DB state the execution
paths never consult. A coarser kill-switch exists via (1) `ai_agents.enabled`, but it is
not the per-function toggle and does not cover the chat/voice paths.

---

## TASK B — Stripe webhook signature

**Question:** Does `stripe-webhook` verify the `Stripe-Signature` header against the
signing secret (`constructEvent`/`constructEventAsync`) **before** processing the body?

**VERDICT: YES.**

### Supporting evidence

- Raw body read for verification: [stripe-webhook/index.ts:36](supabase/functions/stripe-webhook/index.ts#L36) — `const body = await req.text();` (raw text, required for signature checking — not pre-parsed JSON).
- Missing-signature rejection: [lines 38-43](supabase/functions/stripe-webhook/index.ts#L38-L43) returns **400** if the `stripe-signature` header is absent.
- Signature verification: [line 64](supabase/functions/stripe-webhook/index.ts#L64) —
  `event = stripe.webhooks.constructEvent(body, signature, webhookSettings.value);`
  wrapped in try/catch; on failure returns **400** ([lines 65-72](supabase/functions/stripe-webhook/index.ts#L65-L72)).
- This runs **before** any event handling: the `switch (event.type)` and all DB writes
  begin at [line 98](supabase/functions/stripe-webhook/index.ts#L98), after verification.
  (An idempotency guard via `webhook_events` sits at lines 76-96, also post-verification.)

### Where the signing secret comes from

- **The `system_settings` DB table — NOT an env var.** The webhook signing secret is read
  at [lines 46-50](supabase/functions/stripe-webhook/index.ts#L46-L50) from
  `system_settings` where `key = "settings_stripe_webhook_secret"` (returns 500 if
  unset). The Stripe secret key used to build the client is likewise from
  `system_settings`, key `settings_stripe_secret_key` ([lines 21-25](supabase/functions/stripe-webhook/index.ts#L21-L25)).
- This is consistent with `CLAUDE.md` §4 ("Stripe + Mollie + Gemini keys in the
  `system_settings` table, by design"). Security therefore rests on RLS on that table.
