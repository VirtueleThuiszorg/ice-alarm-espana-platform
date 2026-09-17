import { describe, it, expect } from "vitest";
import {
  decidePublicSubmit,
  detectLanguage,
  ipPrefix,
  isPublicEmail,
  normalisePublicPhone,
  publicFormFields,
  spamReasonsFor,
  type PublicSubmitContext,
} from "../../supabase/functions/_shared/public-submit";

/**
 * THE DOOR ON THE PUBLIC FORMS.
 *
 * A lead arrived with no name, no email and no phone, and rang the new-enquiry bell. The only
 * validation was `required` attributes on an HTML form — which exist in a visitor's browser and
 * nowhere at all for a script POSTing to the REST endpoint.
 *
 * Every assertion below is a submission that used to be accepted. They run in milliseconds
 * because the decision is a pure function; the edge function around it only does I/O.
 */

const OPEN: PublicSubmitContext = {
  recentFromIp: 0,
  recentFromEmail: 0,
  limitPerHour: 5,
  turnstileRequired: false,
  turnstileVerified: false,
};

const GOOD = {
  first_name: "María",
  last_name: "Ruiz",
  email: "maria.ruiz@example.com",
  phone: "600111222",
  preferred_language: "es",
  enquiry_type: "general",
  message: "Buenos días, quería preguntar por el colgante para mi padre de 82 años.",
};

const contact = (fields: Record<string, unknown>, ctx: Partial<PublicSubmitContext> = {}) =>
  decidePublicSubmit({ form: "contact", fields }, { ...OPEN, ...ctx });

describe("the submission that started this is refused", () => {
  it("refuses one with no name, no email and no phone, naming all three", () => {
    const d = contact({ message: "Hello there, I have a question about your service." });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.status).toBe(400);
    expect(d.fields.sort()).toEqual(["email", "first_name", "phone"]);
  });

  it("refuses a missing phone and NAMES phone, so the form can mark the box", () => {
    const { phone: _dropped, ...withoutPhone } = GOOD;
    const d = contact(withoutPhone);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.status).toBe(400);
    expect(d.fields).toEqual(["phone"]);
  });

  it("treats whitespace as absence — an imported row can carry a space, so can a POST", () => {
    const d = contact({ ...GOOD, first_name: "   ", email: "\t\n" });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields.sort()).toEqual(["email", "first_name"]);
  });

  it("collects EVERY bad field rather than stopping at the first", () => {
    // Somebody who left two boxes empty is told about both, instead of finding the second one
    // on the next attempt.
    const d = contact({ ...GOOD, email: "not-an-email", phone: "12" });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields.sort()).toEqual(["email", "phone"]);
  });

  it("refuses an enquiry with no enquiry in it", () => {
    const d = contact({ ...GOOD, message: "hi" });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields).toEqual(["message"]);
  });

  it("accepts a real one, and normalises what it stores", () => {
    const d = contact(GOOD);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.values.phone).toBe("+34600111222");
    expect(d.values.email).toBe("maria.ruiz@example.com");
    expect(d.values.first_name).toBe("María");
    expect(d.spamReasons).toEqual([]);
  });

  it("stores only the fields the form declares — a POST cannot set a column it likes", () => {
    const d = contact({ ...GOOD, status: "converted", assigned_to: "somebody", id: "x" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(Object.keys(d.values).every((k) => publicFormFields("contact").includes(k))).toBe(true);
    expect(d.values.status).toBeUndefined();
    expect(d.values.assigned_to).toBeUndefined();
  });
});

