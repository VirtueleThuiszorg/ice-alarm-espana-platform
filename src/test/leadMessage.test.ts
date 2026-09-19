import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  JOIN_TOKEN_TTL_DAYS,
  LEAD_TEMPLATE_PLACEHOLDERS,
  buildJoinLink,
  joinTokenExpiry,
  leadEventKey,
  leadLanguage,
  leadTemplateVars,
  mintJoinToken,
  planLeadChannels,
} from "../../supabase/functions/_shared/lead-message";
import { renderTemplate } from "../../supabase/functions/_shared/notify-fulfilment";

/**
 * INTRODUCING ICE ALARM TO A LEAD.
 *
 * The staff member has already spoken to this person; this is the thing they send afterwards.
 * The assertions that matter most here are the refusals — a message that goes to somebody who
 * asked not to hear from us again costs more than every message that works.
 */

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

const OPEN = {
  doNotContact: false,
  smsChannelOn: true,
  whatsapp: { channelOn: true, configured: true },
  emailConfigured: true,
  phone: "+34600111222",
  email: "rosa@example.es",
};

describe("do_not_contact", () => {
  it("refuses every channel, whatever else is switched on", () => {
    // The one that costs more than all the others put together.
    const decisions = planLeadChannels({ ...OPEN, doNotContact: true });
    expect(decisions).toHaveLength(3);
    for (const d of decisions) {
      expect(d.attempt, `${d.channel} must not be attempted`).toBe(false);
      expect(d.outcome).toBe("skipped_do_not_contact");
    }
  });

  it("reports a row per channel rather than returning nothing", () => {
    /*
      An empty list reads as "there was nothing to try", which is also what a missing phone
      number looks like. A row per channel is a record that somebody pressed send and we
      declined — which is the fact worth having if anybody ever asks.
    */
    expect(planLeadChannels({ ...OPEN, doNotContact: true, phone: null, email: null }))
      .toHaveLength(3);
  });

  it("is named for what it is, not filed under a channel problem", () => {
    // `skipped_channel_off` invites somebody to turn a channel on. This one must not.
    const [sms] = planLeadChannels({ ...OPEN, doNotContact: true });
    expect(sms.outcome).not.toBe("skipped_channel_off");
    expect(sms.outcome).not.toBe("skipped_no_address");
  });

  it("and the gate is in the shared module, not in the function", () => {
    /*
      THE REASON THIS WRAPPER EXISTS. The brief says do_not_contact must be respected by every
      send path — including the follow-up runner, which is not written yet. The way to make that
      true of code nobody has written is for the only route to a channel decision to pass
      through the gate.
    */
    const shared = read("supabase/functions/_shared/lead-message.ts");
    expect(shared).toContain("skipped_do_not_contact");
    const fn = read("supabase/functions/send-lead-message/index.ts");
    expect(fn).toContain("planLeadChannels");
    expect(fn).not.toMatch(/if \(lead\.do_not_contact[^)]*\)\s*return/);
  });
});

describe("the channels behave exactly as they do everywhere else", () => {
  it("an off switch is reported as off", () => {
    const [sms] = planLeadChannels({ ...OPEN, smsChannelOn: false });
    expect(sms.outcome).toBe("skipped_channel_off");
  });

  it("WhatsApp without a sender number is `not configured`, not `off`", () => {
    // PENDING_FOR_LEE S15 is the record of what reporting a missing number as anything else cost.
    const wa = planLeadChannels({ ...OPEN, whatsapp: { channelOn: true, configured: false } })
      .find((d) => d.channel === "whatsapp");
    expect(wa?.outcome).toBe("skipped_not_configured");
  });

  it("no email address is `no address`", () => {
    const mail = planLeadChannels({ ...OPEN, email: null }).find((d) => d.channel === "email");
    expect(mail?.outcome).toBe("skipped_no_address");
  });
});

