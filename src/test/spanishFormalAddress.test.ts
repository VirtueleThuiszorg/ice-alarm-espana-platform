/**
 * Spanish must address the member as *usted*, everywhere the member can read it.
 *
 * MEMBER_UX_RULES.md R9: "Spanish uses *usted*." This is not a style preference
 * dressed up as a rule. The people who buy this product are largely in their
 * seventies and eighties; in Spain, being addressed as *tú* by a company you
 * pay is not warmth, it is a stranger being over-familiar with you. It reads as
 * a call centre that does not take you seriously — which is precisely the wrong
 * impression for the company that answers when you fall.
 *
 * It also has to be CONSISTENT. Before this test, `howItWorksPage` had the
 * operator speaking to María as *usted* in step 5 and as *tú* in step 6, two
 * paragraphs apart, in the same imagined phone call. Mixed register is worse
 * than either register chosen badly, because it reads as carelessness.
 *
 * WHAT THIS TEST DOES NOT COVER, DELIBERATELY
 *
 * Staff and admin namespaces are excluded. Internal tooling — the media
 * manager, the outreach planner, the CRM, the rota, the operator's own SOS
 * screen — is read by colleagues, and *usted* between colleagues is stilted
 * rather than respectful. The rule is about how the company speaks to the
 * people it protects, not about how the tool speaks to the people who run it.
 * `nl.json` has the same je/u distinction and is NOT covered here; that is a
 * separate piece of work with a separate reviewer.
 *
 * WHY THE MARKERS ARE A FIXED LIST AND NOT A CLEVER REGEX
 *
 * For -ar verbs the *tú* imperative and the *usted* present are the same word:
 * "Pulsa el botón" is informal, "Cuando Pulsa el Botón" is formal, and nothing
 * in the string distinguishes them. So this test only looks for forms that are
 * unambiguously second-person-singular-familiar. That means it can miss an
 * informal string; it means it cannot invent one. A guard that cried wolf on
 * "Su Equipo Lo Ve Todo" would be switched off within a week.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Namespaces a member, a visitor or a partner reads. Deliberately wider than
 * `localeParse.test.ts`'s MEMBER_FACING, which exists to catch untranslated
 * English and so is scoped to the namespaces with a complete translation.
 * Register is a different question: a *tú* anywhere the member can see it is a
 * defect whether or not the rest of that namespace is finished.
 */
const MEMBER_FACING = [
  // public / marketing
  "landing", "blog", "pendant", "howItWorksPage", "faq", "contact", "pricing",
  "products", "legal", "gdpr", "help",
  // signed-in member
  "membership", "device", "alerts", "alertHistory", "messages", "contacts",
  "emergencyContacts", "medical", "subscription", "support", "profile",
  "dashboard", "clientDashboard", "sidebar", "navigation", "common", "auth",
  "validation", "errors", "chat", "aiChat", "isabella", "joinWizard",
  "registration", "memberUpdate", "notifications", "phoneOnly", "deviceStatus",
  "pendantStatus",
  // partner-facing
  "partner", "partnerSupport", "partnerInvites", "partnerAgreement",
  "partnerLogin", "partnerTypes", "partnerRegions",
] as const;

/**
 * Forms that are second-person-singular-familiar and cannot be read any other
 * way. Ambiguous forms are excluded on purpose — see the header. "Responde"
 * and "Ve" were in an earlier draft of the imperative list and had to come
 * out: they matched "Responde una persona de verdad" and "Su Equipo Lo Ve
 * Todo", both of which are correct formal Spanish.
 *
 * `\b` is the wrong tool for the boundaries here and getting it wrong is silent. In JavaScript,
 * `\b` is defined against `[A-Za-z0-9_]`, so "ú" is not a word character:
 * `/\btú\b/` never matches "tú", because there is no boundary between "ú" and
 * the space after it. The first draft of this file shipped exactly that bug,
 * and a mutation test that injected the literal word "tú" into a member-facing
 * string passed green. Every marker is therefore built with Unicode-aware
 * lookarounds instead.
 */
const boundary = (alternatives: string, flags: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, `u${flags}`);

/** Pronouns and conjugations: case-insensitive, because they start sentences. */
const informalWord = (alternatives: string) => boundary(alternatives, "i");

/**
 * Imperatives: case-SENSITIVE, and that is not an oversight. Several of these
 * are also the third-person present, which is the correct *usted* form — "Sigue
 * protegiéndole" (it keeps protecting you) is formal, "Sigue leyendo" (keep
 * reading) is not. Requiring the capital restricts the match to sentence-initial
 * position, where an imperative actually lives.
 */
