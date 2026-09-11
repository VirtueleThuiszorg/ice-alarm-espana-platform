import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  installSupabaseStub,
  STUB_TOTP_FACTOR,
  SUPABASE_ORIGIN,
  type StubScenario,
} from "../helpers/supabaseStub";

/**
 * WHO IS LOOKING AT THE PAGE, and what the backend tells them.
 *
 * A performance number for `/admin/members` measured against an empty table is a
 * number about a page nobody uses. Every list here is seeded with a realistic row
 * count (see {@link LIST_SIZE}) so render cost, layout shift and the query fan-out
 * are measured on the shape of a real working day rather than on an empty state.
 *
 * The rows are deliberately PLAUSIBLE rather than exhaustive: a column a page does
 * not read costs nothing to omit, and a fixture that mirrors every migration would
 * need editing on every schema change. Where a page renders a blank because a field
 * is missing, that shows up as a smaller LCP element, never as a false pass — the
 * checks that matter here (JS bytes, query count, long tasks, CLS) do not depend on
 * the text inside a cell.
 */

/** Rows per list. A call-centre operator's screen on a normal shift, not a stress test. */
export const LIST_SIZE = 50;

export type PersonaName = "anonymous" | "member" | "staff" | "admin" | "partner";

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const PARTNER_ID = "22222222-2222-4222-8222-222222222222";
const STAFF_ID = "33333333-3333-4333-8333-333333333333";

