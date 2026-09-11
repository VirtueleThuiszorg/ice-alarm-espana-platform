// @vitest-environment jsdom
//
// THE RECORD'S SURFACE — Lee, reviewing the live page: "too much white-on-white."
//
// He was describing two things at once, and they need different fixes:
//   · the PAGE. --background is 0 0% 99% and --card is 0 0% 100%. A card on the page was
//     1.05:1, so nothing on the record had an edge and it read as one undifferentiated sheet.
//   · the FIELDS. Label and value were the same size, weight and nearly the same colour, in a
//     grid with no lines in it — fifteen fields read as thirty interchangeable lines of grey.
//
// These tests hold both, and hold the one coupling the page fix introduced.

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";

import { FieldGrid, FieldRow, FieldSection, FIELD_LABEL_CLASS } from "@/components/FieldGrid";
import { contrast, tokensFor, css } from "./helpers/contrast";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Every .ts/.tsx under src, so "exactly one definition" is checked against the tree. */
function globSrc(dir = "src"): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return globSrc(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}
const tokens = tokensFor(":root");

afterEach(() => cleanup());

describe("the page ground", () => {
  it("gives a card an edge it did not have", () => {
    /*
      The numbers are the argument. Before, a card sat on --background at 1.05:1 — for practical
      purposes the same colour. The new ground is a real step, and the assertion is relative
      rather than absolute so that darkening --background later cannot silently undo it.
    */
    const before = Number(contrast(tokens["--card"], tokens["--background"]));
    const after = Number(contrast(tokens["--card"], tokens["--member-record-page"]));
    expect(before).toBeLessThan(1.1);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(1.1);
  });

  it("is a neutral, not a tint — the record is not being branded", () => {
    const saturation = Number(tokens["--member-record-page"].match(/[\d.]+\s+([\d.]+)%/)![1]);
    expect(saturation).toBeLessThanOrEqual(20);
  });

  it("keeps body text on it well clear of AA", () => {
    // "Back to Members" and the record's headings sit directly on this ground.
    expect(contrast(tokens["--foreground"], tokens["--member-record-page"]))
      .toBeGreaterThanOrEqual(4.5);
  });

  it("STILL SHOWS THE TAB STRIP, which the first ground did not", () => {
    /*
      The tabs PR chose --member-tab-strip against a WHITE page, where 220 14% 96% read as a
      light track. On this ground that same value is 1.05:1 and the strip vanishes. Ground and
      strip are one decision; this asserts they were actually re-decided together rather than
      left to collide.
    */
    expect(Number(contrast(tokens["--member-tab-strip"], tokens["--member-record-page"])))
      .toBeGreaterThan(1.1);
    // And the retune must not have cost the strip its own contrast bar.
    expect(contrast(tokens["--member-tab-fg"], tokens["--member-tab-strip"]))
      .toBeGreaterThanOrEqual(4.5);
    expect(Number(contrast(tokens["--member-tab-underline"], tokens["--member-tab-strip"])))
      .toBeGreaterThanOrEqual(3);
  });
});

