# PARTNER_JOURNEY.md — the partner path, end to end

> Rewritten 2026-09-05, when the two-path split was closed. Previously this file
> documented **both** partner signup paths and the decision Lee owned between them.
> That decision is taken and implemented: **there is one path.** What follows
> describes it, names what is still broken in it, and keeps the history of how it
> got here, because the reasoning is why several of the guards exist.
>
> Canonical for "how does someone become a partner". `STATE.md` carries the status
> record; this file carries the reasoning.

---

## 0. The decision — one way in

**Partners register at `/partner/join`. That is the only way in from the public
site.** (Lee, 2026-09-05.)

The application path is retired. `/partner` is now a **permanent redirect** to
`/partner/join` — the route is deliberately kept, because external links, printed
material and search results point at it.

| | |
|---|---|
| Public entry point | `/partner/join` → `PartnerJoin` → `partner-register` |
| `/partner` | permanent redirect (router `<Navigate replace>` + a **308** in `vercel.json`) |
| Linked from | `PublicHeader`, the landing partner CTA, the landing footer |
| Returning partner | `/partner/login`, linked from the landing footer and from `/partner/join` |
| Admin-created partner | `partner-admin-invite` → `/partner/invite` → `partner-complete-invite` |
| Retired | `PartnerOnboarding` (deleted), the `partnerOnboarding` locale namespace (deleted) |
| Deployed but uncalled | `partner-apply` — see §4 |

Proven by `src/test/partnerSingleEntry.test.ts`: the route exists and renders a
redirect, `vercel.json` carries a permanent 308, no redirect source is a `/partner`
wildcard that would loop, every public link points at `/partner/join`, no file in
`src/` links `/partner` as a complete path, the page is deleted, nothing invokes
`partner-apply`, and its copy is gone from all three locales.

---

## 1. The journey, step by step

Walked against the code. ✅ works · ⚠️ works with a caveat · ❌ broken.

