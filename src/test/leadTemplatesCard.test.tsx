import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { LEAD_TEMPLATE_PLACEHOLDERS } from "../../supabase/functions/_shared/lead-message";

/**
 * THE TEMPLATE EDITOR, and the two things it exists to stop.
 *
 * `send-lead-message` reads these rows and has NO inline fallback text, so this card is the only
 * place the wording of a lead message exists. Everything else about it is ordinary; these two
 * are not:
 *
 *   A PLACEHOLDER NOTHING FILLS IN. `renderTemplate` leaves an unknown `{{x}}` visible rather
 *   than blanking it, which is right — but it only helps if somebody SEES it, and the person who
 *   typed `{{nombre}}` is not the person who will read the text on a stranger's telephone.
 *
 *   A THIRD SMS SEGMENT. 320 characters is two; the third costs a third again, on every message,
 *   for ever, and nobody typing into a box knows they have crossed it.
 */

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const src = read("src/components/admin/settings/LeadTemplatesCard.tsx");

describe("the placeholder list", () => {
  it("is read from the code that supplies them, not written out here", () => {
    // A fifth placeholder added to `leadTemplateVars` without one here would be usable and
    // undiscoverable; a fourth removed would be offered and never filled in.
    expect(src).toContain("LEAD_TEMPLATE_PLACEHOLDERS.map");
    expect(src).not.toMatch(/\["first_name", "staff_name"/);
  });

  it("covers exactly the four the brief names", () => {
    expect([...LEAD_TEMPLATE_PLACEHOLDERS]).toEqual([
      "first_name", "staff_name", "join_link", "phone_24h",
    ]);
  });

  it("and an unknown one in the body is called out as you type", () => {
    expect(src).toContain("unknownPlaceholders");
    expect(src).toContain('data-testid="lead-template-unknown"');
    // Said in terms of what will HAPPEN, not "invalid placeholder" — the person reading it needs
    // to know the text goes out as written, not that a rule was broken.
    expect(src).toContain("it will be sent exactly as written");
  });
});

describe("the SMS length", () => {
  it("counts the RENDERED message, not the template", () => {
    /*
      The template is always shorter than what goes out, and the difference is most of a
      segment: a join link with a partner code is about 70 characters where `{{join_link}}` is
      13. Counting the template would be reassuring and wrong.
    */
    expect(src).toContain("rendered(row.body).length");
    expect(src).toContain("https://icealarm.es/join?lead=");
  });

  it("is 320 — two GSM segments — and email is exempt", () => {
    expect(src).toContain("const SMS_LIMIT = 320");
    expect(src).toContain('channel !== "email"');
  });

  it("and the sample values are realistic rather than one character each", () => {
    // `first_name: "a"` would make every count pass.
    const sample = src.slice(src.indexOf("const SAMPLE"), src.indexOf("interface Row"));
    expect(sample).toContain("Ana Soares");
    expect(sample).toContain("PARTNER01");
  });
});

describe("a missing template", () => {
  it("is shown as a failure, not as an empty box", () => {
    /*
      `send-lead-message` has no fallback text: a row that is not there is a send that FAILS.
      Rendering it as an empty editable box would invite somebody to leave it empty, and this
      card is the only place anybody would find out before a staff member does, in front of a
      customer.
    */
    expect(src).toContain('data-testid="lead-template-missing"');
    expect(src).toContain("sending this will fail");
  });
});

describe("who may edit", () => {
  it("is passed in, and every control respects it", () => {
    // `notification_templates` is admin-manage / staff-read at the database, so a call-centre
    // operator's save would be refused by RLS with a toast and no explanation. Better not to
    // offer the button.
    expect(src).toContain("canEdit");
    expect((src.match(/disabled=\{!canEdit\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("{canEdit && (");
  });

  it("and the card is mounted under Notifications, where the brief puts it", () => {
    const page = read("src/pages/admin/SettingsPage.tsx");
    expect(page).toContain("<LeadTemplatesCard canEdit={canEditNotifications} />");
  });
});

describe("it edits the six messages, in three languages", () => {
  it("both kinds, all three channels", () => {
    expect(src).toContain('const KINDS: LeadMessageKind[] = ["intro", "followup"]');
    expect(src).toContain('const CHANNELS: LeadChannel[] = ["sms", "whatsapp", "email"]');
    expect(src).toContain('const LOCALES = ["en", "es", "nl"]');
  });

  it("keyed through the same function the sender uses", () => {
    // A card that built `lead.intro_sms` by hand would edit a row nothing reads the day somebody
    // renamed the event key.
    expect(src).toContain("leadEventKey(kind, channel)");
  });
});
