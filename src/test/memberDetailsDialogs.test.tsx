/**
 * "COMPLETE MY DETAILS" AND "REVIEW MY DETAILS" — the two questions no page owned.
 *
 * A member's record is spread over Profile, Medical and Contacts, and neither *"what do you
 * still need from me?"* nor *"what do you actually hold about me?"* belonged to any of them.
 * That is why a member could not find either answer: it was not that the pages were bad, it was
 * that the question was about the record as a whole and nothing looked at the whole.
 *
 * ONE DEFINITION, WHICH IS THE POINT. The fields come from `memberRequiredFields.ts` via
 * `useMemberMissingInfo` — the same read the staff record and the staff queue use — and the
 * controls from `memberUpdateForm.ts`, the module the emailed update LINK already uses. A member
 * answering from their dashboard gets the same list, the same grouping and the same controls as
 * one answering from an email, because there is one list. A hand-written form here would be the
 * fifth opinion `memberRequiredFields` was written to end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";

import { MEMBER_REQUIRED_FIELDS, type RequiredField } from "@/lib/memberRequiredFields";
import { updateFormFields } from "@/lib/memberUpdateForm";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── doubles ─────────────────────────────────────────────────────────────────
let memberUpdates: Record<string, unknown>[] = [];
let invoked: { action: string; body: Record<string, unknown> }[] = [];
let invokeError: Error | null = null;
let memberRow: Record<string, unknown> | null = null;
let medicalRow: Record<string, unknown> | null = null;
let contactRows: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => Promise.resolve({ data: contactRows, error: null });
      chain.maybeSingle = () =>
        Promise.resolve({
          data: table === "members" ? memberRow : table === "medical_information" ? medicalRow : null,
          error: null,
        });
      chain.update = (payload: Record<string, unknown>) => {
        if (table === "members") memberUpdates.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      };
      return chain;
    },
    functions: {
      invoke: (_name: string, opts: { body: Record<string, unknown> }) => {
        invoked.push({ action: String(opts.body.action), body: opts.body });
        return invokeError
          ? Promise.resolve({ data: null, error: invokeError })
          : Promise.resolve({ data: { success: true }, error: null });
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/functionError", () => ({ functionError: async (e: unknown) => e }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : key;
      const vars = (typeof fallback === "string" ? opts : fallback) ?? {};
      return String(text).replace(/\{\{(\w+)\}\}/g, (m, n) => (n in vars ? String(vars[n as string]) : m));
    },
    i18n: { language: "en" },
  }),
}));

beforeEach(() => {
  memberUpdates = [];
  invoked = [];
  invokeError = null;
  memberRow = null;
  medicalRow = null;
  contactRows = [];
});
afterEach(cleanup);

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

const field = (key: string): RequiredField => {
  const f = MEMBER_REQUIRED_FIELDS.find((x) => x.key === key);
  if (!f) throw new Error(`no required field ${key}`);
  return f;
};

async function renderComplete(missing: RequiredField[]) {
  const { CompleteMyDetailsDialog } = await import(
    "@/components/client/CompleteMyDetailsDialog"
  );
  wrap(
    <CompleteMyDetailsDialog
      open
      onOpenChange={() => undefined}
      memberId="m1"
      missing={missing}
    />,
  );
}

// ── 1. the list is the shared list ──────────────────────────────────────────
describe("what the dialog asks for", () => {
  it("asks only for the missing items, grouped as everything else groups them", async () => {
    await renderComplete([field("first_name"), field("blood_type"), field("postal_code")]);

    expect(await screen.findByTestId("complete-field-first_name")).toBeVisible();
    expect(screen.getByTestId("complete-field-blood_type")).toBeVisible();
    expect(screen.getByTestId("complete-field-postal_code")).toBeVisible();
    // Grouped, in `REQUIRED_GROUPS` order — the same grouping the staff sheet uses.
    expect(screen.getByTestId("complete-group-identity")).toBeVisible();
    expect(screen.getByTestId("complete-group-address")).toBeVisible();
    expect(screen.getByTestId("complete-group-medical")).toBeVisible();
    // And nothing it was not asked for.
    expect(screen.queryByTestId("complete-field-city")).toBeNull();
  });

  it("NEVER asks for something only we can supply", async () => {
    /*
      `device_imei`, `device_tested` and `active_subscription` are `memberCanSupply: false`.
      Asking a member to type the IMEI of a device we have not sent yet is asking for something
      they cannot give, on a form whose whole promise is "fill this in and you are done" —
      and an active subscription is activated by the payment webhook alone (golden rule 4).

      `updateFormFields` filters them by construction; this asserts the filter, and asserts it
      over the real definition rather than a fixture, so a new `memberCanSupply: false` field is
      covered without anybody remembering.
    */
    const ourJob = MEMBER_REQUIRED_FIELDS.filter((f) => !f.memberCanSupply);
    expect(ourJob.length, "the premise").toBeGreaterThan(0);
    expect(updateFormFields(ourJob.map((f) => f.key))).toEqual([]);

    await renderComplete([...ourJob]);
    for (const f of ourJob) {
      expect(screen.queryByTestId(`complete-field-${f.key}`), f.key).toBeNull();
    }
  });

  it("offers no Save when there is nothing on the form to save", async () => {
    // A Save on a dialog of links is a button that saves nothing.
    await renderComplete([field("device_imei")]);
    expect(screen.queryByTestId("complete-details-save")).toBeNull();
  });

  it("says WHY each field is needed, not just what it is", async () => {
    /*
      `memberRequiredFields` carries a `because` sentence per field for exactly this reason:
      "we need your blood group" reads as bureaucracy, "read out to the ambulance crew on
      arrival" is a reason somebody acts on.
    */
    await renderComplete([field("blood_type")]);
    expect(
      await screen.findByText(field("blood_type").because.fallback),
    ).toBeVisible();
  });

  it("sends a member to the CONTACTS PAGE rather than cramming the editor in", async () => {
    /*
      A contact is a name, a relationship, a phone and a priority — a repeated block, not a
      line. Squeezing that editor into a dialog beside eight single-line inputs would produce a
      worse one than the page that already exists.
    */
    await renderComplete([field("emergency_contact")]);
    const link = await screen.findByTestId("complete-contacts-link");
    expect(link).toHaveAttribute("href", "/dashboard/contacts");
  });
});

