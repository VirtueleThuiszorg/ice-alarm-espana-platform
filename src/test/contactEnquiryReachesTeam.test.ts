/**
 * A MESSAGE FROM THE CONTACT PAGE MUST REACH A PERSON.
 *
 * Lee filled in the public Contact form and found nothing in Communications,
 * Messages or notifications. The row was in `leads` the whole time: the table's
 * only trigger was `update_leads_updated_at`, and the form's success screen
 * promised a reply "within 24 hours".
 *
 * Three halves of that fix are covered here — the two the browser owns, plus the
 * promise itself:
 *
 *   1. the notification, once raised, LEADS SOMEWHERE. Both surfaces that show a
 *      notification must send you to the enquiry, not to two different places;
 *   2. the success copy no longer commits to a deadline nobody agreed to;
 *   3. the enquiry has a home on a screen operators already have open.
 *
 * The notification itself is raised by a database trigger and is proven where it
 * lives, against a real PostgreSQL: `scripts/rls/wiring.sql` §2. It cannot be
 * proven here, because here the client is a mock and a mock will happily
 * "notify" nobody.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { notificationLink } from "@/lib/notificationLink";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import nl from "@/i18n/locales/nl.json";

describe("a lead notification leads to the enquiry", () => {
  it("sends staff to the leads list", () => {
    expect(notificationLink("message", { entity_type: "lead" }, true)).toBe("/call-centre/leads");
  });

  it("uses the call-centre route, not the admin one — an operator must not land on /unauthorized", () => {
    // /admin/leads is behind requireAdmin. A call_centre operator following
    // their own notification there gets bounced, which is worse than no link.
    expect(notificationLink("message", { entity_type: "lead" }, true)).not.toContain("/admin/");
  });

  it("without the entity_type it falls back to Messages — which is why the trigger sets it", () => {
    // Proves the routing is doing real work: drop `entity_type` and the same
    // notification goes somewhere unhelpful. This is what the notifications
    // page did for every lead before the two copies were merged.
    expect(notificationLink("message", {}, true)).toBe("/admin/messages");
  });

  it("never sends a MEMBER to a staff route", () => {
    // Every entity_type target is a staff route, so members are decided first.
    for (const entity of ["lead", "social_post", "video_render", "outreach_email"]) {
      const link = notificationLink("message", { entity_type: entity }, false);
      expect(link, `member routed to a staff page for entity_type=${entity}`).toMatch(/^\/dashboard/);
    }
  });

  it("ignores a metadata.link — notification_log has no such column and it was staff-authored", () => {
    // Both old copies checked `metadata.link` FIRST. `mapRow` cannot populate
    // it (there is no `link` column), so the branch was unreachable — and had
    // it ever been reachable it would have navigated to a stored string.
    expect(notificationLink("message", { link: "/admin/settings", entity_type: "lead" }, true))
      .toBe("/call-centre/leads");
  });

  it("is the ONLY implementation — two copies disagreed about the same notification", () => {
    const bell = readFileSync("src/components/notifications/NotificationBell.tsx", "utf8");
    const page = readFileSync("src/pages/admin/NotificationsPage.tsx", "utf8");
    for (const [name, src] of [["NotificationBell", bell], ["NotificationsPage", page]] as const) {
      expect(src, `${name} still defines its own link function`).not.toMatch(
        /function getNotificationLink/,
      );
      expect(src, `${name} does not use the shared one`).toMatch(/notificationLink\(/);
    }
  });
});

describe("the success message does not promise what nobody committed to", () => {
  const copies = { en, es, nl } as Record<string, { contact: { success: Record<string, string> } }>;

  it.each(["en", "es", "nl"])("%s no longer promises a fixed response time", (loc) => {
    const success = copies[loc].contact.success;
    const all = Object.values(success).join(" ").toLowerCase();
    // The old copy said "respond within 24 hours" / "responderá en 24 horas" /
    // "reageert binnen 24 uur". Nothing in the system enforced it and nobody
    // was even told the enquiry had arrived.
    expect(all, `${loc} still promises a deadline`).not.toMatch(/24\s*(hours|horas|uur|h)\b/);
    expect(all).not.toMatch(/\bwithin \d+\b|\ben \d+ horas\b|\bbinnen \d+ uur\b/);
  });

  it.each(["en", "es", "nl"])("%s still tells them what to do if it is urgent", (loc) => {
    const all = Object.values(copies[loc].contact.success).join(" ").toLowerCase();
    // Removing the promise must not remove the escape hatch: the phone is the
    // path that genuinely reaches a person immediately.
    expect(all, `${loc} lost the urgent-matters instruction`).toMatch(/call|llame|bel/);
  });

  it.each(["en", "es", "nl"])("%s does not claim the team has been notified", (loc) => {
    // The notification comes from a migration that is HELD. Until it is applied
    // to production, copy claiming "our team has been notified" would be a new
    // false promise replacing the old one.
    const all = Object.values(copies[loc].contact.success).join(" ").toLowerCase();
    expect(all).not.toMatch(/has been notified|notificado|op de hoogte gebracht/);
  });
});

describe("an unworked enquiry has a home on a screen someone has open", () => {
  const card = readFileSync("src/components/call-centre/NewEnquiriesCard.tsx", "utf8");
  const dashboard = readFileSync("src/pages/call-centre/StaffDashboard.tsx", "utf8");

  it("is mounted on the call-centre dashboard", () => {
    expect(dashboard).toMatch(/import \{ NewEnquiriesCard \}/);
    expect(dashboard).toMatch(/<NewEnquiriesCard \/>/);
  });

  it("lists only enquiries nobody has picked up", () => {
    // Both Leads screens move a lead off `new` the moment anyone touches it, so
    // this filter is the difference between a worklist and a vanity count.
    expect(card).toMatch(/\.eq\("status", "new"\)/);
  });

  it("is a worklist, so it shows the oldest work and empties", () => {
    expect(card).toMatch(/order\("created_at"/);
    expect(card, "an empty state that reads as an error would train people to ignore it")
      .toMatch(/noNewEnquiries/);
  });

  it("survives a lead with blank names rather than rendering a gap", () => {
    // first_name/last_name are NOT NULL but empty strings get through.
    expect(card).toMatch(/enquiryNoName/);
  });
});
