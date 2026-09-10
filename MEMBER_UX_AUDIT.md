# MEMBER_UX_AUDIT.md — the member portal, walked against MEMBER_UX_RULES

> Walk of 10 September 2026. Every page in the member sidebar (Dashboard, My device, Profile,
> Contacts, Medical, Messages, Subscription, Support) plus the layout that wraps them, checked
> against `MEMBER_UX_RULES.md`.
>
> The brief that produced this asked for the walk to **list remaining deviations rather than
> restyle silently**, so that is what most of this file is. Two things were fixed rather than
> listed, and each says why below: a dead control on a life-safety surface is not a styling
> deviation, and a raw hex whose twin was already being removed elsewhere is not worth leaving
> half-done.
>
> The machine-checkable parts of this list are pinned in `src/test/memberSidebarD12.test.tsx`,
> so it cannot rot into a claim nobody re-reads. The rest is prose and needs a human.

---

## Fixed in this walk

### 1. The sidebar's "Contact ICE Alarm España" button did nothing — D12

A full-width `<Button size="lg">` in `bg-alert-sos`, on **every page** of the member portal,
with no `onClick`, no `href` and no `asChild`. A member who pressed the biggest, reddest control
on their own alarm account got nothing at all.

This is not a styling miss. It is the button somebody reaches for when they are frightened, and
its colour promised an emergency response. `e2e/helpers/pageAudit.ts` has a no-op heuristic that
would have caught it — it only walks **public** pages, so it never looked here.

D12 already said what it should be: *"the red 'Contact' button becomes an Ink block **showing the
24-hour number**."* It is now an `<a href="tel:…">` in Ink that shows the number, omitted entirely
when `settings_emergency_phone` is unset (WP1b: show nothing, never a fake number), with the
number in its accessible name for the collapsed rail.

### 2. The active nav item was brand red — D12

`--sidebar-primary` is `350 85% 42%`: the brand red. The active item, the active group heading
and the active group icon were all painted with it, so a member's current page was marked in the
alert colour, on every page, permanently — and a colour that is always on screen is a colour that
means nothing the day it appears on something that matters (R2).

Now a lighter step of the sidebar's own dark blue-grey. **The staff sidebars deliberately keep
theirs**: D12 is a member-surface decision and `ICE_OPERATOR_CARD_SPEC` governs the operator and
admin surfaces, so this is a class in `ClientLayout` rather than a change to the shared token.

### 3. `ClientDashboard`'s WhatsApp button was raw hex

`bg-[#25D366] hover:bg-[#128C7E] text-white` — WhatsApp's brand green, outside the token system,
and white on `#25D366` is **2.1:1**, below WCAG AA for text of any size. `DevicePage` lost the
same two declarations in #324; this was the other place they lived, and leaving one of a pair is
worse than leaving both. Now an outline icon button like every other control in that header.

---

## Remaining deviations, listed and not touched

### A. `SupportPage.tsx` still carries `#25D366`

`bg-[#25D366]` and `text-[#25D366]` on the Help tab's WhatsApp affordances. Same colour, same
contrast failure as the two above.

**Not fixed here** because `SupportPage` is 951 lines with four tabs, and the WhatsApp block sits
inside a section that also decides what a member is offered when they need help. Restyling it is
a bigger change than a nav walk should make silently — it wants its own PR and its own
click-through. Pinned as the **only** permitted raw hex on the member surface by
`memberSidebarD12.test.tsx`, exact in both directions: a new one fails, and so does leaving this
entry behind once it is fixed.

### B. The nav takes two clicks to reach most pages

The sidebar groups its items under collapsible headings (Home / My Account / Services / Billing /
Support), and a group is open only when a route inside it is **already active**. So from the
dashboard, "My device" is not merely hidden — it is **not in the DOM at all** until the member
opens "Services".

Five destinations behind eight clicks is a lot for a portal whose readers are, by design,
elderly. R5 and D12 say nothing about it, so it is not a rule violation — but it is the single
biggest friction in the portal and it is a product decision, not a code one. Recorded in
`e2e/memberPortalShell.spec.ts`, which opens the group before clicking rather than working
around it.

### C. `AlertHistoryPage` uses three gradient stat tiles

`bg-gradient-to-br from-alert-*/10` on the total / resolved / pending tiles. Tokens, not raw hex,
so it is inside the system — but R4 specifies flat white cards with one border and one shadow, and
a gradient is neither. Left alone because the page is hidden from members by default as of
`member_alert_history_enabled` (#330), so restyling it now would be work on a screen nobody sees;
it should be done if and when the setting is turned on.

### D. `SupportPage` and `AlertHistoryPage` each render one gradient card

Same reasoning as C. Listed for completeness.

### E. R9 (*usted*) is not machine-checked

`localeParse.test.ts` proves the Spanish and Dutch files have no English left in the
member-facing namespaces, and every string added by this brief is formal *usted*. It does **not**
prove the absence of *tú* in strings that predate it. A `\btu\b|\btus\b|puedes|tienes` sweep over
the member-facing namespaces would, and is a small piece of work worth doing — but it needs a
human to read the hits, because "tu" is a substring of ordinary Spanish words and a naive rule
would be red for ever and then pinned around.

### F. `SubscriptionPage` renders two `PageHeader`s

One for the loaded state and one for the empty one. Both go through the shell, so R5 holds
literally; the empty one has no subtitle, which is why it was written separately. Worth
collapsing into one call with a conditional subtitle, but it changes nothing a member sees.
### G. Two cards on Profile are NOT locked until Edit — and one of them should stay that way

The locked-until-Edit walk (#311) covered the **field** cards. Two cards on the same page are not
field cards and were left alone, which the "What holds" note below originally over-claimed:

- **Notifications** — three consent switches (`NotificationPreferences`), live on load, each
  saving itself. That is deliberate and worth keeping: a consent switch behind an Edit button is
  two clicks and a Save to turn off a text message, and a member who has decided to stop being
  messaged should not have to find a Save. The switches carry no destructive power — R7's own
  argument for locking DOB does not apply to "email me about my pendant".
- **Privacy & Data** — Download / Manage cookies / Delete account. Actions, not fields, so
  "read-only until Edit" has nothing to lock; Delete goes through its own confirmation.

Listed rather than changed because changing the first would make the portal worse, and the
second has nothing to change. What was wrong was the **claim**, which is corrected below.

---

## What holds

- **R5, one page shell** — all nine pages compose from `PageHeader`, and none hand-rolls an
  `<h1>`. Asserted.
- **R6, read-only by default** — every **field** card on Profile, Medical and the staff record is
  locked until Edit (#311, #301). Contacts, Notes, Tasks, Device and Subscription arm their
  controls behind Edit rather than leaving Add and Delete one stray click away. The two cards on
  Profile that are not field cards are the exception, and G says why one of them should remain
  one.
- **R7, the photo and what stays locked** — a member uploads their own photograph into a private
  bucket (#343), and DOB / NIE / email / country stay locked **with a reason**, including while
  their card is unlocked.
- **R10, type size** — 16px body and 13px labels, in `rem` so the A/A control moves them.
- **R2, brand red is never a status** — the last two places it was (the sidebar's permanent
  "emergency" block and the active nav item) are fixed above.
- **R1, one red button per page** — pinned exactly by `memberRedButtons.test.tsx`, with a written
  reason for every one that remains.