describe("the bot checks, which cost nothing and come first", () => {
  it("refuses a filled honeypot — no human can fill a field they cannot see", () => {
    const d = decidePublicSubmit(
      { form: "contact", fields: GOOD, honeypot: "Acme Ltd" },
      OPEN,
    );
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.status).toBe(400);
    expect(d.reason).toBe("honeypot");
  });

  it("does not tell a bot WHICH fields to fix", () => {
    // The honeypot refusal names no fields, on purpose: a script that is handed a list of what
    // was wrong has been given a free tutorial.
    const d = decidePublicSubmit({ form: "contact", fields: {}, honeypot: "x" }, OPEN);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields).toEqual([]);
  });

  it("an empty honeypot is the normal case and changes nothing", () => {
    expect(decidePublicSubmit({ form: "contact", fields: GOOD, honeypot: "" }, OPEN).ok).toBe(true);
    expect(decidePublicSubmit({ form: "contact", fields: GOOD }, OPEN).ok).toBe(true);
  });

  it("refuses the 6th submission in an hour from one IP with 429", () => {
    expect(contact(GOOD, { recentFromIp: 4 }).ok).toBe(true);
    const sixth = contact(GOOD, { recentFromIp: 5 });
    expect(sixth.ok).toBe(false);
    if (sixth.ok) return;
    expect(sixth.status).toBe(429);
    expect(sixth.reason).toBe("rate_limited_ip");
  });

  it("limits by email too, so rotating IPs does not buy an unlimited run", () => {
    const d = contact(GOOD, { recentFromEmail: 5 });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.status).toBe(429);
    expect(d.reason).toBe("rate_limited_email");
  });

  it("checks the sender BEFORE the fields — a malformed flood is still a flood", () => {
    // Otherwise a script sending garbage would be refused on validation for ever and never once
    // be slowed down.
    const d = contact({}, { recentFromIp: 99 });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.status).toBe(429);
  });

  it("Turnstile is off unless a key is configured, and refuses when it is and fails", () => {
    expect(contact(GOOD, { turnstileRequired: false, turnstileVerified: false }).ok).toBe(true);
    const d = contact(GOOD, { turnstileRequired: true, turnstileVerified: false });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toBe("turnstile_failed");
    expect(contact(GOOD, { turnstileRequired: true, turnstileVerified: true }).ok).toBe(true);
  });
});