function rows<T>(n: number, make: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

const iso = (daysAgo: number) =>
  new Date(Date.UTC(2026, 8, 11) - daysAgo * 86_400_000).toISOString();

/**
 * The seeded backend. One table map shared by every persona — RLS is what decides
 * who sees what in production, and a stub cannot model RLS, so the honest thing is
 * to hand every persona the same rows and be explicit that this harness measures
 * RENDER cost, not authorisation.
 */
export function seededTables(): Record<string, unknown[]> {
  return {
    members: rows(LIST_SIZE, (i) => ({
      id: `member-${i}`,
      first_name: `Member${i}`,
      last_name: `Apellido${i}`,
      email: `member${i}@example.com`,
      phone: `+3460000${String(i).padStart(4, "0")}`,
      city: i % 2 ? "Málaga" : "Alicante",
      province: i % 2 ? "Málaga" : "Alicante",
      status: i % 7 === 0 ? "pending" : "active",
      member_status: i % 7 === 0 ? "pending" : "active",
      created_at: iso(i),
      updated_at: iso(i),
    })),
    subscriptions: rows(LIST_SIZE, (i) => ({
      id: `sub-${i}`,
      member_id: `member-${i}`,
      status: "active",
      plan_type: i % 3 === 0 ? "premium" : "standard",
      billing_frequency: "monthly",
      current_period_end: iso(-30),
      created_at: iso(i),
    })),
    devices: rows(LIST_SIZE, (i) => ({
      id: `device-${i}`,
      member_id: `member-${i}`,
      serial_number: `SN${100000 + i}`,
      device_type: "pendant",
      status: i % 11 === 0 ? "offline" : "online",
      battery_level: 60 + (i % 40),
      last_seen_at: iso(0),
      created_at: iso(i),
    })),
    alerts: rows(LIST_SIZE, (i) => ({
      id: `alert-${i}`,
      member_id: `member-${i % LIST_SIZE}`,
      alert_type: i % 5 === 0 ? "sos" : "device_offline",
      status: i % 4 === 0 ? "active" : "resolved",
      severity: i % 5 === 0 ? "critical" : "low",
      created_at: iso(i / 24),
      resolved_at: i % 4 === 0 ? null : iso(i / 24),
    })),
    orders: rows(LIST_SIZE, (i) => ({
      id: `order-${i}`,
      member_id: `member-${i}`,
      order_number: `ORD-${1000 + i}`,
      status: "fulfilled",
      total_amount: 4900 + i,
      created_at: iso(i),
    })),
    payments: rows(LIST_SIZE, (i) => ({
      id: `payment-${i}`,
      member_id: `member-${i}`,
      amount: 2999,
      currency: "EUR",
      status: "paid",
      created_at: iso(i),
    })),
    staff_shifts: rows(20, (i) => ({
      id: `shift-${i}`,
      staff_id: STAFF_ID,
      starts_at: iso(i - 10),
      ends_at: iso(i - 10),
      shift_type: "day",
      status: "scheduled",
    })),
    notification_log: rows(LIST_SIZE, (i) => ({
      id: `notif-${i}`,
      member_id: `member-${i}`,
      channel: i % 2 ? "email" : "sms",
      status: "sent",
      created_at: iso(i / 12),
    })),
    tasks: rows(25, (i) => ({
      id: `task-${i}`,
      title: `Follow up with member ${i}`,
      status: i % 3 === 0 ? "open" : "done",
      priority: i % 4 === 0 ? "high" : "normal",
      due_date: iso(-i),
      created_at: iso(i),
    })),
    support_tickets: rows(25, (i) => ({
      id: `ticket-${i}`,
      subject: `Ticket ${i}`,
      status: i % 3 === 0 ? "open" : "closed",
      created_at: iso(i),
    })),
    leads: rows(25, (i) => ({
      id: `lead-${i}`,
      name: `Lead ${i}`,
      email: `lead${i}@example.com`,
      status: "new",
      created_at: iso(i),
    })),
    conversations: rows(20, (i) => ({
      id: `conv-${i}`,
      member_id: `member-${i}`,
      subject: `Conversation ${i}`,
      last_message_at: iso(i / 24),
      unread_count: i % 3,
    })),
    messages: rows(30, (i) => ({
      id: `msg-${i}`,
      conversation_id: `conv-${i % 20}`,
      body: `Message body ${i}`,
      sender_type: i % 2 ? "member" : "staff",
      created_at: iso(i / 48),
    })),
    emergency_contacts: rows(3, (i) => ({
      id: `contact-${i}`,
      member_id: MEMBER_ID,
      name: `Contact ${i}`,
      relationship: "family",
      phone: `+3460011${i}${i}${i}${i}`,
      priority: i + 1,
    })),
    company_settings: [
      { id: "settings-1", company_phone: "+34 900 000 000", company_email: "hola@example.com" },
    ],
    website_images: [],
    blog_posts: rows(10, (i) => ({
      id: `post-${i}`,
      slug: `post-${i}`,
      title: `Post ${i}`,
      excerpt: "Excerpt",
      published_at: iso(i),
      status: "published",
    })),
    products: rows(4, (i) => ({
      id: `product-${i}`,
      slug: `product-${i}`,
      name: `Product ${i}`,
      price_cents: 19900 + i,
      is_active: true,
    })),
  };
}

const STAFF_ROW = {
  id: STAFF_ID,
  user_id: "f330e208-3648-4c99-8e04-79876d204e50",
  first_name: "Operator",
  last_name: "Uno",
  email: "operator@example.com",
  role: "operator",
  is_active: true,
  is_on_call: true,
};

/** The stub scenario for a persona: who the role RPC says they are. */
export function scenarioFor(persona: PersonaName): StubScenario {
  const tables = seededTables();
  switch (persona) {
    case "member":
      return {
        tables,
        roleInfo: { is_staff: false, staff_role: null, is_partner: false, partner_id: null, member_id: MEMBER_ID },
      };
    case "staff":
      return {
        staff: { ...STAFF_ROW },
        tables: { ...tables, staff: [STAFF_ROW] },
        roleInfo: { is_staff: true, staff_role: "operator", is_partner: false, partner_id: null, member_id: null },
      };
    case "admin":
      return {
        staff: { ...STAFF_ROW, role: "admin" },
        tables: { ...tables, staff: [{ ...STAFF_ROW, role: "admin" }] },
        roleInfo: { is_staff: true, staff_role: "admin", is_partner: false, partner_id: null, member_id: null },
        // ProtectedRoute bounces an admin with no VERIFIED factor to the 2FA
        // enrolment page, so without this every admin measurement would be a
        // measurement of the enrolment page. The cost is that StaffLogin then
        // demands a TOTP code, which `signInAndCaptureState` answers below.
        mfaFactors: [STUB_TOTP_FACTOR],
      };
    case "partner":
      return {
        tables,
        partner: { id: PARTNER_ID, status: "active", contact_name: "Ana" },
        roleInfo: { is_staff: false, staff_role: null, is_partner: true, partner_id: PARTNER_ID, member_id: null },
      };
    case "anonymous":
    default:
      return { tables };
  }
}

/** Where each persona signs in, and with what. */
const LOGIN: Record<Exclude<PersonaName, "anonymous">, { url: string; email: string }> = {
  member: { url: "/login", email: "member@example.com" },
  staff: { url: "/staff/login", email: "operator@example.com" },
  admin: { url: "/staff/login", email: "admin@example.com" },
  partner: { url: "/partner/login", email: "partner@example.com" },
};

/**
 * A signed-in session, captured from BOTH stores.
 *
 * `context.storageState()` carries localStorage and cookies and nothing else,
 * which is not enough here: "Keep me signed in" defaults OFF for staff and admins
 * (a call-centre machine is shared, so the token lives in `sessionStorage` and
 * never reaches that disk — see `src/lib/authStorage.ts`), and the partner login
 * offers no such checkbox at all. For three of the four personas the session is
 * therefore in the one store `storageState` cannot see, and every staff, admin and
 * partner route would have been measured signed out.
 *
 * So sessionStorage is read out by hand and replayed into each measurement context
 * with an init script. The alternative — ticking the box to force the localStorage
 * branch — would have measured a configuration most of these users never have.
 */
export interface CapturedSession {
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  sessionStorage: Record<string, string>;
}

/**
 * Sign a persona in ONCE and return the resulting session, so the 36 route
 * measurements that follow each start from a cold HTTP cache but a warm session.
 * Re-running the login per route would measure the login, not the route.
 */
export async function signInAndCaptureState(
  browser: Browser,
  persona: Exclude<PersonaName, "anonymous">,
): Promise<CapturedSession> {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await installSupabaseStub(page, scenarioFor(persona));

  const { url, email } = LOGIN[persona];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"], input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill("Password123");

  // The "Keep me signed in" box is deliberately LEFT AS THE PRODUCT SETS IT — on
  // for members, off for staff and admins. Where it is off the session lands in
  // sessionStorage, which is captured below.
  await page.locator('button[type="submit"]').first().click();

  // An admin owns a verified factor (see `scenarioFor`), so StaffLogin stops here
  // and asks for six digits. The stub does not check the code — see the note on
  // the verify route — so any six digits get past a step the product really does
  // enforce, which is the honest shape for a PERFORMANCE harness: it must reach
  // the page, and it must not pretend to have proved anything about MFA.
  const totp = page.locator("#totp-code");
  if (await totp.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) {
    await totp.fill("123456");
    await page.getByRole("button", { name: /verify/i }).first().click();
  }

  // The session is persisted by supabase-js as soon as the token grant resolves,
  // into whichever store the persistence choice selected. Waiting for a URL change
  // instead would couple this to each login's redirect target, which differs per
  // persona and has changed twice.
  const hasToken = () =>
    page.evaluate(() => {
      const has = (store: Storage) =>
        Object.keys(store).some((k) => k.startsWith("sb-") && k.includes("auth-token"));
      return has(localStorage) || has(sessionStorage);
    });

  const deadline = Date.now() + 25_000;
  while (!(await hasToken())) {
    if (Date.now() > deadline) {
      // Fail with the EVIDENCE, not with a bare timeout. A login that silently
      // does not stick is the single most confusing failure in this harness: it
      // surfaces later as "every admin route renders the login page".
      const url = page.url();
      const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
      await context.close();
      throw new Error(
        `${persona} sign-in did not persist a session.\n` +
          `  landed at: ${url}\n` +
          `  page said: ${body.replace(/\n+/g, " / ")}`,
      );
    }
    await page.waitForTimeout(250);
  }

  const storageState = await context.storageState();
  const sessionStorageEntries = await page.evaluate(() =>
    Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k) ?? ""])),
  );
  await context.close();
  return { storageState, sessionStorage: sessionStorageEntries };
}

/**
 * Replay a captured sessionStorage into a fresh context, before any app code runs.
 * Paired with `storageState` on the context, this reconstitutes the whole session
 * whichever store the product chose to put it in.
 */
export function restoreSessionStorage(entries: Record<string, string>): string {
  return `
    (() => {
      const entries = ${JSON.stringify(entries)};
      try {
        for (const [key, value] of Object.entries(entries)) sessionStorage.setItem(key, value);
      } catch { /* a blocked store is a signed-out measurement, and the run says so */ }
    })();
  `;
}

export { SUPABASE_ORIGIN };
export type { Page };
