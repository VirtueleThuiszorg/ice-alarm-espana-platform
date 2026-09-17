/**
 * Provider-aware email transport (Lee, 2026-07-24 — built now, HELD until
 * domain cutover).
 *
 * `_shared/email.ts` is the single outbound transport for every
 * transactional function. It honours `email_settings.provider`:
 * "resend" → Resend API (RESEND_API_KEY, from_email on the verified
 * domain); anything else — including a failed settings lookup — falls
 * back to Gmail SMTP (the historical behaviour), so a settings hiccup can
 * never take down email that used to work.
 *
 * The inheritance pin is the point: every function below imports the
 * shared helper, so flipping the provider row cuts ALL of them over at
 * once — no per-function edits at go-live.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./helpers/stripComments";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const helper = read("supabase/functions/_shared/email.ts");

// Every transactional function that must inherit the provider switch.
const INHERITORS = [
  "auth-email-hook",
  "emergency-contact-notify",
  "gdpr-delete-member",
  "partner-admin-create",
  "partner-admin-invite",
  "partner-register",
  "partner-send-invite",
  "send-email",
  "send-member-update-request",
  "staff-send-invite",
  "submit-registration",
];

describe("provider selection honours email_settings", () => {
  it("reads provider/from fields from the email_settings singleton", () => {
    expect(helper).toMatch(/from\("email_settings"\)/);
    expect(helper).toMatch(/select\("provider, from_name, from_email, reply_to_email"\)/);
  });

  it("resend branch: fail-fast on missing key, from address from settings", () => {
    // `settings.provider`, not `settings?.provider`: null is now handled by an
    // explicit guard ABOVE this branch, so the optional chain would only serve to
    // hide whether that guard is still there.
    expect(helper).toMatch(/settings\.provider === "resend"/);
    expect(helper).not.toMatch(/settings\?\.provider === "resend"/);
    expect(helper).toMatch(/RESEND_API_KEY is not configured/);
    expect(helper).toMatch(/https:\/\/api\.resend\.com\/emails/);
    expect(helper).toMatch(/settings\.from_email \|\| "noreply@icealarm\.es"/);
  });

  it("gmail branch is byte-compatible with the historical transport", () => {
    expect(helper).toMatch(/GMAIL_APP_PASSWORD not configured/);
    expect(helper).toMatch(/smtp\.gmail\.com/);
    expect(helper).toMatch(/icealarmespana@gmail\.com/);
  });

  /*
    THIS BLOCK USED TO REQUIRE THE OPPOSITE, and the change of sides is the point.

    It was called "FAIL-SAFE: unknown provider or settings-lookup failure falls back
    to Gmail", and it pinned `return sendViaGmail(to, subject, html);` as the last
    line of the dispatcher. That was a fail-safe while Gmail worked.

    It is a dead end now. `GMAIL_APP_PASSWORD` is not set in production and never
    will be (go-live runbook, S4), so falling through routed every one of those
    cases into a transport that cannot send — and handed the caller
    "GMAIL_APP_PASSWORD not configured", an error about a secret nobody intends to
    set, for a lookup that had actually failed somewhere else entirely.

    Which is the exact shape of the complaint the runbook opens with: outbound email
    fails SILENTLY. A fall-through that leads everywhere to the same wrong sentence
    is how it stayed silent.
  */
  it("a settings-lookup failure REFUSES, and says it was the lookup", () => {
    expect(helper).toMatch(/if \(error \|\| !data\) return null;/);
    expect(helper).toMatch(/} catch {\s*\n\s*return null;/);
    // null settings no longer reach a transport at all.
    expect(helper).toMatch(/if \(!settings\) \{/);
    expect(helper).toMatch(/email_settings could not be read/);
  });

  it("gmail WITHOUT the password refuses, and names the fix rather than the secret", () => {
    // The error a human reads must point at provider = 'resend', not at a secret
    // that is deliberately never set.
    expect(helper).toMatch(/if \(!Deno\.env\.get\("GMAIL_APP_PASSWORD"\)\) \{/);
    expect(helper).toMatch(/set email_settings\.provider = 'resend'/);
  });

  it("gmail WITH the password still sends, so local development is unaffected", () => {
    // The absence of the secret is what distinguishes production from a laptop —
    // no new environment flag to keep in step with anything.
    expect(helper).toMatch(/return sendViaGmail\(to, subject, html\);/);
  });

  it("an unknown provider refuses and names it, rather than picking one", () => {
    expect(helper).toMatch(/unknown provider/);
    expect(helper).toMatch(/which is not a /);
  });

  it("every refusal is logged, or 'silently' is still true", () => {
    // A returned {success:false} is only as loud as the caller chooses to be, and
    // these callers wrap sends in try/catch. The console.error is what puts the
    // reason in the function logs where somebody debugging at 11pm will find it.
    const dispatcher = helper.slice(helper.indexOf("export async function sendEmail"));
    expect((dispatcher.match(/console\.error/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("public signature unchanged: sendEmail(to, subject, html) → {success, error?}", () => {
    expect(helper).toMatch(/export async function sendEmail\(\s*to: string,\s*subject: string,\s*html: string\s*\)/);
    expect(helper).toMatch(/Promise<\{ success: boolean; error\?: string \}>/);
  });

  it("never throws to callers — both branches catch and return {success:false}", () => {
    expect((helper.match(/success: false/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe("inheritance — one switch cuts every transactional function over", () => {
  it("every pinned function imports the shared helper", () => {
    for (const fn of INHERITORS) {
      const path = `supabase/functions/${fn}/index.ts`;
      expect(existsSync(join(ROOT, path)), `${fn} should exist`).toBe(true);
      expect(read(path), `${fn} must use _shared/email.ts`).toMatch(/_shared\/email\.ts['"]/);
    }
  });

  it("no function builds its own Gmail/nodemailer transport outside the helper", () => {
    // send-test-email keeps its pre-existing standalone Gmail test branch
    // (admin test button) — pinned; anything new must use the helper.
    const known = new Set([
      "supabase/functions/_shared/email.ts",
      "supabase/functions/send-test-email/index.ts",
    ]);
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".ts")) {
          const rel = p.replace(ROOT + "/", "");
          /*
            CODE, NOT THE PROSE ABOUT IT. This scanned raw source, so a COMMENT naming the
            specifier — "`post-payment.ts` reaches `email.ts`, which imports `npm:nodemailer`,
            which is why this type is declared separately" — was reported as a function building
            its own transport. Four files that send no email at all were offenders.

            The same lesson `absentAdminEvents.test.ts` already carries: an absence check that
            reads comments is an absence check that fires on somebody explaining the absence.
          */
          if (/npm:nodemailer|smtp\.gmail\.com/.test(stripComments(readFileSync(p, "utf8"))) && !known.has(rel)) {
            offenders.push(rel);
          }
        }
      }
    };
    walk(join(ROOT, "supabase/functions"));
    expect(offenders).toEqual([]);
  });

  it("KNOWN direct-Resend exceptions stay exactly these (shrink-only list)", () => {
    // send-email/send-test-email keep their own dual-provider UI plumbing;
    // partner-alert-notify calls Resend's REST API directly. A NEW function
    // doing its own Resend call fails here — new senders use the helper.
    const known = new Set([
      "supabase/functions/partner-alert-notify/index.ts",
      "supabase/functions/send-email/index.ts",
      "supabase/functions/send-test-email/index.ts",
      "supabase/functions/_shared/email.ts",
    ]);
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".ts")) {
          const rel = p.replace(ROOT + "/", "");
          if (/api\.resend\.com|npm:resend/.test(readFileSync(p, "utf8")) && !known.has(rel)) {
            offenders.push(rel);
          }
        }
      }
    };
    walk(join(ROOT, "supabase/functions"));
    expect(offenders).toEqual([]);
  });
});