describe("spam is a guess, and is treated as one", () => {
  it("flags a link — a daughter asking about a pendant has nothing to link to", () => {
    expect(spamReasonsFor({ message: "Visit https://cheap-seo.example now" })).toContain(
      "link_in_message",
    );
    expect(spamReasonsFor({ message: "see www.example.com" })).toContain("link_in_message");
    expect(spamReasonsFor({ message: "our site is example.com" })).toContain("link_in_message");
  });

  it("flags the pitch this was actually built for, in the words it arrives in", () => {
    const reasons = spamReasonsFor({
      message:
        "Podemos posicionar su web en la primera página de Google y publicar en periódicos digitales.",
    });
    expect(reasons).toContain("vendor_pitch");
  });

  it("flags a message written in a language other than the one selected", () => {
    const reasons = spamReasonsFor({
      preferred_language: "en",
      message:
        "Buenos días, les escribo para ofrecerles nuestros servicios de marketing y mejorar su posicionamiento en la web de su empresa con nuestro equipo.",
    });
    expect(reasons).toContain("language_mismatch");
  });

  it("does NOT flag an ordinary enquiry, in either language", () => {
    expect(
      spamReasonsFor({
        preferred_language: "en",
        message:
          "Hello, my mother is 84 and lives alone. I would like to know what the pendant costs and whether you have anyone who could visit her at home to fit it.",
      }),
    ).toEqual([]);
    expect(spamReasonsFor({ preferred_language: "es", message: GOOD.message })).toEqual([]);
  });

  it("a flagged submission is still ACCEPTED — the flag suppresses the bell, not the lead", () => {
    /*
      The whole point. The next message to trip "Spanish text, English selected" will be a real
      Spanish daughter who picked the wrong flag, and losing her enquiry would be far worse than
      an unnecessary bell.
    */
    const d = contact({
      ...GOOD,
      preferred_language: "en",
      message:
        "Buenos días, les escribo para ofrecerles nuestros servicios de marketing y mejorar su posicionamiento en la web de su empresa con nuestro equipo.",
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.spamReasons.length).toBeGreaterThan(0);
  });
});

describe("the language detector says 'I do not know' readily", () => {
  it("reads a long enough message", () => {
    expect(
      detectLanguage(
        "Hello, my mother is 84 and lives alone and I would like to know what the pendant costs for her",
      ),
    ).toBe("en");
    expect(
      detectLanguage(
        "Buenos días, quería preguntar por el precio del colgante para mi padre que vive solo y es muy mayor",
      ),
    ).toBe("es");
    expect(
      detectLanguage(
        "Goedendag, ik zou graag willen weten wat de hanger kost voor mijn moeder die alleen woont en dat is belangrijk",
      ),
    ).toBe("nl");
  });

  it("returns null for anything too short to have grammar in it", () => {
    // A guess made from three words is worse than no guess: it would flag half the real
    // enquiries as a language mismatch.
    expect(detectLanguage("Hola")).toBeNull();
    expect(detectLanguage("thanks!")).toBeNull();
    expect(detectLanguage("¿Cuánto cuesta?")).toBeNull();
  });

  it("returns null when two languages are within a word of each other", () => {
    // `de` and `is` belong to two of the three languages, so a one-word lead is noise. This
    // sample gives English and Spanish an equal showing and gets no answer, which is correct.
    expect(detectLanguage("the and is for with la los que para con x y z w q r s t u v")).toBeNull();
  });
});

describe("what is stored about the sender is less than what was sent", () => {
  it("truncates IPv4 to the /24 — a household, not a machine", () => {
    expect(ipPrefix("81.34.200.17")).toBe("81.34.200.0/24");
  });

  it("truncates IPv6 to the /64", () => {
    expect(ipPrefix("2a02:9130:88a1:1c00:1:2:3:4")).toBe("2a02:9130:88a1:1c00::/64");
  });

  it("takes the first hop of an X-Forwarded-For chain, which is the client", () => {
    expect(ipPrefix("81.34.200.17, 172.16.0.1, 10.0.0.3")).toBe("81.34.200.0/24");
  });

  it("returns null rather than inventing a key it cannot parse", () => {
    expect(ipPrefix("")).toBeNull();
    expect(ipPrefix(null)).toBeNull();
    expect(ipPrefix("not-an-ip")).toBeNull();
    expect(ipPrefix("999.1.1.1")).toBeNull();
  });
});

describe("the field helpers", () => {
  it("normalises Spanish numbers to E.164, the same rule the CRM import used", () => {
    // A contact form storing 600111222 while the import stored +34600111222 makes one person two
    // people to anything that matches on phone.
    expect(normalisePublicPhone("600 111 222")).toBe("+34600111222");
    expect(normalisePublicPhone("+34 600 111 222")).toBe("+34600111222");
    expect(normalisePublicPhone("0034600111222")).toBe("+34600111222");
    expect(normalisePublicPhone("+44 7700 900123")).toBe("+447700900123");
  });

  it("refuses a number it cannot dial rather than storing a broken one", () => {
    // Indistinguishable from a good one until somebody tries it in front of a customer.
    expect(normalisePublicPhone("12345")).toBe("");
    expect(normalisePublicPhone("abc")).toBe("");
    expect(normalisePublicPhone("")).toBe("");
  });

  it("asks of an email only what is worth asking", () => {
    expect(isPublicEmail("maria@example.com")).toBe(true);
    expect(isPublicEmail("maria@example")).toBe(false);
    expect(isPublicEmail("maria example.com")).toBe(false);
    expect(isPublicEmail("a@b.co")).toBe(true);
    expect(isPublicEmail("")).toBe(false);
  });

  it("drops an unknown language instead of losing the enquiry over it", () => {
    const d = contact({ ...GOOD, preferred_language: "de" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.values.preferred_language).toBeUndefined();
  });

  it("refuses an enquiry_type that is not one of ours", () => {
    const d = contact({ ...GOOD, enquiry_type: "'; DROP TABLE leads; --" });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields).toEqual(["enquiry_type"]);
  });
});

describe("the product-interest box asks for one thing", () => {
  const notify = (fields: Record<string, unknown>) =>
    decidePublicSubmit({ form: "product_interest", fields }, OPEN);

  it("accepts an email and a product", () => {
    const d = notify({ email: "A.Person@Example.COM", product_name: "Vivago SOS pendant" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.values.email).toBe("a.person@example.com");
  });

  it("does not ask for a phone number to tell somebody a product is back", () => {
    // Asking would lose most of the people who would otherwise ask.
    expect(publicFormFields("product_interest")).not.toContain("phone");
  });

  it("still refuses a missing email", () => {
    const d = notify({ product_name: "Vivago SOS pendant" });
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.fields).toEqual(["email"]);
  });
});