| Step | Path | Status | Detail |
|---|---|---|---|
| **Find the way in** | nav / landing → `/partner/join` | ✅ | One destination. `/partner` redirects here. |
| **Find the way back in** | `/partner/login` | ✅ | Linked from the landing footer and from `/partner/join` (twice). |
| **Register** | `partner-register` | ⚠️ | Works. The form is 6 steps and 23 fields, including an IBAN and a password, as the first thing a cold visitor sees — see §3.1. |
| **Password rule** | client + server | ✅ | Enforced client-side with an inline message (C2); server rejects reach the user (C1). |
| **Terms acceptance** | `partner-register` | ✅ | Server-enforced and persisted with a timestamp + version (C3). |
| **Verification email** | `sendEmail` | ⚠️ | Send failure is logged and does **not** fail registration — correct — but transport is interim Gmail SMTP (~500/day, no bounce webhooks, no custom-domain DKIM). `LAUNCH_CHECKLIST.md` hard blocker. |
| **Verify** | `/partner/verify` | ✅ | Sets `status='active'`, confirms the auth email, marks the token used, logs to `activity_logs`. |
| **Login** | `/partner/login` | ⚠️ | Redirect no longer races the role fetch (#103). §3.2 remains. |
| **Dashboard** | `/partner-dashboard` | ⚠️ | Reached, then immediately hard-blocked by `AgreementRequiredModal` (`open={true}`, non-dismissible) until the agreement is signed. Intended, never click-tested. |

---

## 2. Why the second path went, and what it cost

`/partner` rendered `PartnerOnboarding`, a one-page 6-field form calling
`partner-apply`. That wrote an **application**: `status='pending'`, **no
`user_id`**, no password, no verification token.

`PartnerLogin` looks up `partners` by `user_id`, and `get_user_role_info` grants
`is_partner` only on `status='active'` with a `user_id` match. So an application
could never become a login by itself — it was a lead, terminal without admin
action. That is a defensible design. What was not defensible: it was the **only**
path the public site linked, while the path that produces a working account was
linked from nothing.

Worse, the two chained into a dead end. `partner-register` checks `partners` for
the email before anything else and returns **409 "A partner with this email already
exists"**. A partner who applied and then followed the site to `/partner/join`
filled 23 more fields, including banking details and a password, and was told their
email was taken. There was no path forward from that screen.

Retiring the application path removes the collision at the source rather than
managing it with warning copy.

**What it cost.** `PartnerOnboarding` was a short, fully-translated, accessible
page. `PartnerJoin` is a 970-line wizard, and §3.1 is the honest bill.

---

## 3. Open gaps — verified, unfixed

### 3.1 `/partner/join` is hardcoded English end to end — now the worst of these

970 lines, **two** `t()` calls, no `useTranslation`. Every label, legend, helper
line and button is English in the source: "First Name *", "Preferred Language *",
"Why do you want to partner with ICE Alarm España?", "Beneficiary Name *".

This was survivable while the public nav reached a fully-translated page. It is not
survivable now: `/partner/join` is the **sole** public partner entry point for a
Dutch-owned business selling in Spain that ships **EN + ES + NL, full coverage at
launch** (LAUNCH_SCOPE §6). A Spanish care-home manager following the nav gets an
English form asking for their IBAN.

Not fixed here, and deliberately not papered over: translating a 970-line wizard is
its own work package, and adding two translated strings to an otherwise English
page would have made the test suite look satisfied while the page stayed English.
`partnerLoginReachable.test.ts` carries a comment saying exactly that, so the next
person does not read the absence of an assertion as an absence of a problem.

### 3.2 `PartnerLogin` uses a denylist where the RPC uses an allowlist

`PartnerLogin` blocks only `status === "pending"` and `"suspended"`; anything else
falls through. `get_user_role_info` grants `is_partner` **only** for `active`. Any
future fourth status passes the login check and is then refused by `requirePartner`
— the asymmetry that caused the `call_centre_supervisor` lockout (#102). Latent
today: `partner_status` has no such value. **Fix:** require `active` explicitly,
after checking prod's distinct values.

### 3.3 "No partner account found for this email" is misleading

The lookup matches on `user_id`, not email. A partner whose `partners.user_id` is
null — every row `partner-apply` ever created — is told no account exists *for that
email*, with a row carrying that email sitting right there. Exactly what a legacy
applicant sees if they try to log in, which is now the only way they can arrive.

### 3.4 `partners` has no INSERT policy

RLS is on and there is **no INSERT policy at all**, so no anon or authenticated
client can insert. Verified against real PostgreSQL 16 with `authenticated`'s grants
in place: `new row violates row-level security policy`; `SELECT` returns only the
caller's own row; `UPDATE` of another partner's row affects 0 rows.

This is **correct as-is** — registration goes through a service-role function.
Recorded because if anyone ever adds an INSERT policy to "fix" a registration
problem, GOALS.md requires an isolation test proving one partner cannot create or
read another's row. **Do not touch these policies** — human gate.

### 3.5 `preferred_language` is `en`/`es` only — no Dutch

`partners.preferred_language` carries `CHECK (preferred_language IN ('en','es'))`
(`20260122101043`), the server schema is `z.enum(["en","es"])`, and the join form
offers only English and Spanish. The three are *consistent*, so validation parity
holds — Dutch is rejected consistently rather than supported, against LAUNCH_SCOPE
§6. Needs a migration (widen the CHECK), the server enum, the form option, and the
same gap reviewed on `members`/`staff`. Compounds 3.1.

### 3.6 The dashboard is hard-blocked on first arrival

`AgreementRequiredModal` renders `open={true}`, non-dismissible. A freshly verified
partner lands on `/partner-dashboard` and cannot use it until the agreement is
signed. Intended; nobody has click-tested what that first run looks like.

### 3.7 Verification email transport is interim

Registration correctly does not fail when the email fails — but the partner cannot
verify without it, and transport is Gmail SMTP with no bounce webhooks. A silent
delivery failure looks exactly like a partner who never bothered.

---

## 4. What was kept on purpose

Retiring the public path is not the same as deleting the data behind it.
**Production may hold pending applications**, and every one of them is a real person
who filled in a form. So:

| Kept | Why |
|---|---|
| `partner_applications` / `partners` rows with `status='pending'` | The applications themselves. Untouched. |
| `ConvertApplicationDialog` (admin) | The only way to turn one into an account. |
| `partner-admin-invite` + `decidePartnerInvite` | `decidePartnerInvite("pending") === convert` is what the dialog depends on. |
| `partner-apply` (edge function) | Still deployed, **called by nothing**. No public surface invokes it; asserted in `partnerSingleEntry.test.ts` and `clientWriteSweep.test.ts`. |

`partnerInviteConversion.test.ts` now guards this in the other direction: it asserts
the dialog, the function and the `convert` outcome all still exist, so the
conversion path is not deleted as "dead code" alongside the page that fed it.

**Lee's call, recorded in `PENDING_FOR_LEE.md` S7:** run

```sql
select count(*) from partner_applications where status = 'pending';
```

If it is **0**, the convert dialog, `partner-apply` and the table can all go. Until
then they stay.

`partner-register` is deliberately **unchanged**: an existing email is still a 409.
That keeps legacy `partner-apply` rows (`pending`, no `user_id`) and
`partner-register` rows (`pending`, with `user_id`) cleanly distinct — the
distinction `decidePartnerInvite` depends on.

`PartnerJoin`'s partner **type** selector (care home / agency / …) is unrelated to
any of this and stays.

---

## 5. History — the production trace of 2026-08-11

Kept because it explains why several guards exist and why one earlier hypothesis in
the issue tracker is wrong.

| # | Fault | Status |
|---|---|---|
| 1 | The deployed bundle had a missing/placeholder `VITE_SUPABASE_URL`, so **no client call reached the backend at all** | Fixed in Vercel. `vite.config.ts` now throws instead of substituting a placeholder (#100) |
| 2 | With traffic arriving, `partner-register` rejected the password; the browser showed only `Edge Function returned a non-2xx status code` | Fixed — error surfacing (C1) + validation parity (C2) |
| 3 | `partner-register` had **zero invocations** | Cause closed 2026-08-11: the same placeholder URL. `partner-apply` read **zero** too, so no client call reached the project at all — neither function was being bypassed. The nav split was a real product gap, but it was NOT what produced the zero. |

Fault 1 is why the "schema mismatch" hypothesis in #104 was wrong and was retracted:
the insert was never reached, so the columns were never the problem.

The intermediate decision — **Option C**, keep `/partner` as lead capture and
convert applications by admin invite (Lee, 2026-08-11) — was implemented for the
admin half (#112, #115) and is what §4 preserves. Its public half is superseded by
§0: the lead-capture form no longer exists, but the conversion route for the leads
it already took does.
