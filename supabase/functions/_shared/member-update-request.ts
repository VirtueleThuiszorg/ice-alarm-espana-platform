/**
 * ASKING A MEMBER FOR WHAT WE ARE MISSING — the link, and the two messages that carry it.
 *
 * WHAT WAS WRONG. `send-member-update-request` created a one-shot token, emailed it, and — if
 * the email failed — THREW. The token existed, the link worked, and the staff member was told
 * the whole thing had failed, with no way to reach the link that had just been minted. It also
 * never returned the URL on success, so there was nothing to read out over the phone to a
 * member who does not use email, which is a large share of the people this product is for.
 *
 * SO THE LINK IS THE RESULT, and delivery is a set of named outcomes beside it — the same
 * shape `send-payment-link` already uses, sharing the same channel planner (`delivery.ts`).
 *
 * Pure and dependency-free so it is unit-testable under vitest: the Deno function cannot be
 * imported there (same pattern as member-update-outcome.ts).
 */

/** Seven days, as it has always been. Named once so the function and its tests cannot disagree. */
export const UPDATE_TOKEN_TTL_DAYS = 7;

export function updateTokenExpiry(now: Date): Date {
  const expires = new Date(now.getTime());
  expires.setDate(expires.getDate() + UPDATE_TOKEN_TTL_DAYS);
  return expires;
}

/**
 * The link.
 *
 * A trailing slash on `SITE_URL` used to produce `https://icealarm.es//member-update?token=…`,
 * which most hosts serve and some redirect — and a redirect drops the query string on exactly
 * the setups that matter least often and hurt most.
 */
export function buildUpdateLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/member-update?token=${encodeURIComponent(token)}`;
}

export type UpdateLanguage = "en" | "es" | "nl";

export function updateLanguage(value: string | null | undefined): UpdateLanguage {
  return value === "es" || value === "nl" ? value : "en";
}

export interface UpdateMessageInput {
  memberName: string;
  url: string;
  language: UpdateLanguage;
}

/**
 * The SMS. One message, no shortener, no tracking parameters.
 *
 * Kept under 320 characters (two GSM segments) INCLUDING the URL — a third segment costs money
 * for nothing. Asserted in the tests rather than trusted.
 */
export function memberUpdateSms(input: UpdateMessageInput): string {
  const name = input.memberName.trim();
  switch (input.language) {
    case "es":
      return `ICE Alarm España: hola ${name}, nos faltan algunos datos suyos. Complételos aquí (7 días): ${input.url}`;
    case "nl":
      return `ICE Alarm España: hallo ${name}, we missen enkele gegevens van u. Vul ze hier aan (7 dagen): ${input.url}`;
    default:
      return `ICE Alarm España: hello ${name}, we are missing some of your details. Please add them here (7 days): ${input.url}`;
  }
}

/** A member's name is something somebody typed. It is not markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface UpdateEmail {
  subject: string;
  html: string;
}

/**
 * The email, bilingual as before: the member's own language first, English second (or Spanish
 * second for an English speaker). Older members here read one of the two and hand the message
 * to a relative who reads the other.
 *
 * THE URL IS PRINTED AS TEXT AS WELL AS LINKED. Mail clients on the phones this lands on strip
 * buttons, and "click the button" with no button is a dead end for the person least able to
 * ring us about it.
 */
export function memberUpdateEmail(input: UpdateMessageInput): UpdateEmail {
  const name = escapeHtml(input.memberName.trim());
  const url = input.url;
  const safeUrl = escapeHtml(url);
  const es = input.language === "es";

  const copy = {
    es: {
      subject: "Por favor actualice su información - ICE Alarm España",
      greeting: `Hola ${name},`,
      body:
        "Necesitamos algunos datos más para poder asistirle mejor en caso de emergencia. " +
        "Por favor use el enlace de abajo para completarlos.",
      button: "Actualizar mis datos",
      expiry: `Este enlace caduca en ${UPDATE_TOKEN_TTL_DAYS} días y solo puede usarse una vez.`,
      ignore: "Si no esperaba este mensaje, por favor ignórelo o llámenos.",
    },
    en: {
      subject: "Please update your information - ICE Alarm España",
      greeting: `Hello ${name},`,
      body:
        "We need a few more details so we can look after you properly in an emergency. " +
        "Please use the link below to add them.",
      button: "Update my details",
      expiry: `This link expires in ${UPDATE_TOKEN_TTL_DAYS} days and can only be used once.`,
      ignore: "If you were not expecting this, please ignore it or call us.",
    },
  };

  const first = es ? copy.es : copy.en;
  const second = es ? copy.en : copy.es;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; font-size: 16px; }
  .header { background: #C8102E; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
  .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
  .button { display: inline-block; background: #C8102E; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
  .plain { word-break: break-all; font-size: 14px; color: #374151; }
  .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; }
  .divider { border-top: 1px dashed #d1d5db; margin: 24px 0; }
</style>
</head>
<body>
  <div class="header"><h1 style="margin:0;">ICE Alarm España</h1></div>
  <div class="content">
    <h2>${first.greeting}</h2>
    <p>${first.body}</p>
    <div style="text-align:center;"><a href="${safeUrl}" class="button">${first.button}</a></div>
    <p class="plain">${safeUrl}</p>
    <p style="font-size:14px;color:#6b7280;">${first.expiry}</p>
    <div class="divider"></div>
    <h3>${second.greeting}</h3>
    <p>${second.body}</p>
    <p style="font-size:14px;color:#6b7280;">${second.expiry}</p>
    <div class="footer">
      <p>ICE Alarm España</p>
      <p>${first.ignore}</p>
    </div>
  </div>
</body>
</html>`;

  return { subject: first.subject, html };
}
