// @vitest-environment node
//
// The member CRM record, control by control (Lee's dashboard notes, 9 Sep, item 4: "walk every
// link and button on the member CRM record (all tabs); register each; fix dead ones").
//
// THE WALK FOUND TWO DEAD BUTTONS on the Subscription tab, and they were dead in the worst way
// — they looked like the two most consequential controls on the record:
//
//   `Create Subscription`  no onClick at all. A staff member could press it repeatedly while
//                          believing they had signed the member up. Replaced by
//                          SendPaymentLinkDialog, which asks the SERVER for a Stripe session.
//   `Change Plan`          no onClick either. Plan changes are `switch_to_single` /
//                          `switch_to_couple` in MemberActionsCard, where they carry a reason
//                          and an actor. Removed rather than re-pointed: two ways to change a
//                          subscription, one of which writes the database and leaves Stripe
//                          charging, is worse than either alone.
//
// So this file is the walk kept AS A TEST, because a walk done once is a walk that has to be
// done again after the next PR. Every Button, anchor, Link and menu item on every tab of the
// record must be wired to something, and nothing on the record may write a money table from the
// browser.
//
// A source scan cannot prove a control does the RIGHT thing — that is what the contract tests
// beside this one are for. It can prove a control does SOMETHING, which is the failure mode
// this record actually had.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { stripComments } from "./helpers/stripComments";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => stripComments(read(p));

const DIR = "src/components/admin/member-detail";
const PAGE = "src/pages/admin/MemberDetailPage.tsx";

/** Every file that renders part of the member record. */
const RECORD_FILES = [
  ...readdirSync(join(ROOT, DIR))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `${DIR}/${f}`),
  PAGE,
];

/**
 * The opening tag starting at `start`, brace-aware.
 *
 * Naive `indexOf(">")` breaks on the first JSX expression attribute — `onClick={() => x > 1}`
 * ends the tag early and the scan then reports a wired control as dead. Counting braces is what
 * makes the result about the tag rather than about the first `>` in the file.
 */
function openingTag(src: string, start: number): string {
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, j + 1);
  }
  return src.slice(start, start + 300);
}

interface Control {
  file: string;
  line: number;
  kind: string;
  tag: string;
}

