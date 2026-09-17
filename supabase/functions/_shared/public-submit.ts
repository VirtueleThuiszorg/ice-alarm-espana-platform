/**
 * public-submit.ts — what a public form submission is allowed to be, decided in one pure place.
 *
 * ── WHAT WENT WRONG ─────────────────────────────────────────────────────────
 *
 * A lead arrived with no name, no email and no phone, and rang the new-enquiry bell for Lee and
 * Martijn. Nobody could act on it. The cause was not a check somebody forgot: it was that the
 * only checks were `required` attributes on an HTML form. Those exist in the browser of a person
 * who visits the page, and nowhere at all for a script that POSTs to the REST endpoint — which
 * `leads` accepted directly, because "Anyone can submit leads" was `WITH CHECK (true)` and every
 * column was nullable.
 *
 * A validation rule that lives in the page is a hint. This module is the rule.
 *
 * ── WHY IT IS PURE ──────────────────────────────────────────────────────────
 *
 * The edge function around it does I/O: read the body, count recent rows, insert, log. Every
 * DECISION is here — is this complete, is it a bot, is it too soon, is it spam — as functions
 * over plain values. That is what makes "the sixth submission in an hour is refused" a test that
 * runs in a millisecond instead of a claim about a deployed function nobody re-checks.
 *
 * It also has no Deno-only imports on purpose: `validation.ts` pulls zod from `npm:`, which
 * vitest cannot resolve, so a schema written there would be a schema with no test. The shapes
 * below are small enough to check by hand and the checks are the interesting part anyway.
 */

/** The forms that may write to the database without anybody being signed in. */
export type PublicFormId = "contact" | "product_interest";

/** How a single field is checked. Nothing here is a regex nobody can read six months on. */
type FieldKind = "name" | "email" | "phone" | "text" | "language" | "choice";

interface FieldSpec {
  kind: FieldKind;
  required: boolean;
  max: number;
  /** For "choice": what it may be. An unknown value is refused rather than stored. */
  options?: readonly string[];
}

/**
 * THE FORMS, AND WHAT EACH ONE MUST HAVE TO BE WORTH ANYTHING.
 *
 * "Required" here means REQUIRED TO ACT ON IT, which is a higher bar than "the form asked for
 * it". A contact enquiry with no way to reply is not a lead with a gap in it — it is a row that
 * wastes the time of whoever opens it, twice: once reading it and once deciding there is nothing
 * to do. So first name, email AND phone are all required on the contact form, and the message
 * is too: an enquiry with no enquiry in it is the shape every bot submission took.
 *
 * `product_interest` is the "Notify me" box on the pendant page. One field, on purpose — asking
 * for a phone number to be told when something is back in stock would lose most of the people
 * who would otherwise ask.
 */
const FORMS: Record<PublicFormId, Record<string, FieldSpec>> = {
  contact: {
    first_name: { kind: "name", required: true, max: 100 },
    last_name: { kind: "name", required: false, max: 100 },
    email: { kind: "email", required: true, max: 255 },
    phone: { kind: "phone", required: true, max: 32 },
    preferred_language: { kind: "language", required: false, max: 5 },
    enquiry_type: {
      kind: "choice",
      required: false,
      max: 40,
      options: ["general", "product", "support", "partnership", "press"],
    },
    message: { kind: "text", required: true, max: 4000 },
  },
  product_interest: {
    email: { kind: "email", required: true, max: 255 },
    product_name: { kind: "text", required: true, max: 120 },
    preferred_language: { kind: "language", required: false, max: 5 },
  },
};

export function publicFormFields(form: PublicFormId): readonly string[] {
  return Object.keys(FORMS[form]);
}

/** A message has to be long enough to be an enquiry and short enough not to be an essay. */
const MESSAGE_MIN = 10;

/**
 * E.164, Spanish numbers assumed +34.
 *
 * Deliberately the same rule as `iceCrmImport.normalisePhone`, which is what the imported 431
 * members' numbers went through: a contact form that stored `600111222` while the CRM import
 * stored `+34600111222` would make the same person two people to anything that matches on phone.
 *
 * Returns "" when it cannot be determined, and the caller refuses — a number we cannot dial is
 * not better than no number, because it is indistinguishable from one we can until somebody
 * tries it in front of a customer.
 */
export function normalisePublicPhone(raw: string): string {
  let v = (raw ?? "").replace(/[^\d+]/g, "");
  if (!v) return "";
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (!v.startsWith("+")) {
    if (/^[6789]\d{8}$/.test(v)) v = `+34${v}`;
    else if (/^\d{6,}$/.test(v)) v = `+${v}`;
    else return "";
  }
  return /^\+\d{6,15}$/.test(v) ? v : "";
}