describe("the join link", () => {
  it("carries the lead's own token", () => {
    expect(buildJoinLink("https://icealarm.es", "tok123")).toBe(
      "https://icealarm.es/join?lead=tok123",
    );
  });

  it("carries the partner code too, when there is one", () => {
    // The same `ref` parameter the public /r/<code> links use, so the commission is decided by
    // one path with one first-touch rule rather than by a second mechanism that would drift.
    expect(buildJoinLink("https://icealarm.es", "tok123", "ICE-ABC")).toBe(
      "https://icealarm.es/join?lead=tok123&ref=ICE-ABC",
    );
    expect(buildJoinLink("https://icealarm.es", "tok123", "   ")).not.toContain("ref=");
  });

  it("survives a trailing slash on the site URL", () => {
    /*
      `https://icealarm.es//join?lead=…` is served by most hosts and REDIRECTED by some — and a
      redirect drops the query string, on exactly the setups that matter least often and hurt
      most. `member-update-request.ts` carries the same scar.
    */
    expect(buildJoinLink("https://icealarm.es/", "t")).toBe("https://icealarm.es/join?lead=t");
    expect(buildJoinLink("https://icealarm.es///", "t")).toBe("https://icealarm.es/join?lead=t");
  });

  it("escapes what it puts in the query string", () => {
    expect(buildJoinLink("https://x.es", "a+b/c=", "a b")).toBe(
      "https://x.es/join?lead=a%2Bb%2Fc%3D&ref=a%20b",
    );
  });
});