describe("the bleed, and the coupling it introduced", () => {
  /*
    THE ONE THING IN THIS PR THAT CAN ROT SILENTLY.

    `.member-record-page` cancels the layout's content padding with a negative margin so the
    ground reaches the edges. That hard-codes the layouts' padding into a stylesheet. If either
    layout changes `p-4 md:p-6`, the record grows a white gutter down one side and no test
    would notice — it is a number in a CSS file agreeing with a class name in a TSX file.

    So the numbers are read out of the layouts and compared. Deriving beats pinning: this
    fails with the reason on screen rather than with "expected -1rem".
  */
  const rule = css.slice(
    css.indexOf(".member-record-page {"),
    css.indexOf(".member-record-page {") + 400,
  );

  const paddingOf = (path: string) => {
    const main = read(path).match(/<main className="([^"]+)"/);
    expect(main, `${path} has no <main className>`).toBeTruthy();
    const classes = main![1].split(/\s+/);
    const base = classes.find((c) => /^p-\d+$/.test(c));
    const md = classes.find((c) => /^md:p-\d+$/.test(c));
    expect(base, `${path} <main> has no base padding`).toBeTruthy();
    expect(md, `${path} <main> has no md padding`).toBeTruthy();
    // Tailwind's scale: p-4 = 1rem, p-6 = 1.5rem.
    return {
      base: Number(base!.slice(2)) * 0.25,
      md: Number(md!.slice(5)) * 0.25,
    };
  };

  const layouts = [
    "src/components/layout/AdminLayout.tsx",
    "src/components/layout/CallCentreLayout.tsx",
  ];

  it("both layouts that render the record agree on their padding", () => {
    // If they ever disagree, one negative margin cannot serve both and this PR's approach is
    // wrong rather than merely out of date — which is worth failing loudly for.
    const [admin, callCentre] = layouts.map(paddingOf);
    expect(admin).toEqual(callCentre);
  });

  it("the bleed cancels exactly that padding, at both breakpoints", () => {
    const { base, md } = paddingOf(layouts[0]);
    expect(rule).toContain(`margin: -${base}rem;`);
    expect(rule).toContain(`padding: ${base}rem;`);
    expect(css).toContain(`margin: -${md}rem;`);
    expect(css).toContain(`padding: ${md}rem;`);
  });

  it("is carried by the record and by nothing else", () => {
    /*
      COMMENTS STRIPPED, and on a className rather than anywhere in the file. The first version
      of this used a bare `toContain` on the source and passed with the class deleted from the
      element — because the comment two lines above it explaining the class still mentions it by
      name. A test that a file talks about a class is not a test that anything wears it.
    */
    const page = stripComments(read("src/pages/admin/MemberDetailPage.tsx"));
    expect(page).toMatch(/className="member-record-page[\s"]/);
    for (const layout of layouts) {
      expect(stripComments(read(layout)), layout).not.toContain("member-record-page");
    }
  });
});

describe("the field treatment", () => {
  it("has ONE label definition, shared with the member portal", () => {
    /*
      The staff record's FormLabels and the member portal's FieldLabel render the same string
      because they import the same constant. Two surfaces cannot drift apart on a constant they
      both import — and the alternative, two copies that look identical today, is exactly how
      the record and the portal would have stopped matching within a month.
    */
    /*
      Asserted as a COUNT over the whole tree rather than as "this file imports that constant".
      FieldLabel has since moved from FieldControl into FieldGrid (FieldRow needs it, and
      FieldGrid cannot import from FieldControl without a cycle) — an import-shaped assertion
      would have broken on the move while the invariant it was protecting was untouched. What
      actually matters is that the declarations exist once.
    */
    const declarations = globSrc().filter((f) =>
      /text-\[0\.8125rem\] font-medium uppercase tracking-wide text-muted-foreground/.test(read(f)),
    );
    expect(declarations).toEqual(["src/components/FieldGrid.tsx"]);

    for (const tab of [
      "src/components/admin/member-detail/ProfileTab.tsx",
      "src/components/admin/member-detail/MedicalTab.tsx",
    ]) {
      expect(read(tab), tab).toContain("FIELD_LABEL_CLASS");
      // No FormLabel left on the default styling — that is the one that would look wrong.
      expect(read(tab), tab).not.toMatch(/<FormLabel>/);
    }
  });

  it("is uppercase, in rem, and muted — R6's label, not a fresh choice", () => {
    expect(FIELD_LABEL_CLASS).toContain("uppercase");
    expect(FIELD_LABEL_CLASS).toContain("tracking-wide");
    expect(FIELD_LABEL_CLASS).toContain("text-muted-foreground");
    // rem so R10's A/A control moves it. A px label stays put while everything around it grows.
    expect(FIELD_LABEL_CLASS).toMatch(/text-\[[\d.]+rem\]/);
    expect(FIELD_LABEL_CLASS).not.toMatch(/text-\[\d+px\]/);
  });

  it("keeps the label readable and the value stronger than it", () => {
    // The whole point of the hierarchy: the caption is quieter, and still AA.
    expect(contrast(tokens["--muted-foreground"], tokens["--card"])).toBeGreaterThanOrEqual(4.5);
    expect(Number(contrast(tokens["--foreground"], tokens["--card"])))
      .toBeGreaterThan(Number(contrast(tokens["--muted-foreground"], tokens["--card"])));
  });

  it("renders a responsive grid that is one column on a phone", () => {
    render(
      <FieldGrid testId="g">
        <div>a</div>
        <div>b</div>
      </FieldGrid>,
    );
    const grid = screen.getByTestId("g");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-2");
    expect(grid.className.split(/\s+/)).toContain("field-grid");
    // The rows' spacing is their own padding, so the hairline sits BETWEEN them rather than
    // floating in a gap belonging to neither row.
    expect(grid.className).toContain("gap-y-0");
  });

  it("puts a hairline on every row, at any column span", () => {
    /*
      The first-row exception was tried and deleted, and this records why: on the address grid
      item 2 spans both columns, so it is on its own row and legitimately wants a line above
      it — a `:nth-child(2)` exception would have removed it. A selector cannot know which grid
      row a child landed in.
    */
    const grid = css.slice(css.indexOf(".field-grid > * {"), css.indexOf(".field-grid > * {") + 200);
    expect(grid).toContain("border-top: 1px solid hsl(var(--border));");
    expect(css).not.toContain(".field-grid > :nth-child(2)");
    expect(css).not.toContain(".field-grid > :first-child");
  });

  it("gives the value more weight than the caption, in read mode too", () => {
    // #328 strips the box off a disabled control; this is what stops the remaining text being
    // just more grey.
    const rule = css.slice(css.indexOf(".field-grid :is(input"), css.indexOf(".field-grid :is(input") + 220);
    expect(rule).toContain("font-weight: 500;");
    expect(rule).toContain("color: hsl(var(--foreground));");
  });

  it("renders a section heading that is subdued and spaced, but not a second card title", () => {
    render(<FieldSection title="Address" testId="s"><div>x</div></FieldSection>);
    const section = screen.getByTestId("s");
    const heading = screen.getByRole("heading", { name: "Address" });
    expect(heading.tagName).toBe("H4");
    // Quieter than the card title, or the card has three things competing to be its name.
    expect(heading.className).toContain("text-foreground/70");
    expect(heading.className).toContain("uppercase");
    // The gap above is the component's, not the caller's — otherwise every tab spaces it
    // differently.
    expect(section.className).toContain("pt-6");
    expect(section.className).toContain("first:pt-0");
  });
});

