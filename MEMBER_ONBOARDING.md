# MEMBER_ONBOARDING.md — staff-initiated member onboarding

> **Status: DESIGN ONLY. No code written in this pass.**
> Written 2026-08-14 against `main` @ `776bda2`. Every claim below names the file,
> line, migration or enum it came from. Where I could not verify something I say so
> rather than assume it.
>
> Canonical for "how does a person become a monitored member". `STATE.md` carries
> the status record; `PARTNER_JOURNEY.md` is the equivalent document for partners
> and is worth reading first — the two flows rhyme, and the partner one has already
> been through the mistakes this one is about to make.

---

## 0. The headline, before the detail

Two things reframe this whole piece of work, and both are the opposite of the brief's
assumption.

**1. There is no "wizard-in-admin" to replace. It does not create anything.**

`src/pages/admin/AddMemberWizard.tsx` is 363 lines, ten steps, ending in a
"Complete Registration" button and a success screen. It contains **zero** references
to `supabase`, `invoke`, `fetch` or any mutation:

```
$ grep -cE "supabase|invoke|fetch\(|mutate" src/pages/admin/AddMemberWizard.tsx
0
```

Its only outward action is `navigate("/admin/members")`. A staff member who walks all
ten steps is shown a success screen and **no record is created anywhere.** This is a
G5 honesty defect in its own right, independent of anything Lee wants built: the UI
asserts an outcome that never happens. It should be treated as a live bug, not as
legacy to be gracefully migrated.

So step 1 of the brief is not "replace the wizard". It is "build the thing the wizard
pretends to be".

**2. Step 5 is already built, end to end.** Details in §1. Do not rebuild it.

---

## 1. Inventory — what exists today

Against the five steps in the brief.

| # | Step | Verdict |
|---|---|---|
| 1 | Staff enter partial details | **ABSENT** (the wizard writes nothing) |
| 2 | Member gets email, sets password, signs in | **ABSENT for members** (the named function is for staff) |
| 3 | Member picks a package and pays | **HALF-BUILT** (checkout exists, but assumes a member already exists) |
| 4 | Member completes remaining details | **HALF-BUILT** (the mechanism exists; the trigger and framing do not) |
| 5 | Staff trigger an update-your-records email | **BUILT** — leave it alone |

### 1.1 What each named artefact actually is

| Artefact | What it really does |
|---|---|
| `send-member-update-request` | **Real.** Issues a 32-byte hex token into `member_update_tokens` with `requested_fields`, `expires_at` = now + 7 days, and emails the member. |
| `validate-member-update-token` | **Real.** Rejects `token_missing` / `token_invalid` / `token_used` / `token_expired` / `member_not_found`, and returns `requestedFields` so the page renders only what was asked for. |
| `submit-member-update` | **Real.** Writes `members`, `medical_information` and `emergency_contacts`, then stamps `used_at`. |
| `/member-update` | **Real.** Route registered in `App.tsx`, backed by `MemberUpdatePage`. |
| `MemberUpdateRequestModal` | **Real.** Mounted in `src/components/admin/member-detail/CRMTab.tsx`. Computes *missing* fields (`nie_dni`, `blood_type`, `doctor_name`, `allergies`, `<2 emergency contacts`, contacts missing email…) and lets staff tick which to request. This is precisely the "show what we hold and let them correct it" feature in the brief. |
| `staff-send-invite` | **Not a member function.** It reads `.from("staff")` and writes `staff_invites`. It onboards *employees*. It is the right *pattern* to copy for step 2 and the wrong function to call. |
| `complete-member-registration` | **Real, and narrower than its name.** Links an already-authenticated user to an **existing** member record. Its own header says members are "created server-side by the paid join flow". It does not create members. |
| `submit-registration` | **Real.** The public `/join` path. Calls the `submit_registration_atomic` RPC to create member + subscription + order in one transaction, then returns the IDs needed for checkout. |
| `save-registration-draft` | **Real,** 97 lines. Persists an in-progress public registration. |
| `create-checkout` / `create-mollie-checkout` | **Real,** and the important detail: both require `body.memberId` and put `member_id` in the payment metadata. **A member row must already exist before anyone can pay.** |
| `stripe-webhook` / `mollie-webhook` | **Real.** Set `subscriptions.status = 'active'` on payment. This is the golden-rule-4 activation chokepoint. |

