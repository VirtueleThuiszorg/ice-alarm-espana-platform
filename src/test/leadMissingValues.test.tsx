/**
 * A LEAD WITH NOTHING IN IT MUST NOT LOOK LIKE A LEAD YOU CAN RING.
 *
 * The enquiry that started this arrived with no name, no email and no phone. The staff list
 * rendered it as an envelope icon followed by nothing, a telephone icon followed by nothing, a
 * blank where the name goes, and — beside all that — a Call button and an email button identical
 * to the ones on a real enquiry. Both did nothing when pressed: `tel:` and `mailto:` with an
 * empty address are a no-op in every browser.
 *
 * On a call-centre screen that is worse than it sounds. An operator working a queue scans rows
 * rather than reading them, and an icon means "there is a way to reach this person" from three
 * feet away. The second time a button does nothing they stop trusting the screen.
 *
 * `public-submit` now refuses an incomplete contact enquiry, so no NEW row can look like this.
 * These rules are for the rows already in the table, for the sources that legitimately hold less
 * (a `product_interest` lead is an email by design), and for the next import.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  LeadContactButton,
  LeadContactValue,
  LeadName,
} from "@/components/leads/LeadContact";
import { EMPTY_VALUE, hasValue, leadMailHref, leadTelHref, orEmpty } from "@/lib/leadDisplay";

afterEach(cleanup);

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("the rules themselves", () => {
  it("whitespace is not a value", () => {
    // The row that started this had `first_name = ''`. A `.trim()` short of this and every
    // assertion below passes while the screen still shows a gap.
    expect(hasValue("   ")).toBe(false);
    expect(hasValue("")).toBe(false);
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue(" Ana ")).toBe(true);
  });

  it("orEmpty never returns an empty string, which renders as a gap", () => {
    expect(orEmpty(" ")).toBe(EMPTY_VALUE);
    expect(orEmpty(null)).toBe(EMPTY_VALUE);
    expect(orEmpty(" ana@example.com ")).toBe("ana@example.com");
  });

  it("no href at all for a value we do not hold", () => {
    // `tel:` and `mailto:` with nothing after them are valid URLs that do nothing, which is
    // precisely the failure: the browser accepts the press and nothing happens.
    expect(leadTelHref("")).toBeNull();
    expect(leadTelHref("   ")).toBeNull();
    expect(leadMailHref(null)).toBeNull();
    expect(leadTelHref("600 111 222")).toBe("tel:600111222");
    expect(leadMailHref(" ana@example.com ")).toBe("mailto:ana@example.com");
  });
});

describe("the name", () => {
  it("shows the name when there is one", () => {
    render(<LeadName lead={{ first_name: "María", last_name: "Ruiz" }} />);
    expect(screen.getByText("María Ruiz")).toBeInTheDocument();
    expect(screen.queryByTestId("lead-name-missing")).toBeNull();
  });

  it("shows a surname-less lead under the name it does have", () => {
    render(<LeadName lead={{ first_name: "María", last_name: "" }} />);
    expect(screen.getByText("María")).toBeInTheDocument();
  });

  it("says the name was not given, in muted italic so it cannot be read as a name", () => {
    render(<LeadName lead={{ first_name: "  ", last_name: null }} />);
    const el = screen.getByTestId("lead-name-missing");
    expect(el).toHaveTextContent("Name not given");
    // Without this a list of blank leads reads as several people called "Name not given".
    expect(el.className).toMatch(/text-muted-foreground/);
    expect(el.className).toMatch(/italic/);
  });
});

describe("a contact detail", () => {
  it("is a link when we hold the value", () => {
    render(<LeadContactValue kind="email" value="ana@example.com" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "mailto:ana@example.com");
  });

  it("is NOT a link when we do not — an em dash, and the icon says nothing on its own", () => {
    render(<LeadContactValue kind="phone" value="" />);
    expect(screen.queryByRole("link")).toBeNull();
    const el = screen.getByTestId("lead-phone-missing");
    expect(el).toHaveTextContent(EMPTY_VALUE);
    // A screen reader gets the words; the eye gets the dash and the muted colour.
    expect(el).toHaveTextContent("No phone number");
    expect(el.className).toMatch(/text-muted-foreground/);
  });
});

describe("the Call and email buttons", () => {
  it("are live when there is something to call or write to", () => {
    render(<LeadContactButton kind="phone" value="600111222" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "tel:600111222");
  });

  it("are DISABLED WITH A REASON when there is not, rather than hidden", () => {
    /*
      Hidden would make two rows differ by a missing button and leave the operator to work out
      which. The reason travels in the accessible name as well as the tooltip, because a tooltip
      only exists while a pointer is over it.
    */
    render(<LeadContactButton kind="email" value={null} />);
    const button = screen.getByTestId("lead-email-button-disabled");
    expect(button).toBeDisabled();
    expect(button.getAttribute("aria-label")).toMatch(/No email address on this enquiry/);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("the labelled Call Now button carries its label either way", () => {
    // The detail dialog's full-width button. A disabled button with no text would be a grey
    // square, which says even less than the icon-only one it replaced.
    render(<LeadContactButton kind="phone" value=" " label="Call Now" />);
    expect(screen.getByTestId("lead-phone-button-disabled")).toHaveTextContent("Call Now");
  });
});

