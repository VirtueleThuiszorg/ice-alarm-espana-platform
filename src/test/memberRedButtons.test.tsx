/**
 * R1 — ONE RED BUTTON PER PAGE, MAXIMUM.
 *
 * *"One red (#C8102E) button per page, maximum. Everything else Ink #14181F or outline."*
 *
 * On the member surface `--primary` IS ICE Red, and `<Button>` with no `variant` is
 * `bg-primary`. So a red button is not a styling choice anybody made — it is the DEFAULT, and
 * red accumulates on a page one convenience at a time until it means nothing. Which is the point
 * of the rule: red is how a member finds the thing to press.
 *
 * THREE PAGES HAD TWO RED BUTTONS SAYING THE SAME THING. `EmergencyContactsPage`, `MessagesPage`
 * and `SupportPage` each rendered a header action AND an empty-state action, both red, both
 * opening the same dialog, both visible at once to a member with nothing in the list yet — which
 * is precisely the member the empty state exists for. R8 puts the action in the empty state,
 * beside the sentence explaining it, so the header's slot now appears once there is a list.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE, said plainly:
 *
 *   - the INVENTORY below is a static count with a written reason per button. It cannot know
 *     which buttons are on screen together, so it does not claim to. It is a drift guard: a new
 *     red button on the member surface fails the suite until somebody writes down why it earns
 *     its colour, in the style of localeParse's IDENTICAL_TO_EN_BY_DESIGN.
 *   - the RENDERED assertions below prove the actual rule — exactly one red button on screen —
 *     for `EmergencyContactsPage`, at zero contacts and at one. That is the page where the
 *     duplicate was demonstrably visible, so it is the one proved by rendering rather than by
 *     reading.
 *
 * A button whose className overrides the background (`bg-[#25D366]`, WhatsApp green) is not red
 * and is not counted. That is not a loophole: it is a different colour on the screen, which is
 * what the rule is about. It IS a raw hex outside the token system, which is a separate problem.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/stripComments";

const ROOT = process.cwd();

/**
 * Every red `<Button>` on the member surface, in source order, each with the reason it is red.
 *
 * The pin is EXACT in both directions: an added button fails, a removed one fails as a stale
 * entry. Files with no red button are absent rather than listed as zero.
 */
const RED_BUTTONS: Record<string, string[]> = {
  "src/pages/client/DevicePage.tsx": [
    "the awaiting-pendant branch's one action — ask us where it is",
    "the phone-only branch's one action — add a pendant. Unconditional now: it used to be gated on a configured WhatsApp number, so with none configured there was NO route to the one thing that page offers",
  ],
  "src/pages/client/EmergencyContactsPage.tsx": [
    "the header action, rendered ONLY when there is already a list (see the rendered tests below)",
    "the empty state's 'add your first contact' — R8, and mutually exclusive with the header one",
    "the add/edit dialog's Submit. A dialog is its own surface with its own single action",
  ],

  "src/pages/client/MessagesPage.tsx": [
    "Send, in the thread view, which is a separate return and a separate surface",
    "the header 'new message' trigger, rendered only when there are conversations",
    "the new-message dialog's Send. A dialog is its own surface",
    "the empty state's 'send your first message' — R8, and mutually exclusive with the header one",
  ],
  "src/pages/client/SubscriptionPage.tsx": [
    "'switch to annual', the page's one action; add-a-pendant and change-to-couple are outline",
  ],
  "src/pages/client/SupportPage.tsx": [
    "Send, in the thread view, which is a separate return and a separate surface",
    "the Messages tab's 'new message' trigger, rendered only when there are conversations",
    "the new-message dialog's Send. A dialog is its own surface",
    "the Messages tab's empty state — R8, and mutually exclusive with the trigger above",
    "'send us a message' on the Help tab, which is that tab's one action",
  ],
  "src/components/client/MembershipConditionCard.tsx": [
    "the empty state's single action, and the only red button on the Membership page's empty branch",
  ],
};

