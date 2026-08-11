/**
 * Option C, admin half: converting a partner APPLICATION into an invited partner.
 *
 * An application (`status='pending'`, from /partner → partner-apply) has no `user_id`
 * and no credentials, so its partner can never log in — `PartnerLogin` looks up
 * `partners` by `user_id` and `get_user_role_info` requires a `user_id` match. This
 * dialog is the only route from "someone filled a form" to "someone has an account",
 * and it deliberately runs through an admin (PARTNER_JOURNEY.md §3).
 *
 * Tested by rendering and clicking, not by reading the source: what matters is the
 * payload that actually reaches `partner-admin-invite`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

// ── mocks ──────────────────────────────────────────────────────────────────

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const toastCalls: Array<Record<string, unknown>> = [];
vi.mock("@/hooks/use-toast", () => ({
  toast: (args: Record<string, unknown>) => toastCalls.push(args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  // Return the default so assertions read as the user sees it.
  useTranslation: () => ({
    t: (_key: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      if (typeof fallback !== "string") return _key;
      const vars = (opts ?? {}) as Record<string, string>;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
    },
  }),
}));

import { ConvertApplicationDialog } from "@/components/admin/ConvertApplicationDialog";

const APPLICATION = {
  id: "11111111-1111-1111-1111-111111111111",
  contact_name: "Ana García",
  email: "ana@test.invalid",
  preferred_language: "es",
  partner_type: "care",
  region: "Alicante",
  how_heard_about_us: "word_of_mouth",
  motivation: "I work with families locally.",
};

const clickSend = () => fireEvent.click(screen.getByRole("button", { name: /send invitation/i }));

describe("ConvertApplicationDialog", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    toastCalls.length = 0;
  });

  it("shows the applicant's own words, so the decision is made against the application", () => {
    render(<ConvertApplicationDialog application={APPLICATION} onOpenChange={vi.fn()} />);

    expect(screen.getByText("ana@test.invalid")).toBeInTheDocument();
    expect(screen.getByText("Alicante")).toBeInTheDocument();
    expect(screen.getByText("I work with families locally.")).toBeInTheDocument();
  });

  it("calls partner-admin-invite with the application's identity", async () => {
    render(<ConvertApplicationDialog application={APPLICATION} onOpenChange={vi.fn()} />);
    clickSend();

    await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    const [fn, options] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];

    expect(fn).toBe("partner-admin-invite");
    expect(options.body.contact_name).toBe("Ana García");
    expect(options.body.email).toBe("ana@test.invalid");
    // Seeded from the row, not defaulted — the applicant chose these.
    expect(options.body.partner_type).toBe("care");
    expect(options.body.preferred_language).toBe("es");
  });

  it("sends review_notes when the admin writes them", async () => {
    render(<ConvertApplicationDialog application={APPLICATION} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/review notes/i), {
      target: { value: "Spoke to Ana; runs two care homes." },
    });
    clickSend();

    await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    const [, options] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(options.body.review_notes).toBe("Spoke to Ana; runs two care homes.");
  });

  it("omits review_notes entirely when blank, rather than storing an empty string", async () => {
    render(<ConvertApplicationDialog application={APPLICATION} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/review notes/i), { target: { value: "   " } });
    clickSend();

    await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    const [, options] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect("review_notes" in options.body).toBe(false);
  });

  it("never writes partners from the client — the invite is the only write", async () => {
    // There is no INSERT policy on partners and status is not client-writable
    // (golden rule 3). The dialog must go through the function, full stop.
    render(<ConvertApplicationDialog application={APPLICATION} onOpenChange={vi.fn()} />);
    clickSend();

    await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    expect(read("src/components/admin/ConvertApplicationDialog.tsx")).not.toMatch(
      /\.from\(["']partners["']\)/
    );
  });

  it("closes and reports success once the invite is sent", async () => {
    const onOpenChange = vi.fn();
    render(<ConvertApplicationDialog application={APPLICATION} onOpenChange={onOpenChange} />);
    clickSend();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastCalls.some((c) => String(c.title).includes("invited partner"))).toBe(true);
  });

  // ── failure must be legible, not a generic shrug ──────────────────────────

  it("surfaces the server's refusal rather than a generic message", async () => {
    // partner-admin-invite refuses an already-active partner. That reason is the
    // whole point of showing it: the admin needs to know it was refused and why.
    invoke.mockResolvedValue({
      data: { error: "This partner already has an active account." },
      error: null,
    });

    const onOpenChange = vi.fn();
    render(<ConvertApplicationDialog application={APPLICATION} onOpenChange={onOpenChange} />);
    clickSend();

    await waitFor(() => expect(toastCalls.length).toBeGreaterThan(0));
    const failure = toastCalls.find((c) => c.variant === "destructive");
    expect(failure?.description).toBe("This partner already has an active account.");
    // And it must NOT pretend to have worked.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("does not close on failure, so the admin can retry or read the reason", async () => {
    invoke.mockResolvedValue({ data: { success: false, error: "nope" }, error: null });
    const onOpenChange = vi.fn();
    render(<ConvertApplicationDialog application={APPLICATION} onOpenChange={onOpenChange} />);
    clickSend();

    await waitFor(() => expect(toastCalls.some((c) => c.variant === "destructive")).toBe(true));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("re-seeds when a different application is opened", () => {
    const { rerender } = render(
      <ConvertApplicationDialog application={APPLICATION} onOpenChange={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText(/review notes/i), { target: { value: "notes for Ana" } });

    rerender(
      <ConvertApplicationDialog
        application={{ ...APPLICATION, id: "22222222-2222-2222-2222-222222222222", contact_name: "Bob" }}
        onOpenChange={vi.fn()}
      />
    );

    // Ana's notes must not carry over onto Bob's application.
    expect((screen.getByLabelText(/review notes/i) as HTMLTextAreaElement).value).toBe("");
  });
});

// ── the action is offered only where it can succeed ─────────────────────────

describe("the convert action in PartnersPage", () => {
  const src = () => read("src/pages/admin/PartnersPage.tsx");

  it("is gated on the application status", () => {
    // partner-admin-invite refuses `active` and `suspended`; offering the action
    // there would show a button that is guaranteed to be refused.
    expect(src()).toMatch(/partner\.status === "pending" &&/);
  });

  it("opens the shared dialog rather than a second implementation", () => {
    expect(src()).toMatch(/ConvertApplicationDialog/);
    expect(src()).toMatch(/setApplicationToConvert/);
  });

  it("passes the applicant's own type and language through", () => {
    const block = src().match(/setApplicationToConvert\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(block).toMatch(/preferred_language: partner\.preferred_language/);
    expect(block).toMatch(/partner_type: partner\.partner_type/);
  });
});

// ── copy exists in all three locales ───────────────────────────────────────

describe("convert dialog copy", () => {
  it("is translated in en/es/nl", () => {
    for (const loc of ["en", "es", "nl"]) {
      const dict = JSON.parse(read(`src/i18n/locales/${loc}.json`));
      for (const key of ["title", "description", "reviewNotes", "convert", "success", "error"]) {
        expect(dict.partnerConvert?.[key], `${loc}: partnerConvert.${key}`).toBeTruthy();
      }
    }
  });

  it("is real Spanish and Dutch, not English copied across", () => {
    const value = (loc: string) =>
      JSON.parse(read(`src/i18n/locales/${loc}.json`)).partnerConvert.convert;
    expect(value("es")).not.toBe(value("en"));
    expect(value("nl")).not.toBe(value("en"));
  });
});