describe("every staff surface that shows a lead uses these, not its own copy", () => {
  /*
    THE POINT OF THE SHARED COMPONENT. The same bug was in four places because each screen had
    its own `<Mail /> {lead.email}`. A fix applied to three of them is a fix that comes back.
  */
  const SURFACES = [
    "src/pages/admin/LeadsPage.tsx",
    "src/pages/call-centre/LeadsPage.tsx",
    "src/components/call-centre/NewEnquiriesCard.tsx",
    // Found by the sweep below, not by remembering it — which is the whole argument for
    // guarding the shape rather than the four files somebody thought of.
    "src/components/dashboard/LeadsWidget.tsx",
  ];

  it.each(SURFACES)("%s renders the lead's name through LeadName", (file) => {
    expect(read(file)).toMatch(/<LeadName\s/);
    // `{lead.first_name} {lead.last_name}` renders " " for the row that started this.
    expect(read(file)).not.toMatch(/\{(?:selected)?[Ll]ead\.first_name\}\s*\{/);
  });

  it("no staff surface builds a tel: or mailto: for a lead by hand any more", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "test") continue;
          walk(p);
          continue;
        }
        if (!/\.tsx?$/.test(name)) continue;
        const src = readFileSync(p, "utf8");
        // Only leads: the member record and the partner pages hold their own rules, and a
        // member always has a phone number because the product cannot work without one.
        if (/(?:mailto|tel):\$\{(?:selected)?[Ll]ead[s]?\./.test(src)) {
          offenders.push(path.relative(process.cwd(), p).replace(/\\/g, "/"));
        }
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(
      offenders,
      `these build a link over a value that may be empty: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("a value inside a clickable row is not itself a link", () => {
    /*
      Both dashboard rows and the call-centre list rows are clickable as a whole. An anchor
      inside a <Link> is invalid markup browsers resolve by guessing, and a mail link inside a
      clickable card fires both actions on one press — the mail client opens AND the enquiry
      does. The buttons beside the row are what act there.
    */
    for (const file of [
      "src/components/dashboard/LeadsWidget.tsx",
      "src/pages/call-centre/LeadsPage.tsx",
    ]) {
      expect(read(file), file).toMatch(/linkify=\{false\}/);
    }
  });

  it("the sweep above is looking at files at all", () => {
    // It found four offenders before this change; an empty sweep would pass it for ever.
    expect(read("src/pages/admin/LeadsPage.tsx")).toContain("LeadContactValue");
  });
});
