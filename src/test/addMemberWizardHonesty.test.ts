/**
 * A UI must not claim an outcome the code does not produce (GOALS.md G5).
 *
 * `AddMemberWizard` was ten steps ending in "Complete Registration" and a success
 * screen, with ZERO data access in the file — no supabase call, no invoke, no
 * mutation. Staff could take a full set of personal and medical details from
 * someone on the phone, be told the member was created, and no record would exist.
 * On a life-safety product that is the worst failure mode available: it does not
 * fail, it reports success.
 *
 * These pin the honest state. They are not a substitute for building the feature —
 * that is blocked on MEMBER_ONBOARDING.md Q1 — they stop the lie in the meantime.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

/**
 * Source with comments removed.
 *
 * These assertions are about what the UI *claims to the user*, not about what a
 * comment *explains to a developer*. The file documents the removed behaviour on
 * purpose — including the old button label — and that prose must not read as a
 * claim. Strip comments, then assert on what is left.
 */
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const WIZARD = "src/pages/admin/AddMemberWizard.tsx";

describe("AddMemberWizard does not claim what it cannot do", () => {
  it("makes no success claim", () => {
    const src = readCode(WIZARD);
    expect(src).not.toMatch(/registered successfully|successfully (created|added|registered)/i);
    expect(src).not.toMatch(/Complete Registration/i);
  });

  it("no longer says it is unavailable — because it now works", () => {
    // This assertion inverted when the stub became the real thing. Kept rather than deleted:
    // the pin now guards the OTHER direction, so a future regression to a do-nothing screen
    // fails here instead of passing quietly.
    expect(read(WIZARD)).not.toMatch(/not available yet/i);
  });

  it("tells staff exactly what it does and does not do", () => {
    // The concrete harm was details collected and discarded, so the page has to
    // say so — a neutral "coming soon" would still invite data entry.
    const src = read(WIZARD);
    // It writes, so the warning is replaced by a statement of effect — including the two
    // things an operator would otherwise assume: that the member is live, and that we emailed.
    expect(src).toMatch(/INACTIVE/);
    expect(src).toMatch(/Sends nothing/i);
  });

  it("now collects details AND has somewhere to put them", () => {
    const src = read(WIZARD);
    // The stub deliberately had no inputs, because inputs with no write path are the defect.
    // Inputs are fine now — what must be true is that a write path exists alongside them.
    expect(src).toMatch(/<Input\b/);
    expect(src).toMatch(/from\("members"\)\s*\n?\s*\.insert/);
    // And still no client-side activation.
    expect(src).not.toMatch(/status:\s*["']active["']/);
    expect(src).not.toMatch(/from\(["']subscriptions["']\)\s*\.insert/);
  });

  it("points at something that does work", () => {
    // A dead end that offers no alternative just moves the problem.
    expect(read(WIZARD)).toMatch(/\/admin\/members/);
  });

  it("stays reachable, so the gap is visible rather than hidden", () => {
    // Deleting the route would 404 four existing entry points (MembersPage,
    // AdminDashboard, GlobalSearch, and LeadsPage's lead conversion) and quietly
    // erase a missing capability instead of surfacing it.
    expect(read("src/App.tsx")).toMatch(/path="members\/new" element=\{<AddMemberWizard \/>\}/);
  });
});

describe("the class of defect, guarded across the admin surface", () => {
  it("no admin page claims success while having no way to write", () => {
    // Generalised from the AddMemberWizard case. A page may legitimately have no
    // data access (a tab shell, an iframe, a role guard) — what it may not do is
    // combine that with a success claim.
    const pages = [
      "src/pages/admin/AddMemberWizard.tsx",
      "src/pages/admin/AIOutreachPage.tsx",
      "src/pages/call-centre/MedConneqtPage.tsx",
      "src/pages/call-centre/HolidayApprovalsPage.tsx",
    ];
    for (const p of pages) {
      const src = readCode(p);
      const writes = /\.from\(|\.invoke\(|useMutation|fetch\(|\brpc\(/.test(src);
      const claimsSuccess = /successfully|registration complete|has been (created|added|saved)/i.test(src);
      expect(writes || !claimsSuccess, `${p} claims success with no write path`).toBe(true);
    }
  });
});
