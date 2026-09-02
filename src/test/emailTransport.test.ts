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
  "partner-apply",
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
    expect(helper).toMatch(/settings\?\.provider === "resend"/);
    expect(helper).toMatch(/RESEND_API_KEY is not configured/);
    expect(helper).toMatch(/https:\/\/api\.resend\.com\/emails/);
    expect(helper).toMatch(/settings\.from_email \|\| "noreply@icealarm\.es"/);
  });

  it("gmail branch is byte-compatible with the historical transport", () => {
    expect(helper).toMatch(/GMAIL_APP_PASSWORD not configured/);
    expect(helper).toMatch(/smtp\.gmail\.com/);
    expect(helper).toMatch(/icealarmespana@gmail\.com/);
  });

  it("FAIL-SAFE: unknown provider or settings-lookup failure falls back to Gmail", () => {
    // getProviderSettings returns null on any error, and the dispatch only
    // routes to Resend on an explicit provider === "resend"
    expect(helper).toMatch(/if \(error \|\| !data\) return null;/);
    expect(helper).toMatch(/} catch {\s*\n\s*return null;/);
    expect(helper).toMatch(/return sendViaGmail\(to, subject, html\);/);
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
          if (/npm:nodemailer|smtp\.gmail\.com/.test(readFileSync(p, "utf8")) && !known.has(rel)) {
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
