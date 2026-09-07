# CIRCLE_OF_CARE.md — who the people around a member actually are

> **Status:** DESIGN + schema. The schema lands in PR #180 (held for Lee); nothing is marked
> working until a named assertion proves it (GOALS.md G5).
>
> **Date:** 2026-09-07 · **Verified against:** `147a6bf` (main) · **Author:** WP5.

---

## 0. The distinction this document turns on

**WP5 is about who the people ARE. `care_access_grants` is about what they may SEE.**

Those are different questions and they must not be collapsed:

| | `emergency_contacts` (+ this work) | `care_access_grants` (CONSENT_MODEL.md) |
|---|---|---|
| Answers | *who would we call, and what can they do?* | *what may this person read?* |
| Needs a login | ❌ never | ✅ to be of any use |
| Needs consent | ❌ it is a phone number the member gave us | ✅ that is the whole point |
| Created by | the member, or staff taking the details | the member, explicitly, per category |

A neighbour with a key is in the circle of care and may be phoned at 3am. That does not entitle
them to read a medical record, and nothing here gives them one. **`care_access_grants` remains
the only access mechanism, unchanged.** If someone in the circle should also be able to *see*
something, they get a grant, separately and deliberately.

---

## 1. What is broken today — verified, not asserted

### 1-A The contact list cannot describe the people it holds

`emergency_contacts.contact_type` exists (`20260903091600`) and has exactly two values:

```sql
CHECK (contact_type IN ('emergency','key_holder'))
```

Everyone else a real member has is squeezed into `relationship`, a free-text field. A care
agency, a district nurse, a social worker and the neighbour with the spare key are all
"emergency" with a sentence next to them. An operator at 3am is reading prose to work out
whether the person they are about to ring can actually open the front door.

### 1-B Nothing records who can physically get there

The single most operationally useful fact about a contact — **can they attend in person?** —
is not stored. Nor is the country they are in. A daughter in Manchester and a neighbour two
doors down are indistinguishable to the escalation ladder, and the ladder currently phones
them in `priority_order` as if they were interchangeable.

### 1-C A Spanish address is not `address_line_1`

`members` carries `address_line_1/2`, city, province, postal code. Andalusian addresses on
this member base are routinely *urbanización, bloque, portal, escalera* — and an ambulance
crew that has the street but not the portal is standing outside a gated development at night.
Squashing that into one free-text line is where the minutes go.

### 1-D Nothing knows the member is away

There is no `away_from` / `away_until`, and no record of whether the pendant went with them.
So a member in the UK for six weeks looks identical to one at home, and a device that has gone
quiet cannot be told apart from a device whose owner is in Birmingham with it in a drawer.

### 1-E The care picture lives nowhere

Visiting agency, visit schedule, day centre, medical equipment in the home, where the advance
directive is kept, the TSI number — none of it exists in the schema. These are exactly the
things an operator needs in the first ninety seconds, and exactly the things that are
special-category data under GDPR art. 9.

---

## 2. The schema, and why each piece sits where it does

### 2.1 `emergency_contacts` — widened, not replaced

`contact_type` gains six values: `carer`, `care_agency`, `nurse`, `social_worker`,
`neighbour`, `legal_representative`, alongside the existing `emergency` and `key_holder`.
Widening a CHECK is backward-compatible — every existing row stays valid — and the default
remains `emergency`.

Three columns are added:

| Column | Why |
|---|---|
| `can_attend_in_person` | 1-B. The one fact that decides whether this contact is useful *tonight* |
| `country` | 1-B. A contact abroad is a phone call, never a doorstep |
| `availability_notes` | free text on purpose — "nights only", "works Tuesdays" resists an enum, and forcing one produces lies |

### 2.2 `members` — away status and the Spanish address

`away_from`, `away_until`, `pendant_with_member` (1-D), and `urbanizacion`, `bloque`, `portal`,
`escalera` (1-C). These go on `members` rather than a side table because they are ordinary
profile facts the member may maintain themselves — and the existing "Members can update own
profile" policy already covers them, with the `guard_member_status_self_write` trigger from
`20260904180000` keeping `status` out of reach. **Away status is member-writable by design:** a
member going to the UK for a month should be able to say so without ringing the office.

`gate_code` goes on **`member_access`**, not `members` — it is a credential to a door, and
`member_access` is the admin-only table that already exists for exactly that (key safe code,
location, access notes). Putting it on `members` would make it readable by every `is_staff`
policy on that table. This is the one placement decision in WP5 worth arguing about, and it is
decided on the same reasoning `member_access` was created with.

### 2.3 `member_care` — new, special-category, admin-restricted

Agency, visit schedule, day centre, medical equipment, advance-directive location, TSI number.
One row per member.

**RLS is modelled on `member_access`, not on the ordinary member tables:** admin read, admin
write, and the member may read their own row and nothing else. Not `is_staff`. If a call-centre
operator needs an advance-directive location during an alert, that must be a deliberate
decision with an access log behind it, not a side effect of a broad policy — which is the exact
argument `20260903091300` made for the key safe code, and it applies at least as strongly to a
document recording what treatment somebody has refused.

**A carer with a `care_access_grant` still cannot read it.** The grant categories are `alerts`,
`location`, `medical`, and `medical` maps to `medical_information` — the member's own clinical
record — not to the operational care picture. Widening a grant to reach `member_care` would be
a consent decision, and it is not being made silently inside a schema PR.

---

## 3. What is deliberately NOT here

- **No new access path.** Nothing in WP5 lets anybody read anything they could not read before,
  except admins reading two new admin-only stores. `care_access_grants` is untouched.
- **No escalation-ladder change.** `can_attend_in_person` is recorded; nothing yet *uses* it to
  reorder who gets called. That is a change to the SOS path and carries the human gate.
- **No free-text medical.** `member_care` holds operational facts, not a clinical history.

---

## 4. How it is proven

`scripts/rls/isolation.sql`, mutation-tested like the rest of the bundle:

1. all eight `contact_type` values are accepted, and a ninth is refused by the CHECK
2. a member may set their OWN away status — the point of 1-D
3. a member may **not** write `member_care` — it is admin-maintained
4. a member reads their own `member_care` and **not** another member's
5. a carer holding a live `medical` grant reads **no** `member_care` — §2.3's whole argument
6. a carer holding a live `medical` grant **does** read `medical_information`, so assertion 5
   is about `member_care` specifically and not about a broken carer fixture
7. an ordinary staff member reads **no** `member_care` and **no** `gate_code` — admin only
8. `gate_code` lives on `member_access` and is not reachable through `members`
