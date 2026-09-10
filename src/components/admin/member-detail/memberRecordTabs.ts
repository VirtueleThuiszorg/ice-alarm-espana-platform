/**
 * THE RED TABS ON THE MEMBER RECORD — a variant, scoped to one page.
 *
 * WHAT IT REPLACES: the default `TabsList`, where an inactive trigger is muted grey and the
 * ACTIVE one is white. On a twelve-tab row that reads as eleven disabled tabs and one gap, and
 * it was Lee's complaint.
 *
 * WHY A CLASS CONSTANT AND NOT A CHANGE TO `components/ui/tabs.tsx`. The same component renders
 * the member portal's tabs, the public site's and every other admin screen's. Restyling it
 * would repaint all of them; this repaints twelve triggers on one page. The tokens are scoped
 * for the same reason — see the `--member-tab` block in src/index.css for why `bg-primary` is
 * not the answer here (on .theme-admin it is Ink, on purpose).
 *
 * THE ACTIVE STATE IS NEVER COLOUR ALONE. Darker red on red is 1.58:1 — visible in good light
 * on a good monitor and nowhere else — so the active tab also carries a white ring and a white
 * underline. WCAG 1.4.1, and the reason somebody can tell which tab they are on.
 */

/** Put this on every `TabsTrigger` in the member record's `TabsList`. */
export const MEMBER_TAB_TRIGGER_CLASS = [
  // Solid brand red, white text — the resting state of every tab, not just the active one.
  "rounded-md border border-transparent px-3 py-1.5 text-sm font-medium",
  "bg-[hsl(var(--member-tab))] text-[hsl(var(--member-tab-foreground))]",
  "transition-colors",
  "hover:bg-[hsl(var(--member-tab-hover))]",
  // Darker red AND a white ring AND an underline. Three cues, because one of them is a colour
  // difference somebody may not be able to see.
  "data-[state=active]:bg-[hsl(var(--member-tab-active))]",
  "data-[state=active]:text-[hsl(var(--member-tab-foreground))]",
  "data-[state=active]:ring-2 data-[state=active]:ring-white data-[state=active]:ring-inset",
  "data-[state=active]:underline data-[state=active]:underline-offset-4 data-[state=active]:decoration-2",
  // The default variant turns the active trigger white with a shadow; both are overridden above,
  // and the shadow is dropped so the row reads as one band of cards.
  "data-[state=active]:shadow-none",
  // Keyboard focus must be unmissable ON red, so the ring offsets against the page rather than
  // sitting inside the tab where the white active ring already lives.
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");

/** The list itself: a wrapping band with no grey plate behind it. */
export const MEMBER_TAB_LIST_CLASS = "flex h-auto flex-wrap gap-1 bg-transparent p-0";

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
