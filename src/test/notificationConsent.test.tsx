/**
 * WP3 N9 — the member's own permission to be messaged, which nothing could write.
 *
 * `20260907100200` created `member_notification_optin` and put the rule in the table's comment:
 * *"absent row means no permission"*. `notify-fulfilment` honours it — and **no screen anywhere
 * wrote to that table**, member-facing or staff. So every send was `skipped_no_optin`,
 * permanently, and would have stayed that way the day a channel was switched on. The dispatcher
 * was finished and could never fire.
 *
 * What these assertions protect, in the order it matters:
 *
 *   1. absent means NO. A default-on control would collect consent nobody gave;
 *   2. withdrawing is one press of the same control, and `opted_in_at` survives it — that
 *      timestamp is the evidence for the messages already sent;
 *   3. a channel we cannot reach them on cannot be consented to. A stored `true` with no phone
 *      number is a row that reads as permission and can never be honoured;
 *   4. the card never promises delivery. The global channel flag is Lee's and a member cannot
 *      read it, so "you will now get texts" would be false today with nothing to notice it by;
 *   5. it says the SOS path is not affected. Somebody turning everything off must not be left
 *      wondering whether they have switched off their alarm.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { stripComments } from "./helpers/stripComments";
import {
  canReachOn,
  isOptedIn,
  NOTIFICATION_CHANNELS,
  optinUpsert,
} from "@/lib/notificationChannels";

// ── doubles ─────────────────────────────────────────────────────────────────────────────────
let optinRows: Record<string, unknown>[] = [];
let upserted: Record<string, unknown>[] = [];
let upsertError: Error | null = null;
let upsertOptions: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.eq = () => Promise.resolve({ data: optinRows, error: null });
      chain.upsert = (row: Record<string, unknown>, options?: unknown) => {
        if (table === "member_notification_optin") {
          upserted.push(row);
          upsertOptions.push(options);
        }
        return Promise.resolve({ error: upsertError });
      };
      return chain;
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ memberId: "m1", user: { id: "u1" } }),
}));

let companyPhone: string | null = "+34 950 473 199";
vi.mock("@/hooks/useCompanySettings", () => ({
  useCompanySettings: () => ({ settings: { emergency_phone: companyPhone }, isLoading: false }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : _k;
      const vars = (typeof fallback === "string" ? opts : fallback) ?? {};
      return text.replace(/\{\{(\w+)\}\}/g, (m, n) => (n in vars ? String(vars[n as string]) : m));
    },
    i18n: { language: "en" },
  }),
}));

beforeEach(() => {
  optinRows = [];
  upserted = [];
  upsertError = null;
  upsertOptions = [];
  companyPhone = "+34 950 473 199";
});
afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const CONTACTABLE: { phone: string | null; email: string | null } = {
  phone: "+34600111222",
  email: "ana@example.com",
};

async function renderCard(contact: { phone: string | null; email: string | null } = CONTACTABLE) {
  const { NotificationPreferences } = await import("@/components/client/NotificationPreferences");
  render(<NotificationPreferences contact={contact} />, { wrapper });
  await screen.findByText(/Text message/i);
}

// ── 1. absent means no ──────────────────────────────────────────────────────────────────────
describe("what an absent row means", () => {
  it("is NOT permission", () => {
    expect(isOptedIn([], "sms")).toBe(false);
    expect(isOptedIn(undefined, "sms")).toBe(false);
  });

  it("and neither is a row that says false", () => {
    expect(isOptedIn([{ channel: "sms", opted_in: false }], "sms")).toBe(false);
  });

  it("permission on one channel is not permission on another", () => {
    const rows = [{ channel: "email" as const, opted_in: true }];
    expect(isOptedIn(rows, "email")).toBe(true);
    expect(isOptedIn(rows, "sms")).toBe(false);
    expect(isOptedIn(rows, "whatsapp")).toBe(false);
  });

  it("every control starts off when nothing has been recorded", async () => {
    await renderCard();
    for (const box of screen.getAllByRole("switch")) {
      expect(box).toHaveAttribute("data-state", "unchecked");
    }
  });
});

// ── 2. the row that gets written ────────────────────────────────────────────────────────────
describe("the row consent writes", () => {
  it("stamps when it was given, because the database refuses an opted-in row without it", () => {
    const row = optinUpsert({
      memberId: "m1", channel: "sms", optedIn: true, userId: "u1",
      existingOptedInAt: null, now: "2026-09-07T10:00:00Z",
    });
    expect(row).toMatchObject({
      member_id: "m1", channel: "sms", opted_in: true,
      opted_in_at: "2026-09-07T10:00:00Z", recorded_by_user_id: "u1", basis: "member_self",
    });
  });

  it("KEEPS the timestamp when consent is withdrawn — it is the evidence for what we sent", () => {
    const row = optinUpsert({
      memberId: "m1", channel: "sms", optedIn: false, userId: "u1",
      existingOptedInAt: "2026-09-01T09:00:00Z", now: "2026-09-07T10:00:00Z",
    });
    expect(row.opted_in).toBe(false);
    expect(row.opted_in_at).toBe("2026-09-01T09:00:00Z");
  });

  it("records the member as the source, never `staff_recorded`", () => {
    // Two values in the enum is not a reason for a member's screen to pick either one.
    const row = optinUpsert({
      memberId: "m1", channel: "email", optedIn: true, userId: "u1", existingOptedInAt: null,
    });
    expect(row.basis).toBe("member_self");
  });

  it("is written when the control is pressed", async () => {
    await renderCard();
    fireEvent.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(upserted).toHaveLength(1));
    expect(upserted[0]).toMatchObject({ member_id: "m1", opted_in: true, basis: "member_self" });
  });

  it("upserts on (member_id, channel), so pressing twice is one row and not two that disagree", async () => {
    // Without the conflict target the second press INSERTS, and the table then holds two rows
    // for the same channel — one saying yes and one saying no, with no rule about which wins.
    await renderCard();
    fireEvent.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(upserted).toHaveLength(1));
    expect(upsertOptions[0]).toMatchObject({ onConflict: "member_id,channel" });
  });

  it("is withdrawn by the SAME control, with no dialog and no reason asked for", async () => {
    optinRows = [{ channel: "email", opted_in: true, opted_in_at: "2026-09-01T09:00:00Z" }];
    await renderCard();
    const emailSwitch = screen.getAllByRole("switch")[0];
    expect(emailSwitch).toHaveAttribute("data-state", "checked");

    fireEvent.click(emailSwitch);
    await waitFor(() => expect(upserted).toHaveLength(1));
    expect(upserted[0]).toMatchObject({ opted_in: false, opted_in_at: "2026-09-01T09:00:00Z" });
    // No confirmation step stood between the member and withdrawing.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ── 3. a channel we cannot reach them on ────────────────────────────────────────────────────
describe("a channel with no address", () => {
  const smsSpec = NOTIFICATION_CHANNELS.find((c) => c.channel === "sms")!;
  const emailSpec = NOTIFICATION_CHANNELS.find((c) => c.channel === "email")!;

  it("is not reachable, and a string of spaces is not a phone number", () => {
    expect(canReachOn(smsSpec, { phone: "+34600111222", email: null })).toBe(true);
    expect(canReachOn(smsSpec, { phone: "   ", email: "a@b.c" })).toBe(false);
    expect(canReachOn(smsSpec, { phone: null, email: "a@b.c" })).toBe(false);
    expect(canReachOn(emailSpec, { phone: "+34600111222", email: null })).toBe(false);
  });

  it("cannot be switched on, and says which detail is missing", async () => {
    await renderCard({ phone: null, email: "ana@example.com" });
    // Both phone channels say it — SMS and WhatsApp — rather than one of them going quiet.
    expect(screen.getAllByText(/do not have a mobile number/i)).toHaveLength(2);
    expect(screen.getByLabelText(/Text message/i)).toBeDisabled();
    expect(screen.getByLabelText(/WhatsApp/i)).toBeDisabled();
  });

  it("shows as OFF even if a row somehow says otherwise", async () => {
    // A stored `true` with no number is permission that can never be honoured. The screen must
    // not present it as a working choice.
    optinRows = [{ channel: "sms", opted_in: true, opted_in_at: "2026-09-01T09:00:00Z" }];
    await renderCard({ phone: null, email: "ana@example.com" });
    expect(screen.getByLabelText(/Text message/i)).toHaveAttribute("data-state", "unchecked");
  });
});

// ── 4. WhatsApp's extra step ────────────────────────────────────────────────────────────────
describe("WhatsApp", () => {
  it("says consent is not enough, because WhatsApp will not let us open the conversation", () => {
    const spec = NOTIFICATION_CHANNELS.find((c) => c.channel === "whatsapp")!;
    expect(spec.needsHandshake).toBe(true);
    expect(spec.description.fallback).toMatch(/message us once first/i);
  });

  it("offers the wa.me link only once it is switched on", async () => {
    await renderCard();
    expect(screen.queryByText(/Send us a WhatsApp message/i)).toBeNull();

    optinRows = [{ channel: "whatsapp", opted_in: true, opted_in_at: "2026-09-01T09:00:00Z" }];
    cleanup();
    await renderCard();
    const link = await screen.findByText(/Send us a WhatsApp message/i);
    expect(link.closest("a")).toHaveAttribute("href", "https://wa.me/34950473199");
  });

  it("offers NO link when the stored number has no country code", async () => {
    // `wa.me/<digits>` reads them as a full international number, so `wa.me/950473199` is not
    // the Spanish number — it is somewhere else, or nowhere. This is the value in production
    // today (PENDING S16), and no link is the honest rendering of it.
    companyPhone = "950 473 199";
    optinRows = [{ channel: "whatsapp", opted_in: true, opted_in_at: "2026-09-01T09:00:00Z" }];
    await renderCard();
    expect(screen.queryByText(/Send us a WhatsApp message/i)).toBeNull();
  });

  it("is the only channel that needs it — the others do not invent an extra step", () => {
    const handshakes = NOTIFICATION_CHANNELS.filter((c) => c.needsHandshake).map((c) => c.channel);
    expect(handshakes).toEqual(["whatsapp"]);
  });
});

// ── 5. what the card may not say ────────────────────────────────────────────────────────────
describe("what the card says", () => {
  const src = stripComments(
    readFileSync(join(process.cwd(), "src/components/client/NotificationPreferences.tsx"), "utf8"),
  );

  it("promises permission, not delivery", () => {
    // The other gate is a global flag only Lee can set (D7) and a member cannot read. "You will
    // now receive texts" would be false today, and the only symptom would be silence.
    expect(src).not.toMatch(/you will (now )?(receive|get)/i);
    expect(src).not.toMatch(/from now on/i);
  });

  it("says the emergency path is not affected", async () => {
    await renderCard();
    expect(screen.getByText(/emergency calls reach us whatever you choose/i)).toBeInTheDocument();
  });

  it("reports a failed save instead of leaving a control looking set", async () => {
    upsertError = new Error("RLS says no");
    await renderCard();
    const { toast } = await import("sonner");
    fireEvent.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

// ── 6. the writer exists at all ─────────────────────────────────────────────────────────────
describe("the table finally has a writer", () => {
  it("and it is on the member's own page", () => {
    const profile = stripComments(
      readFileSync(join(process.cwd(), "src/pages/client/ProfilePage.tsx"), "utf8"),
    );
    expect(profile).toContain("<NotificationPreferences");
    // The saved profile, not the form draft: consent applies to the number we actually hold.
    expect(profile).toMatch(/contact=\{\{\s*phone:\s*profile\?\.phone/);
  });

  it("every channel the dispatcher can send on can be consented to", () => {
    // The type ratchet in the module enforces this at build time; this says why out loud.
    expect(NOTIFICATION_CHANNELS.map((c) => c.channel).sort()).toEqual(["email", "sms", "whatsapp"]);
  });
});
