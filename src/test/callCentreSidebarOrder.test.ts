// @vitest-environment node
//
// The order of the call-centre sidebar, which is Lee's decision and not a detail.
//
// An operator's hand goes to the same place every time; a list that reorders itself between
// releases costs a second per navigation for the rest of the shift, and the second one of those
// happens during an alert is the one that matters. So the order is pinned here rather than left
// to whoever next edits the array — and pinned as a SEQUENCE, not as a set of pairwise
// comparisons, because "Members is before Messages" stays true through half a dozen wrong
// orders.
//
// Read from the source text rather than by rendering: the array is a module-level constant, and
// asserting on the file is what makes the assertion about the DECLARED order rather than about
// whatever a particular render happened to produce (badges, role filtering, the mobile sheet).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SIDEBAR = readFileSync(join(ROOT, "src/components/layout/CallCentreSidebar.tsx"), "utf8");

/**
 * The `menuItems` array's text, and nothing else in the file.
 *
 * Scoping matters: a supervisor-only "holiday approvals" item is spliced in at render time from
 * outside this array, so a file-wide scan counts twelve paths against eleven menu items — which
 * is what the first version of the path assertion below did, and it failed for that reason
 * rather than for a real one.
 */
function menuBlock(): string {
  const start = SIDEBAR.indexOf("const menuItems: MenuItem[] = [");
  expect(start, "menuItems array not found — this whole file would be vacuous").toBeGreaterThan(-1);
  const end = SIDEBAR.indexOf("];", start);
  expect(end).toBeGreaterThan(start);
  return SIDEBAR.slice(start, end);
}

/** The labelKeys of `menuItems`, in declaration order. */
function menuOrder(): string[] {
  return [...menuBlock().matchAll(/labelKey:\s*"sidebar\.(\w+)"/g)].map((m) => m[1]);
}

/** Lee's order, dashboard notes 9 Sep: Members third, Alerts in the slot Members had. */
const REQUIRED_HEAD = ["dashboard", "medconneqt", "members", "leads", "alerts", "messages"];

describe("call-centre sidebar order", () => {
  const order = menuOrder();

  it("parses the menu at all", () => {
    // Guards the regex: a rename of `labelKey` would otherwise make every assertion below pass
    // against an empty list.
    expect(order.length).toBeGreaterThanOrEqual(REQUIRED_HEAD.length);
  });

  it("starts with Dashboard, MedConneqt, Members, Leads, Alerts, Messages — in that order", () => {
    expect(order.slice(0, REQUIRED_HEAD.length)).toEqual(REQUIRED_HEAD);
  });

  it("Members is THIRD — the item an operator reaches for by hand most often", () => {
    expect(order[2]).toBe("members");
  });

  it("Alerts sits where Members used to, fifth", () => {
    // Not a demotion of the alert path: an operator reaches a live alert from the dashboard, from
    // this item's badge, and from the alert arriving — never by hunting for it third in a list.
    expect(order[4]).toBe("alerts");
    expect(order.indexOf("alerts")).toBeGreaterThan(order.indexOf("members"));
  });

  it("MedConneqt is DIRECTLY under Dashboard", () => {
    // medconneqtEmbed.test.ts claims this and proves only "before alerts", which stayed true
    // through this reordering while alerts moved three slots. Adjacency is the claim, so
    // adjacency is what is asserted.
    expect(order.indexOf("medconneqt")).toBe(order.indexOf("dashboard") + 1);
  });

  it("every item still has a path, and none was lost in the reorder", () => {
    const paths = [...menuBlock().matchAll(/path:\s*"(\/call-centre[^"]*)"/g)].map((m) => m[1]);
    expect(paths.length).toBe(order.length);
    // The set, so a swap cannot pass by leaving one item pointing at another's route.
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths[order.indexOf("members")]).toBe("/call-centre/members");
    expect(paths[order.indexOf("alerts")]).toBe("/call-centre/alerts");
  });

  it("the supervisor-only holiday-approvals item is NOT part of the fixed order", () => {
    // It is spliced in at render time for supervisors and admins, so it is deliberately outside
    // `menuItems` — and outside this file's remit. Asserted so the scoping above is a decision a
    // reader can see rather than a quirk of a regex.
    expect(order).not.toContain("holidayApprovals");
    expect(SIDEBAR).toContain('labelKey: "sidebar.holidayApprovals"');
  });

  it("the badges stayed with their own items", () => {
    // Alerts and Messages carry counts. A reorder that moved a badgeKey onto the wrong row would
    // put the alert count on Leads, which reads as five people waiting rather than five alerts.
    expect(SIDEBAR).toMatch(/labelKey: "sidebar\.alerts", path: "\/call-centre\/alerts", badgeKey: "alerts"/);
    expect(SIDEBAR).toMatch(
      /labelKey: "sidebar\.messages", path: "\/call-centre\/messages", badgeKey: "messages"/,
    );
  });
});
