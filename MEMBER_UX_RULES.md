# MEMBER_UX_RULES.md — the design, as rules

> Committed verbatim from Lee's brief of 5 September 2026. A canvas exists that Claude Code
> cannot see; **these rules ARE the design.** Build to them and the result matches.
>
> Scope: the member-facing dashboard (`/dashboard/*`) and the surfaces a member reads.
> Operator and admin screens are governed by `ICE_OPERATOR_CARD_SPEC.md` and keep their own
> density — see R11.

---

## R1 — One red button per page

One red (`#C8102E`) button per page, **maximum**. Everything else Ink `#14181F` or outline.

## R2 — Brand red is never a status

Brand red never on an alert, warning or status. Those use the alert/status families or Ink.

## R3 — The header

Header (64px, white):

- **LEFT** — readiness notice, amber-on-cream (`#FEF8E6` background / `#F4E3A8` border /
  `#7A5C00` icon), one sentence + "Add them →", **undismissible**, renders **only on a SETTLED
  zero-contacts** (never while loading — `ICE_OPERATOR_CARD_SPEC.md` §5.1.2).
- **RIGHT** — Assistant outline pill, bell, A/A text size, EN/ES, initials avatar + name + role.

## R4 — Surfaces

Page ground `#F3F4F6`. Cards white, 1px `#E2E5EA` border, 12px radius, 24px padding, shadow
`0 1px 2px rgba(20,24,31,.05), 0 4px 12px rgba(20,24,31,.04)`.

## R5 — One page shell

28px Archivo 700 title + 16px Slate `#5A6470` subtitle. Every page is composed from
`PageHeader`, `Card`, `EmptyState` — **delete every hand-rolled header.**

## R6 — Read-only by default

Read-only by default. Edit per section, then Save. Fields as label (13px uppercase Slate) /
value (16px Ink). Empty = "Not added" + inline Add. **Never "contact support to change".**

## R7 — Photo, and what stays locked

Members upload their own photo (Supabase storage, size-limited, RLS: own bucket path). DOB and
NIE stay locked **with a reason**: "Call us to change this — we need to verify who you are."

## R8 — Empty states offer the action

"No active subscription" shows the plans.

## R9 — Spanish uses *usted*

Throughout. Fix the existing *tú* strings in `es.json`.

## R10 — Type size

16px body, 13px labels minimum. A/A control persists per user (localStorage is fine).

---

## R11 — Two audiences, two densities (from D11)

Member pages: **16px body minimum**, with the A/A control. **Operator screens keep 14px.**

This is the same principle `ICE_OPERATOR_CARD_SPEC.md` §5.2 records for tone: the correct
presentation for one reader is the wrong presentation for the other. An operator scanning a
dense screen under time pressure is not served by 16px; a 78-year-old reading their own alarm
account is not served by 14px. Neither is a compromise to be split.

---

## Decisions this encodes (5 September 2026)

- **D10** — the readiness notice lives in the member header, left of Assistant / bell /
  language / name. **Never a standalone banner.** Company announcements go in the bell, never
  in page content.
- **D11** — see R11.
- **D12** — sidebar: active item is a dark fill, not red; the red "Contact" button becomes an
  **Ink block showing the 24-hour number**; "My Device" → "My pendant"; "Subscription" →
  "Membership"; "Contact Support" → "Help & support".