### 1.2 The consequence

The existing machinery is built around **one** flow: a member self-serves at `/join`,
a transaction creates their record, they pay, the webhook activates them.

Lee's flow inverts the first half — staff create the record, the member pays later —
but the second half (checkout → webhook → active) can be reused unchanged, because
`create-checkout` already takes a `memberId` rather than creating one.

**What is genuinely missing is small:** a server-side "create a partial member" entry
point, and a member-facing invite/set-password loop. Everything downstream exists.

---

## 2. The state machine

### 2.1 What exists today — and why it is a hazard

```sql
CREATE TYPE public.member_status AS ENUM ('active', 'inactive', 'suspended');
-- members.status  member_status DEFAULT 'active'
```

There is **no** pending, invited, draft or unpaid state, and the column default is
`active`.

**Correction to my own first reading:** the public paid-join flow does *not* rely on
that default. `submit_registration_atomic` inserts members with an explicit
`'inactive'`, and the webhook promotes them on payment. So an unpaid state already
exists in practice — it is just **overloaded onto `inactive`**, which also means
"lapsed member who used to be covered". Those are different things operationally: one
has never been protected, the other stopped being. Worth separating.

The `DEFAULT 'active'` still bites any new insert that omits `status`, which a
staff-create endpoint could easily do.

That matters more here than it would in most products. This is a life-safety service.
A staff-created stub — a name and a phone number, no payment, no pendant, no medical
information, no emergency contacts — that lands on `active` (by omitting `status`) or
on `inactive` (by copying the join flow) is wrong in two different ways. `active`
makes it appear in the CRM, in `SELECT ... FROM members WHERE status = 'active'`
counts, and to a call-centre operator, **indistinguishable from someone actually being
monitored.** `inactive` is safer but still lies: it says "this person's coverage
lapsed" about someone who never had any, so staff cannot tell a cold lead from a
churned customer.

