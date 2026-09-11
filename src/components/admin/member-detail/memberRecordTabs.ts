/**
 * THE TWELVE TABS ON THE MEMBER RECORD — a quiet segmented bar, scoped to one page.
 *
 * WHAT THIS REPLACES, and why the previous answer was wrong. #291 painted all twelve triggers
 * solid brand red. It fixed the complaint it was aimed at — the default `TabsList` renders
 * eleven muted-grey tabs and one white gap, which reads as eleven disabled tabs — but it spent
 * the alarm colour on navigation. MEMBER_UX_RULES R1 reserves red for alarm and critical
 * actions, and twelve red rectangles at the top of a filing screen is the loudest thing on it.
 * A member record is where somebody sits and reads; the alarm colour has to still mean alarm
 * when it appears on the same screen.
 *
 * SO: RED APPEARS EXACTLY ONCE — a 2px underline under the tab you are on. Everything else is
 * neutral. That is also the only place on this bar where red carries information.
 *
 * THE ACTIVE STATE IS STILL NEVER COLOUR ALONE, and here the arithmetic makes it unavoidable:
 * the active tab's white surface against the neutral strip is 1.10:1. On its own that is
 * invisible — so the underline and a small shadow are not decoration, they ARE the signal, and
 * the resting/active text weights differ too.
 *
 * WHY A CLASS CONSTANT AND NOT A CHANGE TO `components/ui/tabs.tsx`: unchanged from #291. The
 * same component renders the member portal's tabs, the public site's and every other admin
 * screen's. Restyling it would repaint all of them; this repaints twelve triggers on one page.
 *
 * WHY `--member-tab-fg` IS NOT AN ALIAS OF `--muted-foreground`, which is what it looks like it
 * should be: `--muted-foreground` (220 10% 46%) on the strip is **4.45:1**. That is below AA by
 * five hundredths, on the resting label of every tab. 220 12% 38% is 6.01:1. Checked in
 * memberRecordTabs.test.tsx rather than trusted.
 */

/**
 * The strip. `member-tab-strip` carries the scroll behaviour and the edge fade from index.css —
 * a mask cannot express "fade only when there is more to scroll to", and a fade that is always
 * on would dim the first and last tab on a wide screen where nothing is hidden.
 */
export const MEMBER_TAB_LIST_CLASS = [
  "member-tab-strip",
  "flex h-auto w-full items-center justify-start gap-1",
  "overflow-x-auto rounded-lg p-1",
  "bg-[hsl(var(--member-tab-strip))]",
].join(" ");

/** Put this on every `TabsTrigger` in the member record's `TabsList`. */
export const MEMBER_TAB_TRIGGER_CLASS = [
  // `relative` is load-bearing: the underline is an ::after, so it can sit inside the tab's
  // padding without changing its height between states and shifting the whole row.
  "relative shrink-0",
  // 44px is the tap target, not a look. This row is used on a phone during a courtesy call.
  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap",
  "rounded-md px-3.5 text-sm font-medium",
  "text-[hsl(var(--member-tab-fg))]",
  "transition-colors",
  "hover:bg-[hsl(var(--member-tab-hover))] hover:text-[hsl(var(--member-tab-fg-active))]",
  // Active: the card surface, lifted off the strip — 1.10:1 on its own, hence the two cues below.
  "data-[state=active]:bg-[hsl(var(--member-tab-surface))]",
  "data-[state=active]:text-[hsl(var(--member-tab-fg-active))]",
  "data-[state=active]:font-semibold",
  "data-[state=active]:shadow-sm",
  // The one red on the bar.
  "data-[state=active]:after:absolute data-[state=active]:after:inset-x-3 data-[state=active]:after:bottom-1",
  "data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full",
  "data-[state=active]:after:bg-[hsl(var(--member-tab-underline))]",
  "data-[state=active]:after:content-['']",
  // Keyboard focus, inset so it is not clipped by the strip's own overflow — an offset ring on
  // the first tab in a scrolling row gets cut off by exactly the thing that makes it scroll.
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
  "focus-visible:ring-[hsl(var(--ring))]",
].join(" ");

/**
 * The twelve, in the order they render. Exported so the page and its test cannot disagree about
 * which tabs exist — a thirteenth added to the page without a row here is caught.
 */
export const MEMBER_RECORD_TABS = [
  "profile",
  "medical",
  "contacts",
  "device",
  "subscription",
  "payments",
  "messages",
  "notes",
  "activity",
  "alerts",
  "tasks",
  "crm",
] as const;

export type MemberRecordTab = (typeof MEMBER_RECORD_TABS)[number];
