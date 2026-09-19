/**
 * THE SPAM FLAG IS A GUESS, AND THE SCREEN HAS TO TREAT IT AS ONE.
 *
 * `public-submit` sets `suspected_spam` from three heuristics. Every one of them has a real
 * enquiry that trips it, and the third has a particularly expensive one: the next message
 * written in Spanish with the English flag selected will be a daughter in Almería who did not
 * notice the picker. A product that answers a pendant press cannot lose her enquiry to a
 * regex.
 *
 * So what this file guards is mostly what the flag must NOT do: not hide the row, not colour it
 * red, not be un-clearable, and not assert a reason it cannot show.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

import { LeadNotSpamButton, LeadSpamBadge } from "@/components/leads/LeadSpamFlag";

afterEach(cleanup);

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const ADMIN = "src/pages/admin/LeadsPage.tsx";

describe("the badge", () => {
  it("is absent on an ordinary enquiry", () => {
    render(<LeadSpamBadge suspected={false} reasons={[]} />);
    expect(screen.queryByTestId("lead-spam-badge")).toBeNull();
    cleanup();
    // NULL is the state of every row written before the column existed. It is not "spam".
    render(<LeadSpamBadge suspected={null} />);
    expect(screen.queryByTestId("lead-spam-badge")).toBeNull();
  });

  it("says 'possible', not 'spam'", () => {
    // The wording is the honesty: a badge reading "Spam" is a verdict, and this is a guess.
    render(<LeadSpamBadge suspected reasons={["vendor_pitch"]} />);
    expect(screen.getByTestId("lead-spam-badge")).toHaveTextContent(/possible/i);
  });

  it("is muted, never red", () => {
    /*
      MEMBER_UX_RULES R1: red is for an alarm. A suspected marketing email is not one, and a
      screen that spends red on it has none left for the thing that matters.
    */
    const el = render(<LeadSpamBadge suspected reasons={[]} />).getByTestId("lead-spam-badge");
    expect(el.className).toMatch(/text-muted-foreground/);
    expect(el.className).not.toMatch(/destructive|text-red|bg-red/);
  });
});

describe("the reasons", () => {
  it("are turned into sentences a person can judge", () => {
    const src = read("src/components/leads/LeadSpamFlag.tsx");
    // A flag whose reason is not visible is one nobody can judge, so it gets believed — which
    // is exactly how a real enquiry stays flagged.
    for (const reason of ["link_in_message", "vendor_pitch", "language_mismatch"]) {
      expect(src, `${reason} needs a sentence`).toContain(reason);
    }
  });

  it("an unrecognised reason is shown verbatim, never invented", () => {
    const src = read("src/components/leads/LeadSpamFlag.tsx");
    expect(src).toMatch(/default:\s*\n\s*\/\//);
    expect(src).toMatch(/return reason;/);
  });

  it("every reason the server can write has a sentence here", () => {
    /*
      READ OFF THE SERVER, not restated. `spamReasonsFor` is where the list actually lives; a
      fourth heuristic added there without a sentence here would render its raw snake_case
      identifier in a tooltip, which is the kind of thing that ships.
    */
    const server = read("supabase/functions/_shared/public-submit.ts");
    const emitted = [...server.matchAll(/reasons\.push\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(emitted.length, "the sweep found no reasons — it is not reading the right file")
      .toBeGreaterThan(0);
    const ui = read("src/components/leads/LeadSpamFlag.tsx");
    const missing = emitted.filter((r) => !ui.includes(`case "${r}"`));
    expect(missing, `no sentence for: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("'Not spam' is one press", () => {
  it("appears only on a flagged lead, and calls back", () => {
    let cleared = 0;
    render(<LeadNotSpamButton suspected onClear={() => { cleared += 1; }} />);
    fireEvent.click(screen.getByTestId("lead-not-spam"));
    expect(cleared).toBe(1);
  });

  it("is absent on an ordinary one", () => {
    render(<LeadNotSpamButton suspected={false} onClear={() => {}} />);
    expect(screen.queryByTestId("lead-not-spam")).toBeNull();
  });

  it("clears the reasons with the flag", () => {
    // Otherwise the tooltip on a lead somebody has judged real goes on explaining why we think
    // it is spam.
    expect(read(ADMIN)).toMatch(/suspected_spam: false, spam_reasons: null/);
  });

  it("changes nothing else — not the status, not the bell", () => {
    const src = read(ADMIN);
    const fn = src.slice(src.indexOf("const clearSpamFlag"), src.indexOf("const updateLeadStatus"));
    expect(fn).not.toMatch(/status:/);
    expect(fn).not.toMatch(/notification/i);
  });
});

describe("the list does not hide what it guessed", () => {
  const src = read(ADMIN);

  it("defaults to showing every enquiry", () => {
    // A list that hides what it guessed is a list nobody can check — and the flag is a guess.
    expect(src).toMatch(/useState\("all"\);\s*\n(?:.*\n)*?\s*const \[filterSpam/);
    expect(src).toMatch(/const \[filterSpam, setFilterSpam\] = useState\("all"\)/);
  });

  it("offers both directions: work through them, or set them aside", () => {
    expect(src).toContain('<SelectItem value="spam">');
    expect(src).toContain('<SelectItem value="clean">');
  });

  it("'hide possible spam' does not also hide every row older than the column", () => {
    /*
      `eq('suspected_spam', false)` looks right and drops every lead written before the column
      existed, because those hold NULL — which is every enquiry the business has ever had.
    */
    expect(src).toMatch(/\.not\('suspected_spam', 'is', true\)/);
    expect(src).not.toMatch(/\.eq\('suspected_spam', false\)/);
  });

  it("re-queries when the filter changes", () => {
    /*
      A filter that does not refetch is a filter that silently does nothing.

      The list has since gained source, assignee and follow-up filters, so this asserts that
      `filterSpam` is IN the dependency array rather than that the array is exactly three long —
      which would have to be edited every time a filter is added, and an assertion edited that
      often stops being read.
    */
    const deps = src.slice(src.indexOf("}, [filterStatus"), src.indexOf("]);", src.indexOf("}, [filterStatus")));
    expect(deps).toContain("filterSpam");
  });
});