describe("the walk — every tab that shows facts uses the one primitive", () => {
  /*
    THE POINT OF A PRIMITIVE IS THAT THERE IS ONE. Three tabs had hand-rolled the same two
    lines — `<p className="text-sm text-muted-foreground">Label</p>` over a value — each with
    its own idea of the label's size and colour, and each rendering a BLANK LINE when the value
    was missing. That last part is the failure `NotAdded` exists for, reinvented as nothing at
    all: on the Device tab an unassigned SIM and a SIM that failed to load looked identical.
  */
  const TABS = [
    "src/components/admin/member-detail/DeviceTab.tsx",
    "src/components/admin/member-detail/CRMTab.tsx",
    "src/components/admin/member-detail/SubscriptionTab.tsx",
  ];

  it("leaves no hand-rolled label/value pair on the record", () => {
    for (const tab of TABS) {
      const src = stripComments(read(tab));
      expect(src, tab).toContain("FieldRow");
      // The shape that was there before: a muted <p> immediately followed by the value.
      expect(src, tab).not.toMatch(
        /<p className="text-sm text-muted-foreground">[^<]+<\/p>\s*<p/,
      );
    }
  });

  it("renders the empty state rather than a blank line", () => {
    render(
      <FieldGrid>
        <FieldRow label="SIM Number" testId="sim">{null}</FieldRow>
        <FieldRow label="IMEI" mono testId="imei">357812093471203</FieldRow>
      </FieldGrid>,
    );
    // Not an empty div — "Not added", the same words the member portal uses.
    expect(screen.getByTestId("sim").textContent).toContain("Not added");
    expect(screen.getByTestId("imei").textContent).toContain("357812093471203");
    expect(screen.getByTestId("imei").querySelector(".font-mono")).toBeTruthy();
  });

  it("treats a whitespace-only value as empty, and 0 as a value", () => {
    /*
      `0` is a fact — a battery reading, a row index of zero — and falsiness would swallow it.
      The same distinction FieldControl already makes, and the reason emptiness is TESTED here
      rather than inferred from truthiness.
    */
    render(
      <FieldGrid>
        <FieldRow label="a" testId="blank">{"   "}</FieldRow>
        <FieldRow label="b" testId="zero">{0}</FieldRow>
      </FieldGrid>,
    );
    expect(screen.getByTestId("blank").textContent).toContain("Not added");
    expect(screen.getByTestId("zero").textContent).not.toContain("Not added");
    expect(screen.getByTestId("zero").textContent).toContain("0");
  });

  it("lets a caller force the empty state for a value it knows is absent", () => {
    render(<FieldGrid><FieldRow label="x" empty testId="forced"><span>ignored</span></FieldRow></FieldGrid>);
    expect(screen.getByTestId("forced").textContent).toContain("Not added");
  });
});
