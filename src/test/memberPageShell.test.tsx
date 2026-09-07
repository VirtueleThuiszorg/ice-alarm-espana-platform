// The one page shell — MEMBER_UX_RULES R5, R10.
//
// R5: *"28px Archivo 700 title + 16px Slate subtitle. Every page is composed from PageHeader,
// Card, EmptyState — DELETE EVERY HAND-ROLLED HEADER."*
//
// WHY THIS IS WORTH A TEST RATHER THAN A CONVENTION. All eight member pages carried the same
// header block, and eight copies of a header is eight places a type-size decision has to be
// repeated — R10's 16px floor being exactly the kind of decision that gets applied to six of
// them. `SubscriptionPage` proved it: two different headers in one file, and the one for the
// empty state had no subtitle at all.
//
// So the assertion that matters is the ABSENCE: no member page may grow a hand-rolled header
// again, and the next page added has to use the shell or fail here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CLIENT_PAGES = join(process.cwd(), "src/pages/client");
const pages = readdirSync(CLIENT_PAGES).filter((f) => f.endsWith(".tsx"));
const read = (f: string) => readFileSync(join(CLIENT_PAGES, f), "utf8");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
    i18n: { language: "en" },
  }),
}));

beforeEach(() => {});
afterEach(() => cleanup());

describe("R5 — every member page uses the shell", () => {
  it("finds the pages at all", () => {
    // Guards against the readdir silently returning nothing and every assertion below passing
    // vacuously.
    expect(pages.length).toBeGreaterThanOrEqual(9);
    expect(pages).toContain("SubscriptionPage.tsx");
  });

  it("no page hand-rolls the old header block", () => {
    const offenders = pages.filter((f) =>
      /text-2xl md:text-3xl font-bold tracking-tight/.test(read(f)),
    );
    expect(offenders, "these still hand-roll a page header — use PageHeader").toEqual([]);
  });

  it("no page renders its own <h1>", () => {
    // One h1 per page, and it belongs to the shell. Two h1s is a heading order a screen reader
    // announces wrongly, and it is how a page ends up with a title that is not the page's.
    const offenders = pages.filter((f) => /<h1[\s>]/.test(read(f)));
    expect(offenders, "these render an <h1> directly — pass it to PageHeader").toEqual([]);
  });

  it("EVERY page uses the shell — there is no exception", () => {
    /*
      Including the dashboard. R3 keeps its greeting in page CONTENT rather than the app header
      (that is where the readiness notice goes), but the greeting is still that page's title, so
      it goes through the same shell. The one hand-rolled header left behind is the one that
      drifts.
    */
    const withoutShell = pages.filter((f) => !read(f).includes("PageHeader"));
    expect(withoutShell).toEqual([]);
  });

  it("the dashboard's title skeleton is the TITLE, so the page does not reflow", () => {
    // A heading that appears late pushes everything below it down, and on this page that is
    // the protection checklist a member is in the middle of reading.
    const src = read("ClientDashboard.tsx");
    const header = src.slice(src.indexOf("<PageHeader"), src.indexOf("subtitle={currentDate}"));
    expect(header).toContain("Skeleton");
  });
});

describe("PageHeader itself", () => {
  async function renderHeader(props: Record<string, unknown> = {}) {
    const { PageHeader } = await import("@/components/client/PageHeader");
    return render(<PageHeader title="My pendant" {...props} />);
  }

  it("renders the title as the page's h1", async () => {
    await renderHeader();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("My pendant");
  });

  it("uses 28px, not a responsive step-down to 24px — and in rem, so R10's A/A moves it", async () => {
    /*
      R5 says 28px. Tailwind's text-3xl is 30px and text-2xl is 24px, and the pages used
      `text-2xl md:text-3xl` — so on a PHONE, where most of these members read, the title was
      24px. The step-down is deliberately absent: the rule does not have one, and a smaller
      title on a small screen is the wrong way round for this reader.

      `1.75rem` and not `28px`: the same size at the default root, but an arbitrary px value
      ignores the root font size, so the A/A control would have enlarged every other word on the
      page and left the titles alone. R5 and R10 only agree in rem.
    */
    await renderHeader();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toContain("text-[1.75rem]");
    expect(h1.className).not.toMatch(/text-2xl|md:text-3xl|text-\[\d+px\]/);
  });

  it("renders the subtitle at 16px — R10's floor", async () => {
    await renderHeader({ subtitle: "Your alarm and its status" });
    const p = screen.getByText("Your alarm and its status");
    expect(p.className).toContain("text-base");
    // 14px is the operator density (R11). A member page must not use it.
    expect(p.className).not.toContain("text-sm");
  });

  it("omits the subtitle rather than rendering an empty line", async () => {
    // SubscriptionPage's empty state had no subtitle. A `<p>` with nothing in it is a gap in
    // the layout that looks like a missing string.
    const { container } = await renderHeader();
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("takes the page's single action, and renders nothing when there is none", async () => {
    // R1: one red button per page, MAXIMUM. The slot is singular for that reason.
    const { container } = await renderHeader();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    cleanup();
    await renderHeader({ action: <button type="button">Add</button> });
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("can render as h2 for a section header, so a page cannot grow a second h1", async () => {
    await renderHeader({ as: "h2" });
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  });
});