/**
 * WHY `ProfilePage` AND `MedicalInfoPage` ARE NOT IN THAT LIST ANY MORE.
 *
 * Both had a red Save. R6 replaced the page-level Save with per-card Edit/Save/Cancel in the
 * shared `EditableCard`, and that Save is deliberately `variant="ink"` — because these cards
 * come in sixes. The member's Medical page has six, any number can be open at once, and a red
 * Save on each would be six red buttons on one screen. So neither page has a red button left,
 * and the pin is exact in both directions: they are ABSENT here rather than listed as zero.
 *
 * The shared card is asserted directly below rather than through this inventory, because it
 * lives in `src/components/ui` and is not part of the member-surface scan.
 */

/**
 * Comments removed, because the parser must read CODE.
 *
 * Found by mutation: a comment in `DevicePage` that EXPLAINS a button — "this was a single
 * `whatsappNumber && <Button …wa.me…>`" — was counted as a third red button on the page. The
 * same prose-vs-code slip this codebase has now made four times, this time inside the measuring
 * instrument, where it is worse: it means the inventory can be moved by writing about buttons.
 */
/** Red = `bg-primary`, which is what `<Button>` renders with no variant on this surface. */
function redButtonsIn(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const found: string[] = [];
  for (const m of src.matchAll(/<Button\b/g)) {
    // Walk to the end of the opening tag, ignoring `>` inside a JSX expression.
    let i = m.index + m[0].length;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      i++;
    }
    const tag = src.slice(m.index, i + 1);
    const isDefault = !/variant=/.test(tag) || /variant="default"/.test(tag);
    const overridesBackground = /bg-\[#/.test(tag);
    if (isDefault && !overridesBackground) found.push(tag);
  }
  return found;
}

function memberFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".tsx")) out.push(path.relative(ROOT, full));
    }
  };
  for (const r of ["src/pages/client", "src/components/client"]) walk(path.join(ROOT, r));
  return out.sort();
}