/**
 * Deliberately not RFC 5322. That grammar accepts addresses no mail server will take and is
 * famously unreadable; this asks the only question worth asking of a contact form — is there a
 * local part, an @, and a domain with a dot in it.
 */
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function isPublicEmail(raw: string): boolean {
  const v = (raw ?? "").trim();
  return v.length > 0 && v.length <= 255 && EMAIL.test(v);
}

/** The three languages the site is in. Anything else is not a language we can reply in. */
const LANGUAGES = ["en", "es", "nl"] as const;

// ── SPAM, WHICH IS A GUESS AND IS TREATED AS ONE ────────────────────────────

/**
 * A URL in the message.
 *
 * On a contact form for a personal-alarm company this is close to a perfect signal: a daughter
 * asking about her father's pendant has nothing to link to. It is still only a signal — it
 * suppresses the bell, never the lead.
 */
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|es|info|biz|shop|online|xyz)\b/i;

/**
 * The vendor pitch, in the words it actually arrives in.
 *
 * Taken from the submission that prompted this, not imagined: SEO agencies selling placement in
 * "periódicos digitales" are the overwhelming majority of what a Spanish business contact form
 * receives. Each term is a phrase somebody selling something uses and a member of the public
 * does not.
 */
const VENDOR_PITCH = [
  "posicionar",
  "posicionamiento",
  "seo",
  "periodicos digitales",
  "periódicos digitales",
  "backlink",
  "link building",
  "marketing digital",
  "primera pagina de google",
  "primera página de google",
  "aumentar sus ventas",
  "guest post",
  "dofollow",
];

/**
 * Which of the three languages a message reads as, or null when it is too short or too mixed.
 *
 * A COUNT OF FUNCTION WORDS, and nothing cleverer. Content words are shared across these three
 * languages far more than grammar is, and a pendant enquiry is full of borrowed nouns. Function
 * words are short, frequent, and nearly disjoint between English, Spanish and Dutch — which
 * makes a word-set count both cheap and hard to fool, and it needs no model, no network call and
 * no dependency in an edge function that has to answer a form submission in milliseconds.
 *
 * It returns NULL readily. "I do not know" is the right answer for "Hola" or "thanks!", and a
 * detector that always picks something would flag half the real enquiries as language mismatches.
 */
const STOPWORDS: Record<string, readonly string[]> = {
  en: ["the", "and", "is", "are", "for", "with", "you", "your", "would", "please", "my", "have", "about", "could", "we", "our", "this", "that"],
  es: ["el", "la", "los", "las", "de", "que", "y", "para", "con", "su", "usted", "es", "son", "una", "un", "por", "como", "muy", "nuestro"],
  nl: ["de", "het", "een", "en", "van", "is", "zijn", "voor", "met", "uw", "je", "wij", "ons", "graag", "kunnen", "dat", "dit", "maar"],
};