// ── 2. what it writes, and where ────────────────────────────────────────────
describe("what Save actually does", () => {
  it("writes member columns direct and medical through member-self-service", async () => {
    /*
      TWO TARGETS, TWO EXISTING ROUTES, NEITHER NEW. `members` has a member self-UPDATE policy —
      the route `clientWriteSweep.test.ts` pins as allowed. `medical_information` has a member
      UPDATE policy and NO member INSERT, so a member's FIRST medical save is RLS-denied without
      the function.
    */
    await renderComplete([field("first_name"), field("blood_type")]);
    fireEvent.change(screen.getByTestId("complete-field-first_name"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByTestId("complete-details-save"));

    await waitFor(() => expect(memberUpdates.length).toBe(1));
    expect(memberUpdates[0]).toEqual({ first_name: "Ana" });
    // Nothing typed into the medical field, so no medical write at all.
    expect(invoked.filter((i) => i.action === "save_medical_info")).toHaveLength(0);
  });

  it("writes ONLY what was typed — a blank field is not a cleared column", async () => {
    /*
      THE OPPOSITE RULE TO THE MEDICAL PAGE, on purpose. There, every field is sent and an empty
      one is sent as NULL, because a member deleting a medication needs it gone. Here the form
      only ever holds fields that are ALREADY empty, so sending a blank would write NULL over
      nothing — and, worse, a partially-filled dialog would clear the fields the member skipped
      if `buildUpdateSubmission` did not drop them.
    */
    await renderComplete([field("first_name"), field("last_name"), field("postal_code")]);
    fireEvent.change(screen.getByTestId("complete-field-postal_code"), {
      target: { value: "04800" },
    });
    fireEvent.click(screen.getByTestId("complete-details-save"));

    await waitFor(() => expect(memberUpdates.length).toBe(1));
    expect(Object.keys(memberUpdates[0])).toEqual(["postal_code"]);
  });

  it("splits a list field on commas", async () => {
    await renderComplete([field("allergies")]);
    fireEvent.change(screen.getByTestId("complete-field-allergies"), {
      target: { value: "Penicillin, Shellfish" },
    });
    fireEvent.click(screen.getByTestId("complete-details-save"));

    await waitFor(() =>
      expect(invoked.some((i) => i.action === "save_medical_info")).toBe(true),
    );
    const save = invoked.find((i) => i.action === "save_medical_info")!;
    expect(save.body.allergies).toEqual(["Penicillin", "Shellfish"]);
  });

  it("refuses to 'save' nothing", async () => {
    // Closing silently on an untouched form would look like a save.
    await renderComplete([field("first_name")]);
    expect(screen.getByTestId("complete-details-save")).toBeDisabled();
  });

  it("EMITS member.details_completed so staff know to stop chasing", async () => {
    /*
      The moment a record becomes usable in an emergency is the moment a readiness queue entry
      can be cleared and a courtesy call stopped. Without the event the writes land silently and
      somebody rings a member who has already answered.
    */
    await renderComplete([field("first_name"), field("blood_type")]);
    fireEvent.change(screen.getByTestId("complete-field-first_name"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByTestId("complete-details-save"));

    await waitFor(() =>
      expect(invoked.some((i) => i.action === "details_completed")).toBe(true),
    );
    const event = invoked.find((i) => i.action === "details_completed")!;
    // The counts are a hint for the message text; the member identity is resolved server-side
    // from the caller's own `user_id` and is deliberately NOT sent.
    expect(event.body.filled).toBe(1);
    expect(event.body.remaining).toBe(1);
    expect(event.body).not.toHaveProperty("member_id");
  });

  it("the event is server-scoped to the caller's OWN member row", () => {
    /*
      Read from the function, because this is the assertion that matters and no client test can
      make it: a client-supplied member id would let anybody emit an event about anybody.
    */
    const fn = read("supabase/functions/member-self-service/index.ts");
    const action = fn.slice(fn.indexOf('case "details_completed"'), fn.indexOf('case "notify_staff"'));
    expect(action).toContain("entity_id: member.id");
    expect(action, "no client-supplied identity").not.toMatch(/body\.member_id|body\.entity_id/);
    // A broadcast, like `notify_staff` — not aimed at one admin.
    expect(action).toMatch(/admin_user_id: null/);
  });

  it("a failed NOTIFICATION does not report a failed SAVE", async () => {
    /*
      The details are saved by the time the event fires. Telling a member their details did not
      save, when they visibly did, sends them round again — so the notify failure is logged and
      swallowed. The member write is what the toast reflects.
    */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { toast } = await import("sonner");
    try {
      await renderComplete([field("first_name")]);
      fireEvent.change(screen.getByTestId("complete-field-first_name"), {
        target: { value: "Ana" },
      });
      // Only the notification path is broken: the member column write does not go through
      // `functions.invoke` at all.
      invokeError = new Error("notify down");
      fireEvent.click(screen.getByTestId("complete-details-save"));

      await waitFor(() => expect(memberUpdates.length).toBe(1));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

// ── 3. the review sheet ─────────────────────────────────────────────────────
describe("Review my details", () => {
  const renderReview = async () => {
    const { ReviewMyDetailsDialog } = await import(
      "@/components/client/ReviewMyDetailsDialog"
    );
    wrap(<ReviewMyDetailsDialog open onOpenChange={() => undefined} memberId="m1" />);
  };

  it("lists only the fields we ACTUALLY HOLD", async () => {
    /*
      The opposite rule to the editing pages, on purpose. There an absent value matters (R6:
      "Not added" + inline Add, so a member can see what to fill in). On a sheet whose job is to
      answer "what do you hold about me", a list of things we do NOT hold is the wrong answer
      and buries the real content.
    */
    memberRow = {
      first_name: "Ana",
      last_name: "Ruiz",
      city: "Albox",
      // Everything else absent, blank or null — none of it should appear.
      nie_dni: null,
      province: "   ",
      postal_code: "",
    };
    await renderReview();

    expect(await screen.findByText("Ana")).toBeVisible();
    expect(screen.getByText("Albox")).toBeVisible();
    expect(screen.getByTestId("review-group-identity")).toBeVisible();
    // A blank string is as absent as a null: an imported row can carry "" in a NOT NULL column.
    expect(screen.queryByText(/Province/i)).toBeNull();
    expect(screen.queryByText(/Postal code/i)).toBeNull();
    // And a group with nothing in it is omitted whole.
    expect(screen.queryByTestId("review-group-medical")).toBeNull();
  });

  it("says so plainly when we hold nothing at all", async () => {
    memberRow = {};
    await renderReview();
    expect(await screen.findByTestId("review-empty")).toBeVisible();
    // …and offers no print button, because there is nothing to print.
    expect(screen.queryByTestId("review-details-print")).toBeNull();
  });

  it("lists emergency contacts as a name and a number", async () => {
    memberRow = { first_name: "Ana" };
    contactRows = [
      { contact_name: "María", relationship: "Daughter", phone: "+34600111222" },
      // A row with neither a name nor a number is not a contact.
      { contact_name: null, relationship: null, phone: null },
    ];
    await renderReview();
    expect(await screen.findByText(/María — Daughter/)).toBeVisible();
    expect(screen.getByText("+34600111222")).toBeVisible();
  });

  it("prints through the browser rather than bundling a PDF library", () => {
    /*
      Every browser's print dialog offers "Save as PDF" on every platform these members use,
      with no dependency and nothing to keep up to date. A bundled generator would add a couple
      of hundred kilobytes to the MEMBER bundle to produce a worse document than the OS makes.
    */
    const src = read("src/components/client/ReviewMyDetailsDialog.tsx");
    expect(src).toContain("window.print()");
    for (const lib of ["jspdf", "pdfmake", "html2pdf", "react-pdf"]) {
      expect(src, `${lib} is not worth its weight here`).not.toContain(lib);
    }
    // `@media print` is what makes the printed page a document rather than a screenshot of a
    // modal: the footer goes, and the sheet says whose it is and when.
    expect(src).toContain("print:hidden");
    expect(src).toContain("print:block");
  });

  it("reads nothing until it is opened", async () => {
    /*
      This is the widest read in the member portal — the whole member row, the whole medical row
      and every contact. Fetching it on every dashboard render would put three queries on the
      page a member opens most, to answer a question they have not asked.
    */
    const { ReviewMyDetailsDialog } = await import(
      "@/components/client/ReviewMyDetailsDialog"
    );
    memberRow = { first_name: "Ana" };
    wrap(<ReviewMyDetailsDialog open={false} onOpenChange={() => undefined} memberId="m1" />);
    // Nothing rendered and nothing fetched: `enabled: open && !!memberId`.
    expect(screen.queryByTestId("review-details-body")).toBeNull();
    expect(read("src/components/client/ReviewMyDetailsDialog.tsx")).toContain(
      "enabled: open && !!memberId",
    );
  });

  it("takes its medical rows from medicalFields.ts, not a hand-written list", () => {
    /*
      That module is checked against the generated Row type at COMPILE time, so a column added
      by a future migration appears on this sheet without anybody remembering. A hand-written
      list is how the Medical PAGE sat at eight-of-sixteen for months.
    */
    const src = read("src/components/client/ReviewMyDetailsDialog.tsx");
    expect(src).toContain("MEDICAL_FIELDS.flatMap");
  });
});

// ── 4. the header ───────────────────────────────────────────────────────────
describe("the dashboard header", () => {
  const dash = () => read("src/pages/client/ClientDashboard.tsx");

  it("hides 'Complete my details' ENTIRELY when nothing is missing", () => {
    /*
      A "Complete my details" button on a complete record opens an empty dialog — the
      dead-control pattern this codebase keeps finding. A small tick replaces it, which answers
      the same question without offering a useless action.
    */
    expect(dash()).toMatch(/missingCount > 0 \? \(/);
    expect(dash()).toContain('data-testid="dashboard-details-complete"');
  });

  it("shows no badge while the count is still being read", () => {
    // A badge that says 6 mid-fetch is a badge members learn to ignore — the same argument
    // `memberRequiredFields` makes about a NULL source not being a gap.
    expect(dash()).toMatch(/!missingLoading && \(missingCount > 0/);
  });

  it("the badge is Ink, not red — R1 rations red to the page's one action", () => {
    expect(dash()).toMatch(/data-testid="dashboard-missing-badge"/);
    const badge = dash().slice(dash().indexOf("dashboard-missing-badge") - 200);
    expect(badge.slice(0, 260)).toContain("bg-foreground text-background");
  });

  it("both controls carry TEXT as well as an icon, and a large tap target", () => {
    /*
      The two controls beside them are icon-only because a telephone and the WhatsApp glyph are
      universally read. "Complete my details" is not a picture, and R11's reader is the same one
      who misses small buttons.
    */
    const src = dash();
    for (const id of ["dashboard-complete-details", "dashboard-review-details"]) {
      const at = src.indexOf(id);
      expect(at, id).toBeGreaterThan(-1);
      expect(src.slice(at - 300, at), `${id} needs touch-target`).toContain("touch-target");
    }
    expect(src).toContain('t("dashboard.completeMyDetails"');
    expect(src).toContain('t("dashboard.reviewMyDetails"');
  });

  it("reads the count from the SHARED definition", () => {
    // One list, so the number on the member's dashboard and the number in the staff queue
    // cannot disagree about what "missing" means.
    expect(dash()).toContain("useMemberMissingInfo");
  });
});