describe("R1 — the inventory of red buttons on the member surface", () => {
  const counted = new Map<string, number>();
  for (const file of memberFiles()) {
    const n = redButtonsIn(readFileSync(path.join(ROOT, file), "utf8")).length;
    if (n > 0) counted.set(file, n);
  }

  it("the shared EditableCard's Save is Ink, not red — six open cards, six red buttons", () => {
    /*
      The scan below only walks `src/pages/client` and `src/components/client`, and this card
      lives in `src/components/ui` because the staff record mounts it too. So it gets its own
      assertion: without one, moving a red button into a shared component would be a way to
      leave the inventory without changing the screen.
    */
    const card = stripComments(
      readFileSync(path.join(ROOT, "src/components/EditableCard.tsx"), "utf8"),
    );
    expect(redButtonsIn(card), "no red button in the shared card").toEqual([]);
    expect(card, "Save is Ink").toMatch(/variant="ink"[\s\S]{0,80}onClick=\{save\}/);
    // …and `ink` is a real variant rather than a className somebody hand-rolled, so the parser
    // above can tell "deliberately not red" from "forgot to say".
    expect(readFileSync(path.join(ROOT, "src/components/ui/button.tsx"), "utf8")).toMatch(
      /ink: "bg-foreground/,
    );
  });

  it("finds red buttons at all — a floor, so a broken parser cannot pass everything", () => {
    // Without this, a regex that matched nothing would make every assertion below vacuous.
    expect(counted.size).toBeGreaterThanOrEqual(6);
  });

  it("has a written reason for every red button, and no reason for a button that is gone", () => {
    const actual = Object.fromEntries([...counted.entries()].sort());
    const pinned = Object.fromEntries(
      Object.entries(RED_BUTTONS)
        .map(([f, reasons]) => [f, reasons.length] as const)
        .sort(),
    );
    expect(actual).toEqual(pinned);
  });

  it("every reason is a reason, not a placeholder", () => {
    for (const [file, reasons] of Object.entries(RED_BUTTONS)) {
      for (const reason of reasons) {
        expect(reason.length, `${file}: give the reason, not a word`).toBeGreaterThan(20);
      }
    }
  });

  it("the three duplicated header actions are gated on a non-empty list", () => {
    /*
      Asserted on the gate rather than by rendering for two of the three: `MessagesPage` and
      `SupportPage` both subscribe to a realtime channel and `SupportPage` is tabbed, so a
      rendered count there is a harness with more moving parts than the assertion is worth.
      `EmergencyContactsPage` — the same defect, the simplest data layer — IS rendered below,
      which is what makes this pattern more than a source string.
    */
    const contacts = readFileSync(path.join(ROOT, "src/pages/client/EmergencyContactsPage.tsx"), "utf8");
    expect(contacts).toMatch(/canAddMore && hasContacts &&/);

    const messages = readFileSync(path.join(ROOT, "src/pages/client/MessagesPage.tsx"), "utf8");
    expect(messages).toMatch(/conversations\.length > 0 && \(\s*<DialogTrigger/);

    const support = readFileSync(path.join(ROOT, "src/pages/client/SupportPage.tsx"), "utf8");
    expect(support).toMatch(/conversations\.length > 0 && \(\s*<DialogTrigger/);
  });

  it("and none of the three hides it with a class instead of not rendering it", () => {
    // `className="hidden"` leaves a focusable control in the tab order that nobody can see.
    for (const f of [
      "src/pages/client/MessagesPage.tsx",
      "src/pages/client/SupportPage.tsx",
      "src/pages/client/EmergencyContactsPage.tsx",
    ]) {
      expect(readFileSync(path.join(ROOT, f), "utf8")).not.toMatch(/className="hidden"/);
    }
  });
});

// ── the rendered proof, on the page where the duplicate was visible ─────────
let contactRows: Record<string, unknown>[] = [];

function chain() {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.order = () => Promise.resolve({ data: contactRows, error: null });
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => chain() },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ memberId: "m1" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: "en" },
  }),
}));

async function renderContacts() {
  const Page = (await import("@/pages/client/EmergencyContactsPage")).default;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("page-header")).toBeTruthy());
  return view;
}

function redOnScreen(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll("button")].filter((b) =>
    b.className.split(/\s+/).includes("bg-primary"),
  );
}

beforeEach(() => {
  contactRows = [];
});
afterEach(() => cleanup());

describe("R1, rendered — the emergency contacts page", () => {
  it("a member with NO contacts sees exactly one red button", async () => {
    const { container } = await renderContacts();
    await waitFor(() => expect(redOnScreen(container).length).toBe(1));
    // And it is the empty state's, not the header's — R8.
    expect(redOnScreen(container)[0].textContent).toContain("Add Your First Contact");
  });

  it("a member WITH a contact sees exactly one red button, and it is the header's", async () => {
    contactRows = [
      {
        id: "c1",
        member_id: "m1",
        contact_name: "Ana",
        relationship: "Daughter",
        phone: "+34600000000",
        email: null,
        is_primary: true,
        priority_order: 1,
        speaks_spanish: true,
        notes: null,
      },
    ];
    const { container } = await renderContacts();
    await waitFor(() => expect(redOnScreen(container).length).toBe(1));
    expect(redOnScreen(container)[0].textContent).toContain("Add Contact");
  });

  it("the empty state still offers the action — R8 is not satisfied by removing a button", async () => {
    // The lazy way to pass R1 is to delete the empty state's button. That leaves a member with
    // no contacts looking at a sentence about why they matter and nothing to press.
    await renderContacts();
    await waitFor(() =>
      expect(screen.getByText(/Add Your First Contact/)).toBeVisible(),
    );
  });
});