That is a G2 failure ("never leave the user believing they're protected when they
aren't") pointed at staff rather than at the member. It must be fixed before, not
after, staff start creating partial records.

### 2.2 Proposed states

Adding to the enum rather than repurposing existing values, so no historical row
changes meaning:

| State | Meaning | Can log in? | Can pay? | **Dispatchable?** |
|---|---|---|---|---|
| `draft` | Staff created a partial record. No account, no payment. | No | No | **No** |
| `invited` | Invite email sent; password not yet set. | No | No | **No** |
| `registered` | Account exists, member can sign in. **Not paid.** | Yes | Yes | **No** |
| `active` | Payment succeeded via webhook. | Yes | n/a | **Yes** |
| `inactive` | Lapsed / cancelled / non-payment. | Yes | Yes (to reinstate) | **No** |
| `suspended` | Staff-suspended. | No | No | **No** |

Three rules that should be enforced in code and proven by test, not left to
convention:

1. **Only `active` is dispatchable.** Every operator-facing surface, every alert
   route, every "who is covered" count filters on it. The isolation harness pattern
   in `scripts/rls/isolation.sql` is the right place to prove the negative.
2. **`draft` and `invited` have no `user_id`** — exactly the distinction
   `PARTNER_JOURNEY.md` §6 relies on for partners, and the one that made
   `decidePartnerInvite` correct. Reuse it rather than inventing a parallel notion.
3. **Only the payment webhook writes `active`.** Golden rule 4. Staff may move a
   member to `suspended` or `inactive`; nothing client-side may write `active`.

### 2.3 Transitions

```
        staff creates partial record
                  │
                  ▼
              [ draft ] ──────── staff abandons ──────► stays draft (not covered)
                  │
        staff sends invite email
                  ▼
             [ invited ] ─────── token expires ───────► back to draft, re-invitable
                  │
        member sets password
                  ▼
            [ registered ] ───── never pays ──────────► stays registered (not covered)
                  │
        member picks package, pays  ──► webhook
                  ▼
              [ active ] ◄──────────► [ inactive ]   (lapse / reinstate)
                  │
                  └────────────────► [ suspended ]   (staff action)
```

---

## 3. Where payment sits, and what abandonment costs

Payment sits **after** account creation and **before** coverage. That is forced by
the existing code (`create-checkout` needs a `memberId`) and it is also the right
shape: it means the member has an identity to attach a subscription to, and a way to
come back and finish.

Abandonment at each point, and what the business is left holding:

| Abandons at | Record state | What exists | Risk |
|---|---|---|---|
| Staff typed details, never invited | `draft` | A lead with PII and no consent trail | **GDPR**: personal data collected with no lawful-basis record and no retention clock. Needs a purge policy. |
| Invite sent, never opened | `invited` | Above + a live token | Token must expire (§5). Re-invite must revoke the old one. |
| Password set, never paid | `registered` | An account that can sign in | **The dangerous one.** They have a login and a dashboard. If that dashboard looks like a monitoring dashboard, they may believe they are covered. It must say plainly that they are not. |
| Paid, details incomplete | `active` | Coverage, thin data | **The most dangerous.** They *are* being monitored, but an operator responding to their SOS may have no medical info and no emergency contacts. §5's chase mechanism is the mitigation, and this is why it already exists. |
| Payment failed / card declined | `registered` | Failed subscription row | Must not read as active. The webhook is the only writer, so this is already correct — but worth an explicit test. |

The `registered`-but-unpaid dashboard is a product decision, not just an
implementation detail: see §8 Q4.

---

## 4. Payer vs member — a decision for Lee

**I am not going to assume this.** Here is the evidence, and the question.

**What the schema currently implies: they are the same person.**

```sql
CREATE TABLE public.subscriptions (
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  ...
  stripe_customer_id text,
);
```

- `subscriptions` keys on `member_id` and nothing else. There is no `payer_id`,
  `account_holder_id`, `billed_to` or equivalent anywhere in the schema.
- `stripe_customer_id` hangs off the **subscription**, i.e. off the member.
- `create-checkout` takes `memberId` and stamps `member_id` into payment metadata.
- The only relationship columns in the schema (`relationship`, `relationship_type`)
  belong to `emergency_contacts` — people to *call*, not people who *pay*.

So today: **one member, one payer, same identity.**

**Why that is likely wrong for this product.** The buyer of a pendant for an elderly
parent is very often the adult child. They hold the card, the email address and the
account; the parent wears the device. Under the current schema the only way to model
that is to put the child's email on the member record — which then breaks step 4
(the "complete your details" email goes to the wrong person, or the right person
answering medical questions about someone else) and breaks §5's update-records loop
in the same way.

**The three options, with costs:**

| Option | Shape | Cost |
|---|---|---|
| **A. Payer *is* the member** | Status quo. The child registers as the member and wears nothing. | Free today. Corrupts the data model: the medical and emergency-contact records describe someone other than the account holder. Bad for a life-safety product. |
| **B. Payer is a distinct person, linked** | Add a payer/account-holder relation to `members` or `subscriptions`. | A migration and real work in checkout + emails. Correct long term. Lets the child pay and the parent's record stay truthful. |
| **C. Household / couple account** | `plan_type` is already `('single','couple')`, so a two-person notion partly exists. | Ambiguous — `couple` today means two monitored people, not payer + monitored. Conflating them would be a mess. |

**This is Q1 in §8 and it gates the schema.** Getting it wrong is expensive to undo
once real subscriptions exist, and it is the single most consequential choice in this
document.

---

## 5. The update-records link

Most of this exists. The design work is deciding what should change, not what to
build.

### 5.1 What is already true

| Property | Current behaviour | Source |
|---|---|---|
| Entropy | 32 random bytes, hex | `send-member-update-request` |
| Lifetime | **7 days** | `expiresAt.setDate(getDate() + 7)` |
| Single-use | **Yes** — `used_at` stamped on submit, `token_used` refused on validate | `submit-member-update`, `validate-member-update-token` |
| Scoped | **Yes** — `requested_fields TEXT[]`, echoed back as `requestedFields` | `member_update_tokens` |
| Auditable | `created_by` → `staff.id`, `created_at` | table definition |

That is a better-designed token than most, and the scoping column in particular is
the thing that makes the rest of this section tractable.

### 5.2 What should change

**Lifetime: 7 days is too long for this payload.** The token grants read *and* write
access to medical information and emergency contacts with no second factor. Anyone
holding the email holds the data. **72 hours** is a more defensible default, with
staff able to re-issue in one click — which they can, because the modal already
exists. (Q5.)

**Re-issue must revoke.** `staff-send-invite` already does exactly this for staff —
"Revoke any existing pending invites" — and that pattern should be copied. Otherwise
every re-send leaves another live door open for the remainder of its lifetime.

**The link should not be the only path.** A `registered` member can already sign in.
For them, the email should deep-link into the authenticated dashboard rather than
hand out a bearer token at all. The token path is for members who have no account —
which, after this work, is `draft` and `invited` only.

### 5.3 What a member may change vs what only staff may

This is the life-safety question in the brief, and the current answer is permissive:
`submit-member-update` today accepts `member`, `medical` and `emergencyContacts` and
writes all three.

Proposed split:

| Field group | Member may edit | Rationale |
|---|---|---|
| Name, address, phone, email, NIE/DNI, language | **Yes** | Their own identity data. They are the authority. |
| Emergency contacts: add / correct name, relationship, phone | **Yes** | They are the only people who know. Blocking this is what produces the empty-contacts problem the CRM modal already chases. |
| Emergency contacts: **delete the last remaining contact** | **No** | Leaving zero contacts silently degrades the escalation ladder. Refuse, and explain. |
| Medical: allergies, medications, conditions, doctor, hospital preference | **Yes, but versioned** | Same argument — they hold the truth. But changes must be an append-only record, not a destructive overwrite. |
| Blood type | **Flag for Lee** (Q6) | Self-reported blood type is a known source of dangerous error. |
| `status`, `plan_type`, subscription, pendant assignment, device pairing | **No** | Golden rules 3 and 4. Only staff and the payment webhook. |

Two cross-cutting requirements:

1. **Never destructive.** A member clearing a field must not silently erase what an
   operator would have relied on. Old values retained and visible to staff.
2. **Every write attributed.** `activity_logs` should record member-originated
   changes distinctly from staff-originated ones, so an operator reading a record at
   3am can see who asserted what.

---

## 6. GDPR

A token in an email is a data-access path. Under GDPR it is a disclosure of special
category data (health), so the bar is higher than for a password reset.

- **Purpose limitation** — the token must only ever expose the fields in
  `requested_fields`. The column exists and validate already returns it; the *page*
  must be built to honour it rather than render the whole record. Worth an explicit
  test, because this is the difference between "update your phone number" and
  "here is your complete medical file to anyone holding this email".
- **Data minimisation on display** — showing "what we hold" is the brief's step 5,
  and it is a disclosure. Show what is needed to correct it; mask what is not (e.g.
  last 3 of NIE/DNI rather than the full number) unless that field is what is being
  corrected.
- **Storage limitation** — `draft` records are personal data collected before any
  relationship exists. They need a retention clock and an automatic purge. Undefined
  today. (Q7.)
- **Lawful basis** — a staff-created `draft` has no consent record. Whatever basis
  applies (legitimate interest for a prospect, contract once they pay) must be
  recorded at creation, not reconstructed later.
- **Right of access / erasure — a confirmed gap.** `gdpr-delete-member`
  **anonymises** the `members` row (`first_name: "DELETED"`, email rewritten) rather
  than deleting it, explicitly "to keep referential integrity". Because the row
  survives, `member_update_tokens`' `ON DELETE CASCADE` **never fires**, and any
  unexpired token issued before the erasure request stays valid and still resolves to
  that member. The function's table list is `activity_logs`, `alerts`, `crm_profiles`,
  `emergency_contacts`, `medical_information`, `members`, `subscriptions` — tokens are
  not among them. This is a real defect today, independent of any new work: erasure
  should revoke outstanding tokens.
- **Audit** — G4 requires every access auditable. Token issuance is
  (`created_by`, `created_at`); token *use* should log the same way.
- **Transport** — every one of these emails currently rides interim Gmail SMTP, a
  known `LAUNCH_CHECKLIST.md` blocker. A silent delivery failure here is
  indistinguishable from a member who ignored it, and this flow depends on email at
  three separate steps.

---

## 7. Phased plan — smallest useful increment first

Each phase is independently mergeable and independently valuable. Nothing here is
started until Lee answers §8 Q1, which can change phase 1's schema.

**Phase 0 — stop the lie (do this regardless).**
Delete or disable `AddMemberWizard`'s success screen, or wire it to a real endpoint.
Today it tells staff they created a member and creates nothing. This is a live G5
defect and it is one file. Smallest possible change, largest honesty gain.

**Phase 1 — states before records.**
Extend `member_status` with `draft`, `invited`, `registered`. Change the default from
`active` to `draft`. Add an isolation-harness assertion that only `active` is
dispatchable, and audit every existing `status = 'active'` read for the assumption it
was making. *No new UI.* This makes the later phases safe rather than hazardous, and
it is the piece that cannot be retrofitted once staff are creating stubs.

**Phase 2 — staff create a real partial record.**
A server-side `member-create-draft` (service-role, staff-authenticated, following the
`partner-apply` / `member-self-service` pattern) plus a genuinely short admin form —
name, contact, whatever else is known. Replaces the ten-step shell. Members land in
`draft`.

**Phase 3 — invite and account.**
`member-send-invite` + accept page, copied from `staff-send-invite` (including its
revoke-on-reissue behaviour) and the partner invite flow. `draft` → `invited` →
`registered`. This is where `complete-member-registration` finally gets used for what
its name suggests.

**Phase 4 — pick a package and pay.**
Reuse `create-checkout` unchanged — it already takes `memberId`. Add plan selection to
the member dashboard. Webhook flips `registered` → `active`. Nothing new server-side
on the payment path, which is the point.

**Phase 5 — member completes their own details.**
For `registered`/`active` members this is authenticated dashboard editing, not a
token. Reuse the field-level rules from §5.3.

**Phase 6 — tighten the existing update-records loop.**
Lifetime to 72h, revoke-on-reissue, honour `requested_fields` in the page, masking,
append-only medical history. **This phase is edits to working code, not new code.**

---

## 8. Open questions — only Lee can answer

**Q1. Is the payer the member?** (§4) The most consequential question here. It gates
the schema and is expensive to change once real subscriptions exist. My read: for a
pendant bought by an adult child for a parent, option B is the honest model — but
this is a business decision about who the customer is.

**Q2. What may a member do with no account at all?** After this work, only `draft`
and `invited` members lack a login. Should the token path survive for them, or should
everything route through "set your password first"? Fewer bearer tokens is safer.

**Q3. Who may create a draft member?** Any staff role, or admin only? `call_centre`
taking details on a phone call is the obvious use case and argues for any staff — but
that is a PII-collection right.

**Q4. What does a `registered`, unpaid member see when they log in?** It must not
resemble a monitoring dashboard. Do they see a "choose your plan" wall, or a
dashboard with an unmistakable not-yet-covered banner? This is a G2/G3 question.

**Q5. Token lifetime — 72 hours, or keep 7 days?** (§5.2) Shorter is safer; longer is
kinder to an elderly member who checks email weekly. This trade-off is genuinely
about the users, so it is yours.

**Q6. May a member self-report blood type?** (§5.3) Real risk of confident error on a
field an operator might act on.

**Q7. Retention for `draft` records.** How long may we hold details for someone who
never became a member? 30 days? 90? This needs a number to be implementable.

**Q8. Does a staff-created draft need recorded consent before the first email?**
Depends on the lawful basis in Q6 territory — likely a question for whoever owns
GDPR compliance rather than for engineering.

---

## 9. What I did not verify

- **Live data.** No production query was run; there is no DB access from this
  environment. Any claim about how many members are currently `active`, or whether
  drafts already exist in some ad-hoc form, is unverified.
- **`submit_registration_atomic`** — since verified. It is defined in
  `20260302120000_submit_registration_atomic.sql` and inserts `members` (with an
  explicit `'inactive'` status), `medical_information` and `emergency_contacts`.
- **Whether the member dashboard currently distinguishes paid from unpaid.** Q4
  assumes it does not; that should be click-tested before Phase 4.
- **Email deliverability.** Flagged in §6 from `LAUNCH_CHECKLIST.md`, not measured
  here.