/** Every interactive control on the record, with the ones that are wired filtered out. */
function deadControls(): Control[] {
  const dead: Control[] = [];

  for (const file of RECORD_FILES) {
    const src = code(file);

    for (const kind of ["Button", "a", "Link", "DropdownMenuItem", "TabsTrigger"]) {
      const re = new RegExp(`<${kind}\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const tag = openingTag(src, m.index);
        const line = src.slice(0, m.index).split("\n").length;
        const before = src.slice(Math.max(0, m.index - 300), m.index);

        let problem: string | null = null;

        if (kind === "a" && !/href=/.test(tag)) problem = "anchor with no href";
        if (kind === "Link" && !/to=/.test(tag)) problem = "Link with no to";
        if (kind === "TabsTrigger" && !/value=/.test(tag)) problem = "tab with no value";

        if (kind === "Button" || kind === "DropdownMenuItem") {
          const wired = /onClick|asChild|type="submit"/.test(tag);
          // A control can also be wired by its PARENT: Radix triggers use `asChild` and clone
          // the handler onto the child, and a control passed as a `trigger={...}` prop is
          // rendered inside one of those. Both are wired; neither carries an onClick.
          const byParent =
            /(Dialog|AlertDialog|Popover|DropdownMenu|Sheet|Tooltip|Collapsible)Trigger asChild>[\s\S]{0,80}$/.test(
              before,
            ) || /trigger=\{[\s\S]{0,80}$/.test(before);
          if (!wired && !byParent) problem = "no handler";
        }

        // `onClick={() => {}}` is the same defect wearing a handler.
        if (/onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(tag)) problem = "empty handler";

        if (problem) dead.push({ file, line, kind: problem, tag: tag.replace(/\s+/g, " ").slice(0, 120) });
      }
    }
  }

  return dead;
}

describe("every control on the member record does something", () => {
  it("no dead buttons, anchors, links or menu items on any tab", () => {
    const dead = deadControls();
    expect(
      dead.map((d) => `${d.file}:${d.line} [${d.kind}] ${d.tag}`),
      "a control with no handler is worse than a missing one: staff believe it worked",
    ).toEqual([]);
  });

  it("the scan is not vacuous — it finds the controls it is meant to be checking", () => {
    // The load-bearing guard on the guard. A regex that matched nothing would report a clean
    // record forever, which is exactly how the two dead buttons survived a review.
    let buttons = 0;
    for (const file of RECORD_FILES) buttons += (code(file).match(/<Button\b/g) ?? []).length;
    expect(buttons).toBeGreaterThan(20);
    expect(RECORD_FILES.length).toBeGreaterThan(15);
  });

  it("catches a dead button when one is put back", () => {
    // Proves the scan by construction rather than by trust: the same predicate, run over a
    // fixture that IS dead. (The real files are scanned above; this is the mutation, inline.)
    const fixture = `<Button variant="outline">Change Plan</Button>`;
    const tag = openingTag(fixture, 0);
    expect(/onClick|asChild|type="submit"/.test(tag)).toBe(false);
  });
});

describe("the two dead controls this walk found are gone", () => {
  const tab = code(`${DIR}/SubscriptionTab.tsx`);

  it("Create Subscription is replaced, not merely relabelled", () => {
    expect(tab).not.toContain("Create Subscription");
    expect(tab).toContain("<SendPaymentLinkDialog");
    expect(existsSync(join(ROOT, DIR, "SendPaymentLinkDialog.tsx"))).toBe(true);
  });

  it("Change Plan is gone, and the plan actions it pretended to be still exist", () => {
    expect(tab).not.toContain("Change Plan");
    const actions = read("src/lib/memberActions.ts");
    expect(actions).toContain("switch_to_single");
    expect(actions).toContain("switch_to_couple");
    expect(tab).toContain("<MemberActionsCard");
  });
});

describe("what the record writes to a money table from the browser", () => {
  /** The tables where a client-side write is at least a question, and sometimes a rule break. */
  const MONEY_TABLES = ["subscriptions", "payments", "orders", "stripe_prices", "payers"];
  const WRITES = /\.(insert|update|upsert|delete)\(/;

  /**
   * The EXACT list of client-side money writes on this record today, pinned in the style of
   * i18nKeyCoverage's KNOWN_MISSING: a NEW one fails this suite, and removing one of these
   * requires deleting its line here, which is how a fix gets noticed.
   *
   * Both were found by this walk (item 4) and both are DELIBERATELY NOT FIXED HERE — each is
   * its own concern, and neither is what item 4 was asked to change. They are written up for
   * Lee in PENDING_FOR_LEE.md rather than left as a silent finding in a test file.
   *
   *   DeviceTab → subscriptions   mirrors `has_pendant` onto the billing row when a device is
   *                               assigned or unassigned. Not activation and not a price, but it
   *                               is `.eq("member_id", …)` — so it writes EVERY subscription the
   *                               member has ever had, including cancelled ones, and a member
   *                               with an old row gets its flag rewritten by a device action.
   *   PaymentsTab → payments      records a manual bank transfer as `status: "completed"` from
   *                               the browser, with no actor and no reason. It activates nobody
   *                               (golden rule 4 is intact: no members.status, no subscription
   *                               status), but "who says this money arrived?" is unanswerable
   *                               from the row.
   */
  const KNOWN_CLIENT_MONEY_WRITES = [
    "src/components/admin/member-detail/DeviceTab.tsx → subscriptions",
    "src/components/admin/member-detail/PaymentsTab.tsx → payments",
  ];

  const found = () => {
    const offenders = new Set<string>();
    for (const file of RECORD_FILES) {
      const src = code(file);
      for (const table of MONEY_TABLES) {
        const re = new RegExp(`from\\(\\s*["']${table}["']\\s*\\)([\\s\\S]{0,200})`, "g");
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          if (WRITES.test(m[1])) offenders.add(`${file} → ${table}`);
        }
      }
    }
    return [...offenders].sort();
  };

  it("no NEW client-side money write, and no fixed one left in the pin", () => {
    expect(found()).toEqual([...KNOWN_CLIENT_MONEY_WRITES].sort());
  });

  it("the payment-link path is NOT one of them — it goes through the server", () => {
    // The control this item added writes nothing itself: an edge function creates the rows
    // inside one transaction under the service role.
    const dialog = code(`${DIR}/SendPaymentLinkDialog.tsx`);
    expect(dialog).not.toMatch(/from\(\s*["'](subscriptions|payments|orders)["']/);
    expect(code("src/hooks/useSendPaymentLink.ts")).toContain('functions.invoke("send-payment-link"');
  });

  it("nothing on the record writes subscriptions.status or a plan", () => {
    // This half IS a rule, not a finding: WP7 removed the client status writes after Cancel
    // left the database saying cancelled while Stripe kept charging the card.
    for (const file of RECORD_FILES) {
      const src = code(file);
      expect(src, file).not.toMatch(/from\(\s*["']subscriptions["']\s*\)[\s\S]{0,200}?status:/);
      expect(src, file).not.toMatch(/from\(\s*["']subscriptions["']\s*\)[\s\S]{0,200}?plan_type:/);
    }
  });

  it("where members.status IS written, the database's refusal is shown to the operator", () => {
    // Two staff surfaces set a member's status: the profile form's dropdown and the
    // suspend/reinstate button. Since 20260909110000 the database refuses `active` unless a
    // subscription says somebody paid — and that refusal carries the sentence that tells the
    // staff member what to do instead ("send them a payment link"). A generic "Failed to
    // update member" toast throws that sentence away, which is how a guard becomes a mystery.
    const writers = RECORD_FILES.filter((f) =>
      /from\(\s*["']members["']\s*\)[\s\S]{0,300}?status:/.test(code(f)),
    );
    expect(writers.sort()).toEqual([
      "src/components/admin/member-detail/ProfileTab.tsx",
      "src/pages/admin/MemberDetailPage.tsx",
    ]);
    for (const file of writers) {
      expect(code(file), file).toMatch(/error\.message|err\.message|e\.message/);
    }
  });
});

describe("every tab of the record is still mounted", () => {
  const page = code(PAGE);

  /** value → the component that renders it. A tab whose panel is empty is a dead tab. */
  const TABS: Array<[string, string]> = [
    ["profile", "ProfileTab"],
    ["medical", "MedicalTab"],
    ["contacts", "ContactsTab"],
    ["device", "DeviceTab"],
    ["subscription", "SubscriptionTab"],
    ["payments", "PaymentsTab"],
    ["messages", "MessagesTab"],
    ["notes", "NotesTab"],
    ["activity", "ActivityTab"],
    ["alerts", "AlertsTab"],
    ["tasks", "TasksTab"],
    ["crm", "CRMTab"],
  ];

  it.each(TABS)("the %s tab has a trigger, a panel and a component", (value, component) => {
    expect(page).toContain(`<TabsTrigger value="${value}"`);
    expect(page).toContain(`<TabsContent value="${value}"`);
    expect(page).toContain(`<${component}`);
    expect(page).toContain(`import { ${component} }`);
  });

  it("there are no triggers without panels, or panels without triggers", () => {
    const triggers = [...page.matchAll(/<TabsTrigger value="(\w+)"/g)].map((m) => m[1]).sort();
    const panels = [...page.matchAll(/<TabsContent value="(\w+)"/g)].map((m) => m[1]).sort();
    expect(triggers).toEqual(panels);
    expect(triggers).toEqual(TABS.map(([v]) => v).sort());
  });
});