const informalImperative = (alternatives: string) => boundary(alternatives, "");

const INFORMAL_MARKERS: ReadonlyArray<readonly [string, RegExp]> = [
  ["tú (subject pronoun)", informalWord("tú")],
  ["tu / tus (informal possessive)", informalWord("tus?")],
  ["ti / contigo", informalWord("ti|contigo")],
  ["tuyo / tuya (informal possessive)", informalWord("tuy[oa]s?")],
  ["te (informal object pronoun)", informalWord("te")],
  [
    "informal present tense",
    informalWord(
      "puedes|tienes|quieres|necesitas|debes|estás|eres|haces|vas|sabes|recibes|llamas|usas|sales|pulsas|vives|has|dices|pones|vienes|sientes|conoces",
    ),
  ],
  [
    "informal future tense",
    informalWord("podrás|tendrás|recibirás|estarás|serás|verás|harás|irás|sabrás|querrás"),
  ],
  [
    "informal subjunctive",
    informalWord("puedas|tengas|quieras|seas|estés|vayas|hagas|salgas|sepas|vengas|digas"),
  ],
  [
    "enclitic -te (verb + informal pronoun)",
    informalWord(
      "ayudarte|contactarte|registrarte|protegerte|moverte|quedarte|llamarte|enviarte|mostrarte|ofrecerte|informarte|avisarte|ponerte|hacerte|verte|darte|decirte|sentirte|levantarte|prepararte|unirte|suscribirte|acompañarte|atenderte|localizarte|escucharte|protegiéndote|ayudándote|acompañándote",
    ),
  ],
  [
    "informal imperative",
    informalImperative(
      "Escribe|Elige|Vuelve|Lee|Sube|Comparte|Recibe|Añade|Introduce|Accede|Sigue|Descubre|Haz|Ten|Pon|Sal|Di|Sé|Regístrate|Asegúrate|Ponte|Únete|Suscríbete|Contáctanos|Llámanos|Escríbenos",
    ),
  ],
];
/**
 * Strings that legitimately contain a marker. Pinned exactly, in the style of
 * `localeParse.test.ts`'s IDENTICAL_TO_EN_BY_DESIGN: adding a real *tú* fails,
 * and so does removing one of these without updating the pin. Empty today —
 * kept as the documented place to record an exception rather than the place to
 * widen a regex, because widening the regex silently forgives the next one too.
 */
const ALLOWED_INFORMAL: ReadonlyArray<string> = [];

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function flatten(value: Json, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => flatten(v, `${prefix}[${i}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      flatten(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

const es = JSON.parse(
  readFileSync(join(process.cwd(), "src/i18n/locales/es.json"), "utf8"),
) as Json;

const memberFacingStrings = flatten(es).filter(([key]) =>
  MEMBER_FACING.some((ns) => key === ns || key.startsWith(`${ns}.`) || key.startsWith(`${ns}[`)),
);

describe("es.json addresses the member as usted", () => {
  it("has member-facing strings to check at all", () => {
    // A rename of a namespace would otherwise turn every assertion below into a
    // vacuous pass over an empty list.
    expect(memberFacingStrings.length).toBeGreaterThan(1000);
  });

  it.each(INFORMAL_MARKERS)("uses no %s", (_label, pattern) => {
    const offenders = memberFacingStrings
      .filter(([key]) => !ALLOWED_INFORMAL.includes(key))
      .filter(([, value]) => pattern.test(value))
      .map(([key, value]) => `${key}: ${value}`);

    expect(offenders, "informal address in a string the member reads").toEqual([]);
  });

  it("keeps one register inside the How It Works phone call", () => {
    // The specific regression this file was written after: the operator spoke
    // to María as usted in step 5 and as tú in step 6, in the same call.
    const call = flatten(es).filter(([k]) => k.startsWith("howItWorksPage.step"));
    const quotes = call.filter(([k]) => /Quote$/.test(k));
    expect(quotes.length).toBeGreaterThanOrEqual(2);
    for (const [key, value] of quotes) {
      expect(INFORMAL_MARKERS.some(([, p]) => p.test(value)), key).toBe(
        false,
      );
    }
  });

  it("pins every allowed exception to a key that still exists", () => {
    const keys = new Set(flatten(es).map(([k]) => k));
    for (const key of ALLOWED_INFORMAL) {
      expect(keys.has(key), `stale pin: ${key}`).toBe(true);
    }
  });
});