export function detectLanguage(text: string): "en" | "es" | "nl" | null {
  const words = (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Under a dozen words there is not enough grammar in a message to read its language, and a
  // guess made from three words is worse than no guess.
  if (words.length < 12) return null;

  const scores = (Object.keys(STOPWORDS) as Array<"en" | "es" | "nl">).map((lang) => ({
    lang,
    hits: words.filter((w) => STOPWORDS[lang].includes(w)).length,
  }));
  scores.sort((a, b) => b.hits - a.hits);

  const [top, second] = scores;
  // Needs both a real showing and a clear margin: "de" and "is" belong to two of the three, so a
  // one-word lead is noise.
  if (top.hits < 3 || top.hits - second.hits < 2) return null;
  return top.lang;
}

/** Why a submission is suspected. Empty means it is not. */
export function spamReasonsFor(fields: {
  message?: string;
  preferred_language?: string;
}): string[] {
  const message = (fields.message ?? "").trim();
  if (!message) return [];
  const reasons: string[] = [];

  if (URL_IN_TEXT.test(message)) reasons.push("link_in_message");

  const haystack = message.toLowerCase();
  if (VENDOR_PITCH.some((term) => haystack.includes(term))) reasons.push("vendor_pitch");

  const selected = (fields.preferred_language ?? "").trim().toLowerCase();
  const detected = detectLanguage(message);
  if (detected && selected && LANGUAGES.includes(selected as never) && detected !== selected) {
    reasons.push("language_mismatch");
  }

  return reasons;
}

// ── THE DECISION ────────────────────────────────────────────────────────────

export interface PublicSubmitInput {
  form: PublicFormId;
  fields: Record<string, unknown>;
  /**
   * The hidden field. A browser leaves it empty because nobody can see it; a script fills every
   * input it finds. Named `company` in the markup rather than `honeypot`, for the same reason.
   */
  honeypot?: unknown;
}

export interface PublicSubmitContext {
  /** Accepted or refused attempts from this IP prefix in the last hour. */
  recentFromIp: number;
  /** Accepted or refused attempts from this email in the last hour. */
  recentFromEmail: number;
  /** Per hour, per IP and per email. */
  limitPerHour: number;
  /** True only when a Turnstile site key is configured in settings. Off by default. */
  turnstileRequired: boolean;
  turnstileVerified: boolean;
}

export type PublicSubmitDecision =
  | {
      ok: true;
      /** The row to insert, already normalised. Only keys the form declares. */
      values: Record<string, string>;
      spamReasons: string[];
    }
  | {
      ok: false;
      status: 400 | 429;
      /** Field names the form should mark. Empty for refusals that are not about a field. */
      fields: string[];
      /** A machine-readable cause, for the log and for the tests. Never shown to a visitor. */
      reason: string;
    };

/**
 * Everything a public submission has to survive, in the order that gives the best answer.
 *
 * THE ORDER IS NOT ARBITRARY. The honeypot and the rate limit come first because they are about
 * the SENDER and cost nothing; field validation comes after, because its refusal names fields
 * and a bot should not be handed a list of what to fix. A human who fills the form wrongly never
 * reaches the first two.
 */
export function decidePublicSubmit(
  input: PublicSubmitInput,
  ctx: PublicSubmitContext,
): PublicSubmitDecision {
  const spec = FORMS[input.form];
  if (!spec) return { ok: false, status: 400, fields: [], reason: "unknown_form" };

  // 1. The honeypot. A filled hidden field is not a mistake anybody can make.
  const honeypot = typeof input.honeypot === "string" ? input.honeypot.trim() : "";
  if (honeypot.length > 0) {
    return { ok: false, status: 400, fields: [], reason: "honeypot" };
  }

  // 2. Turnstile, when a key is configured. Off by default — see the function's README note.
  if (ctx.turnstileRequired && !ctx.turnstileVerified) {
    return { ok: false, status: 400, fields: [], reason: "turnstile_failed" };
  }

  // 3. The rate limit, counted over accepted AND refused attempts. A limiter that only counts
  //    successes does not slow down a script that is failing a thousand times an hour.
  if (ctx.recentFromIp >= ctx.limitPerHour) {
    return { ok: false, status: 429, fields: [], reason: "rate_limited_ip" };
  }
  if (ctx.recentFromEmail >= ctx.limitPerHour) {
    return { ok: false, status: 429, fields: [], reason: "rate_limited_email" };
  }

  // 4. The fields. EVERY failing field is collected rather than the first, so somebody who left
  //    two boxes empty is told about both instead of discovering the second on the next attempt.
  const values: Record<string, string> = {};
  const bad: string[] = [];

  for (const [field, rule] of Object.entries(spec)) {
    const raw = input.fields[field];
    const given = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();

    if (given.length === 0) {
      if (rule.required) bad.push(field);
      continue;
    }
    if (given.length > rule.max) {
      bad.push(field);
      continue;
    }

    switch (rule.kind) {
      case "email": {
        if (!isPublicEmail(given)) bad.push(field);
        else values[field] = given.toLowerCase();
        break;
      }
      case "phone": {
        const e164 = normalisePublicPhone(given);
        if (!e164) bad.push(field);
        else values[field] = e164;
        break;
      }
      case "language": {
        // An unknown language is dropped rather than refused: it is never something a visitor
        // typed, and losing an enquiry over a stale locale code would be absurd.
        if (LANGUAGES.includes(given.toLowerCase() as never)) values[field] = given.toLowerCase();
        break;
      }
      case "choice": {
        if (!rule.options?.includes(given)) bad.push(field);
        else values[field] = given;
        break;
      }
      case "name": {
        values[field] = given;
        break;
      }
      case "text": {
        // Only the message has a floor, and only where the form declares one.
        if (field === "message" && given.length < MESSAGE_MIN) bad.push(field);
        else values[field] = given;
        break;
      }
    }
  }

  if (bad.length > 0) {
    return { ok: false, status: 400, fields: bad, reason: "invalid_fields" };
  }

  return {
    ok: true,
    values,
    spamReasons: spamReasonsFor({
      message: values.message,
      preferred_language: values.preferred_language,
    }),
  };
}

// ── THE THINGS THE LOG REMEMBERS, WHICH ARE DELIBERATELY NOT THE THINGS SENT ──

/**
 * An IPv4 /24 or an IPv6 /64 — a household or an office, not a machine.
 *
 * Storing less than we are given is the better limiter as well as the smaller liability: a bot
 * farm rotating the last octet defeats a full-address limit and does not defeat this one.
 * Returns null for anything unparseable, and the caller then limits by email alone rather than
 * inventing a key.
 */
export function ipPrefix(raw: string | null | undefined): string | null {
  const ip = (raw ?? "").split(",")[0].trim();
  if (!ip) return null;

  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) {
    const parts = [v4[1], v4[2], v4[3]];
    if (parts.every((p) => Number(p) <= 255)) return `${parts.join(".")}.0/24`;
    return null;
  }

  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean);
    if (groups.length >= 4) return `${groups.slice(0, 4).join(":")}::/64`;
    return null;
  }

  return null;
}