describe("the token", () => {
  it("is 30 days, and the expiry is computed from the constant", () => {
    expect(JOIN_TOKEN_TTL_DAYS).toBe(30);
    const now = new Date("2026-09-19T10:00:00Z");
    expect(joinTokenExpiry(now).toISOString()).toBe("2026-10-19T10:00:00.000Z");
  });

  it("is not a uuid, and is URL-safe", () => {
    /*
      A uuid in a URL is recognisably a uuid, and `leads.id` is one — somebody would eventually
      "simplify" this by using the id, at which point the link to any lead is the link to EVERY
      lead, because ids leak through every report and export this platform has.
    */
    let n = 0;
    const token = mintJoinToken((len) => Uint8Array.from({ length: len }, () => (n++ * 7) % 256));
    expect(token).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it("is different every time", () => {
    const real = (len: number) => crypto.getRandomValues(new Uint8Array(len));
    expect(mintJoinToken(real)).not.toBe(mintJoinToken(real));
  });

  it("is minted once per lead, not once per message", () => {
    // The SMS from Tuesday must not stop working when Thursday's email goes out — and the person
    // most likely to click the old one is the one who took three days to get round to it.
    const fn = read("supabase/functions/send-lead-message/index.ts");
    expect(fn).toMatch(/if \(!preview && \(!token \|\| expired\)\)/);
  });
});

describe("the template keys and placeholders", () => {
  it("are derived rather than written out six times", () => {
    // `lead.followup_whatsap` sitting in the code matching nothing is a send with no text.
    expect(leadEventKey("intro", "sms")).toBe("lead.intro_sms");
    expect(leadEventKey("intro", "whatsapp")).toBe("lead.intro_whatsapp");
    expect(leadEventKey("intro", "email")).toBe("lead.intro_email");
    expect(leadEventKey("followup", "sms")).toBe("lead.followup_sms");
    expect(leadEventKey("followup", "whatsapp")).toBe("lead.followup_whatsapp");
    expect(leadEventKey("followup", "email")).toBe("lead.followup_email");
  });

  it("every key the code can ask for exists in the migration, in all three languages", () => {
    /*
      A template that matches nothing is a send with no text, and the function deliberately has
      NO inline fallback — so a missing row is a `failed` a staff member sees. This holds the
      code and the seed together rather than trusting them to agree.
    */
    const sql = read("supabase/migrations/20260919120000_lead_working_schema.sql");
    for (const kind of ["intro", "followup"] as const) {
      for (const channel of ["sms", "whatsapp", "email"] as const) {
        for (const locale of ["en", "es", "nl"]) {
          const key = leadEventKey(kind, channel);
          expect(
            sql,
            `${key} / ${channel} / ${locale} is missing from the seed`,
          ).toContain(`('${key}', '${channel}', '${locale}'`);
        }
      }
    }
  });

  it("the four placeholders are what the templates actually use", () => {
    /*
      DERIVED FROM THE SEED, not restated. `renderTemplate` leaves an unknown `{{x}}` visible
      rather than blanking it, which is the right behaviour — but a placeholder in a template
      that the code never supplies would reach somebody's telephone as `{{staff_naem}}`.
    */
    const sql = read("supabase/migrations/20260919120000_lead_working_schema.sql");
    const leadSection = sql.slice(sql.indexOf("('lead.intro_sms'"));
    const used = new Set([...leadSection.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) {
      expect(
        (LEAD_TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name),
        `the templates use {{${name}}} and nothing supplies it`,
      ).toBe(true);
    }
  });

  it("and every placeholder the code supplies is rendered, not left visible", () => {
    const vars = leadTemplateVars({
      firstName: " Rosa ", staffName: " Ana Soares ",
      joinLink: "https://icealarm.es/join?lead=t", phone24h: " +34 950 473 199 ",
    });
    const body = "{{first_name}} / {{staff_name}} / {{join_link}} / {{phone_24h}}";
    expect(renderTemplate(body, vars)).toBe(
      "Rosa / Ana Soares / https://icealarm.es/join?lead=t / +34 950 473 199",
    );
  });

  it("an unknown placeholder stays visible", () => {
    // "Hola {{nombre}}" tells whoever sees it that a variable is wrong. "Hola " tells them nothing.
    expect(renderTemplate("Hola {{nombre}}", leadTemplateVars({
      firstName: "Rosa", staffName: "Ana", joinLink: "x", phone24h: "y",
    }))).toBe("Hola {{nombre}}");
  });
});

describe("the language", () => {
  it("is the lead's, and falls back to English rather than to nothing", () => {
    expect(leadLanguage("es")).toBe("es");
    expect(leadLanguage("nl")).toBe("nl");
    expect(leadLanguage("de")).toBe("en");
    expect(leadLanguage(null)).toBe("en");
  });
});

describe("the function", () => {
  const fn = read("supabase/functions/send-lead-message/index.ts");

  it("returns the link whatever the channels did", () => {
    /*
      Every channel can be off, unconfigured or addressless, and the staff member still needs the
      URL to read out over the telephone. With all three switches off in production that is not
      a fallback — it is how these links will actually be delivered.
    */
    expect(fn).toMatch(/return json\(200, \{ ok: true, joinLink/);
  });

  it("writes a lead_communications row for a skip as well as a send", () => {
    // "The SMS channel is off" and "we never tried" are different facts, and the one that gets a
    // product into trouble is the second one wearing the first one's clothes.
    const skipBlock = fn.slice(fn.indexOf("if (!decision.attempt)"), fn.indexOf("const { data: sendData"));
    expect(skipBlock).toContain('from("lead_communications")');
    expect(skipBlock).toContain("outcome: decision.outcome");
  });

  it("has no inline fallback text", () => {
    // A hard-coded English sentence behind an editable Spanish template is how somebody gets a
    // message in the wrong language months after the wording was "fixed" in the table.
    expect(fn).toContain("no template ${eventKey}");
    expect(fn).not.toMatch(/ICE Alarm España: (hello|hola|hallo)/);
  });

  it("previews through the same template read and the same render", () => {
    // A separately built preview eventually shows text the send does not use — which is worse
    // than no preview, because a staff member who has read the message believes they know what
    // was sent.
    const previewStop = fn.indexOf("if (preview) {");
    expect(previewStop).toBeGreaterThan(fn.indexOf("renderTemplate(tpl.body"));
    expect(previewStop).toBeLessThan(fn.indexOf("db.functions.invoke(TRANSPORT"));
  });

  it("moves the ladder only when a link actually left", () => {
    // A lead marked `join_link_sent` who was never sent one drops out of the follow-up filter,
    // which is the one place anybody would have noticed.
    expect(fn).toMatch(/if \(!preview && report\.some\(\(r\) => r\.outcome === "sent"\)\)/);
    expect(fn).toContain('"join_link_sent"');
  });
});
