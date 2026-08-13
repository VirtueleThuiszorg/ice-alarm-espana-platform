# PARTNER_JOURNEY.md — the partner path, end to end

> Written 2026-08-11 after a production trace. Documents **both** partner signup
> paths, what each actually writes, every step of register → verify → login →
> dashboard, and the decision Lee owns. Nothing here is aspirational: each claim
> names the file, the line, or the test that proves it.
>
> Canonical for "how does someone become a partner". `STATE.md` carries the status
> record; this file carries the reasoning.

---

## 0. What the production trace found

Three separate faults, discovered in this order. Each was hiding the next.

| # | Fault | Status |
|---|---|---|
| 1 | The deployed bundle had a missing/placeholder `VITE_SUPABASE_URL`, so **no client call reached the backend at all** | Fixed in Vercel. `vite.config.ts` now throws instead of substituting a placeholder (#100) |
| 2 | With traffic arriving, `partner-register` rejected the password. The browser showed only `Edge Function returned a non-2xx status code` | Fixed — error surfacing (C1) + validation parity (C2) |
| 3 | `partner-register` had **zero invocations** | **Cause closed 2026-08-11:** the same placeholder URL. `partner-apply` also read **zero**, so no client call reached the project at all — neither function was being bypassed. The nav split below is a real product gap, but it was NOT what produced the zero. |

Fault 1 is why the earlier "schema mismatch" hypothesis in #104 was wrong and was
retracted: the insert was never reached, so the columns were never the problem.

---

## 1. There are two signup paths

They are not variants of one flow. They produce different rows and lead to
different places.

| | `/partner` → `partner-apply` | `/partner/join` → `partner-register` |
|---|---|---|
| **Linked from the public nav** | ✅ `PublicHeader.tsx:15`, `LandingPage.tsx:636,724` | ❌ **nothing** links it |
| Form | 6 fields, one page | 7 steps, incl. IBAN + password |
| Creates an `auth.users` row | ❌ never | ✅ `auth.admin.createUser` |
| Sets `partners.user_id` | ❌ the string does not appear in the file | ✅ |
| Collects a password | ❌ | ✅ |
| Issues a verification token | ❌ | ✅ `partner_verification_tokens` |
| Emails the applicant | ✅ commission terms (€50 flat) | ✅ verification link |
| Notifies admin | ✅ `notify-admin` | — |
| Row `status` | `pending` | `pending` |
| **Can this partner ever log in?** | ❌ **No** | ✅ after verifying |

### Why the application can never become an account by itself

`PartnerLogin` looks up `partners` **by `user_id`**, and `get_user_role_info`
requires a `user_id` match too. An application row has neither a `user_id` nor a
password, and `partner-apply` issues no verification token — so `partner-verify`
can never be reached for it either.

**An application is a lead, and terminal without admin action.** That is a
defensible design. What is not defensible is that it is the *only* path the public
site offers, while the path that produces a working account is unreachable.

---

## 2. The journey, step by step

Walked against the code. ✅ works · ⚠️ works with a caveat · ❌ broken or unreachable.

| Step | Path | Status | Detail |
|---|---|---|---|
| **Find the way in** | nav → `/partner` | ⚠️ | The nav only ever reaches the application path. §3 is the decision. |
| **Find the way back in** | `/partner/login` | ✅ *fixed* | Was reachable only by typing the URL. Now linked from the landing footer and from `/partner` (C5). |
| **Submit application** | `partner-apply` | ⚠️ | Whitelists fields, dedups by email, generates a referral code, emails terms, notifies admin. Had **zero** invocations too, for the placeholder-URL reason — so this path is also unproven in production. |
| **Submit registration** | `partner-register` | ✅ *fixed* | Password rule now enforced client-side with an inline message (C2); server rejects now reach the user (C1). |
| **Terms acceptance** | `partner-register` | ✅ *fixed* | Was UI state only — never sent, validated or stored. Now server-enforced and persisted with a timestamp + version (C3). |
| **Verification email** | `sendEmail` | ⚠️ | Send failure is logged and does **not** fail registration — correct, but transport is still interim Gmail SMTP (~500/day, no bounce webhooks, no custom-domain DKIM). `LAUNCH_CHECKLIST.md` hard blocker. |
| **Verify** | `/partner/verify` | ✅ | Sets `status='active'`, confirms the auth email, marks the token used, logs to `activity_logs`. |
| **Login** | `/partner/login` | ⚠️ *partly fixed* | Redirect no longer races the role fetch (#103). Two issues remain — see §4.1 and §4.2. |
| **Dashboard** | `/partner-dashboard` | ⚠️ | Reached, then **immediately hard-blocked** by `AgreementRequiredModal` (`open={true}`, non-dismissible) until the full agreement is signed. Intended, but it means a freshly verified partner never sees a dashboard. |

---

## 3. The decision Lee owns

The public site drives every visitor to a path that cannot produce a working
account. Three ways out. **Not to be unified unattended** — they imply different
products.

### Option A — retarget the nav to `/partner/join`

One-line change in `PublicHeader.tsx` and two in `LandingPage.tsx`.

- ✅ Cheapest. Every signup immediately produces a real, loggable-in account.
- ❌ Replaces a 6-field page with a **7-step form demanding an IBAN and a password**
  as the first thing a cold visitor sees. Expect the funnel to collapse.
- ❌ Loses the low-friction lead capture and the admin heads-up entirely.
- ❌ Removes any vetting step, for a partner who will be paid commission.

### Option B — make `partner-apply` create the auth user

- ✅ Keeps the short form; every applicant becomes an account.
- ❌ The applicant never chose a password, so this needs a set-password invite flow
  bolted on — which is most of Option C's work anyway.
- ❌ Turns every casual enquiry into a credentialed account. For a partner who
  receives commission payments and can see referred members, that is a real
  widening of who holds an account, with no review in between.

### Option C — admin conversion of applications ⭐ recommended

Keep `/partner` as lead capture. An admin reviews the application and converts it
into an account by invite.

- ✅ **The codebase was already built for this.** `partners` already has
  `reviewed_by`, `reviewed_at`, `review_notes` (`20260301140000`) and a `pending`
  status; `partner-admin-create`, `partner-admin-invite` and
  `partner-complete-invite` already exist. Option C mostly *connects* what is
  there rather than adding a new mechanism.
- ✅ Keeps the low-friction funnel that the marketing site is built around.
- ✅ Puts a human between "someone filled a form" and "someone can be paid
  commission and see member data" — appropriate for this product.
- ✅ The applicant sets their own password via the invite, so no credential is ever
  created on their behalf.
- ❌ Requires admin work per application, and an admin UI to do it from.
- ❌ Slower for a partner who wanted to self-serve immediately.

### DECIDED — Option C (Lee, 2026-08-11)

Lee has chosen **Option C: admin conversion of applications**, with `/partner/join`
kept reachable for partners who want to complete everything now. What follows was
the recommendation and is now the decision; implementation is tracked separately.

The two paths are not really in conflict once one is a *lead* and the other is
*self-serve signup*; the bug was only ever that the second was invisible. C5 has
already made the login findable, which removes the worst symptom without
pre-empting this decision.

Concretely, if Option C is chosen:
1. Add an admin action on the application row → calls `partner-admin-invite`.
2. Stamp `reviewed_by` / `reviewed_at` / `review_notes` when it is actioned.
3. Add a visible "or complete full registration now →" link from `/partner` to
   `/partner/join`, so a partner who wants the self-serve path can take it.
4. Leave the nav pointing at `/partner`.

**None of this is implemented yet** — the four steps above are the build. The
decision itself is settled; only the code is outstanding.

---

## 4. Open gaps

Everything below is verified and unfixed. None is in scope for the C1–C5 PRs.

### 4.1 `PartnerLogin` uses a denylist where the RPC uses an allowlist

`PartnerLogin` blocks only `status === "pending"` and `"suspended"`. Anything else
falls through and proceeds. `get_user_role_info` grants `is_partner` **only** for
`status = 'active'`.

So any status that is neither `active` nor in that two-value denylist passes the
login check and is then refused by `requirePartner` — the same allowlist/denylist
asymmetry that caused the `call_centre_supervisor` lockout (#102). Today
`partner_status` is a three-value enum, so no such value exists; the risk is the
day a fourth is added.

**Fix:** make `PartnerLogin` require `active` explicitly. Needs the real distinct
values on prod checked first.

### 4.2 "No partner account found for this email" is misleading

The lookup matches on `user_id`, not email. A partner whose `partners.user_id` is
null — **every row `partner-apply` creates** — gets told no account exists *for
that email*, when a row with that email is right there. That is exactly what an
application-path partner will see if they try to log in.

### 4.3 `partners` has no INSERT policy

RLS is on and there is **no INSERT policy at all**, so no anon or authenticated
client can insert. Verified against real PostgreSQL 16 with `authenticated`'s
grants in place: `new row violates row-level security policy`; `SELECT` returns
only the caller's own row; `UPDATE` of another partner's row affects 0 rows.

This is **correct as-is** — registration must go through a service-role function,
and both do. Recorded because:
- it means there is no client-side fallback, by design; and
- if anyone ever adds an INSERT policy to "fix" a registration problem, GOALS.md
  requires an isolation test proving one partner cannot create or read another's
  row. `partnerRegistration.test.ts` fails until such a policy is deliberate.

**No change is proposed here. Do not touch these policies** — human gate.

### 4.4 `preferred_language` is `en`/`es` only — no Dutch

`partners.preferred_language` carries `CHECK (preferred_language IN ('en','es'))`
(`20260122101043`), the server schema is `z.enum(["en","es"])`, and the join form
offers only English and Spanish.

The three are *consistent*, so validation parity holds — but Dutch is rejected
consistently rather than supported, against **LAUNCH_SCOPE §6** ("EN + ES + NL, all
three, full coverage at launch"). For a Dutch-owned business recruiting partners,
this is a live scope gap, not a nit.

**Fix needs a migration** (widen the CHECK), the server enum, the form option, and
the `preferred_language` enum used by `members`/`staff` reviewed for the same gap.
Deliberately not bundled into a validation-parity PR — it is a scope decision.

### 4.5 The dashboard is hard-blocked on first arrival

`AgreementRequiredModal` renders `open={true}` and is non-dismissible, so a
freshly verified partner lands on `/partner-dashboard` and immediately cannot use
it until the full agreement is signed. Intended, but nobody has click-tested what
that first-run experience actually looks like.

### 4.6 Verification email transport is interim

Registration correctly does not fail when the email fails — but the partner cannot
verify without it, and transport is Gmail SMTP with no bounce webhooks. A silent
delivery failure looks exactly like a partner who never bothered.

---

## 5. What the PRs in this sweep changed

| PR | Concern | Effect on this journey |
|---|---|---|
| C1 | Error surfacing | A server rejection now reaches the user as the actual reason, at every `functions.invoke` site that can show one |
| C2 | Validation parity | The password rule (and 30-odd other server rules) now fail inline on the form instead of as a server error |
| C3 | Terms acceptance | Acceptance is enforced server-side and persisted with a timestamp + version |
| C5 | Returning-partner entry | `/partner/login` is reachable from two public pages |
| C4 | This document | — |
| C6 | `STATE.md` | Honest status record |

Not changed by any of them: the two-path split (§3, Lee's call), and every gap in
§4.

---

## 6. What a real partner experiences today (walked 2026-08-13)

Lee walked `/partner`, completed the form, got the thank-you page, followed the
"Complete full registration" button added in #114, and landed on a **second,
different wizard**. That is what the code does. This section records the lived
flow, not the intended design — where the two diverge, the lived flow wins.

**Yes, there are two consecutive wizards, and the second cannot complete for
anyone who finished the first.**

### 6.1 The two wizards, side by side

| | Wizard 1 — `/partner` | Wizard 2 — `/partner/join` |
|---|---|---|
| Component | `PartnerOnboarding` | `PartnerJoin` |
| Shape | one page, 6 fields | 6 steps, 23 fields |
| Fields | `contact_name`, `email`, `phone`, `preferred_language`, `region`, `how_heard_about_us` | **all six of those again**, plus `partner_type`, `last_name`, `company_name`, `position_title`, org fields, `motivation`, `additional_notes`, `current_client_base`, `payout_beneficiary_name`, `payout_iban`, `password`, `confirmPassword`, `accept_terms` |
| Function | `partner-apply` | `partner-register` |
| Writes | `partners` row, `status='pending'`, **no `user_id`** | auth user **+** `partners` row, `status='pending'`, **with `user_id`** |
| Prefill from wizard 1 | — | **none** |

### 6.2 Step by step, as actually experienced

1. **`/partner`** — marketing copy, a 3-step "Register / Share / Earn" explainer,
   then the 6-field form. Submit → `partner-apply` writes a `partners` row with
   the email and `status='pending'`.
2. **Thank-you page** — "Thank You for Your Interest!" The copy promises an email
   "including what you can earn and a link to complete your registration". Two
   buttons: **"Complete full registration"** → `/partner/join`, and "Return to
   Homepage".
3. **`/partner/join`** — a *different* wizard. It re-asks every field from step 1
   with nothing carried over, then asks for 17 more including IBAN and a password,
   plus terms acceptance.
4. **Submit → failure.** `partner-register` checks `partners` for the email
   *before* doing anything else and returns **409 "A partner with this email
   already exists"** (`partner-register/index.ts` §"Check if email already exists
   in partners table"). Step 1 created exactly that row.

So a partner who follows the flow as presented fills in two forms, 29 field-entries
in total, and is then told their email is already taken — after entering banking
details and choosing a password. There is no path forward from that screen.

### 6.3 Who `/partner/join` actually works for

Only someone who **never used `/partner`**. The wizard is sound in isolation; it
is the *sequence* that is broken. The #114 link points the one population
guaranteed to collide — people who just applied — straight at the collision.

### 6.4 Is this the intended Option C flow?

**No.** Option C as decided (§3) is:

> `/partner` captures the lead → an admin reviews and converts the application
> into an invite → the partner sets their password from the invite email.

The admin conversion is the intended bridge from application to account, and it
exists (`partner-admin-invite`, #112, plus the admin UI in #115). `/partner/join`
is the *self-serve alternative* to that bridge, for someone who wants to do
everything immediately. Presenting it as the **continuation** of an application
already submitted is what #114 got wrong: it chains two mutually exclusive paths
instead of offering them as a choice.

I added that link, so this is mine. The intent — don't leave the low-friction path
as the only path — was right; the placement was not. It belongs on `/partner`
*before* the form, as an alternative ("prefer to set everything up now?"), never on
the thank-you page *after* the application row exists.

### 6.5 What changed — DONE in this branch (Lee, 2026-08-13)

Lee's call: **relocate the link, and do NOT make `partner-register` complete
existing applications.** So the two paths stay mutually exclusive, and the product
stops pretending otherwise.

- **The thank-you-page link is gone.** Nothing routes an applicant into the 409 any
  more. That screen now offers only "Return to Homepage".
- **The choice moved to before the form**, where both options are still open. It
  names the difference that actually matters — reviewed by us later vs. set up now —
  and says plainly: *choose one, do not do both with the same email address.*
- **The below-form "Prefer to do it all now?" line is gone**, folded into that
  choice rather than left as a second, quieter version of it. `preferNow` is
  removed from all three locales.
- **The success copy no longer promises "a link to complete your registration."**
  Under Option C the route from application to account is admin review followed by
  an invitation email, so that is what it now says. The old sentence was the last
  thing still pointing at the path that 409s.

`partner-register` is deliberately **unchanged**: an existing email is still a 409.
That keeps `partner-apply` rows (`pending`, no `user_id`) and `partner-register`
rows (`pending`, with `user_id`) cleanly distinct — the distinction
`decidePartnerInvite` depends on to decide whether an admin may convert a row, and
which the admin Convert gate now also reads.

### 6.6 Still open

- **No prefill.** A partner who picks the direct path still types everything once;
  a partner who applied and is later invited types their extra details then. Nothing
  is asked twice within a single path any more, so this is now a nicety rather than
  the defect it was when the two wizards chained.
- **`/partner/join` remains reachable by URL for someone who already applied**, and
  will 409 them. The pre-form choice and the warning are what steer against it; the
  server refusal is the backstop. Making that refusal explain itself in terms of the
  application ("you have already applied — watch for our invitation") would be the
  next honest improvement, and is a copy change in `partner-register`, not a flow
  change.
### 6.5 What has to change (not yet done — Lee's call on which)

- **Minimum:** remove or relocate the thank-you-page link so no one is routed into
  a guaranteed 409. This alone stops the dead end.
- **Better:** make `partner-register` treat an existing `pending` application for
  the same email as the thing to *complete* rather than a conflict — attach the
  auth user to that row and fill in the extra fields, instead of refusing. That
  makes the flow Lee actually walked work as it reads.
- **Either way:** carry the six known fields into `/partner/join` as prefill.
  Re-asking them is what makes the second wizard feel like a mistake.

Note the interaction with the `pending` + `user_id` distinction added in the
status-allowlist work: `partner-apply` writes `pending` *without* a `user_id` and
`partner-register` writes `pending` *with* one, and `decidePartnerInvite` now
relies on exactly that difference to decide whether an admin may convert a row. Any
fix to the second bullet must keep that distinction meaningful, or admin conversion
starts mis-firing on self-registered partners again.
