/**
 * auth-email-hook migration contracts (goal item 2, part 2 — 2026-07-24).
 *
 * ALL auth emails (signup confirmation, invite, magic link, password
 * recovery, email change, reauth code) go through this hook. It previously
 * depended on Lovable's platform (@lovable.dev/email-js sendLovableEmail,
 * @lovable.dev/webhooks-js verification, LOVABLE_API_KEY). These contracts
 * pin the migrated shape so auth email delivery can't silently regress
 * back onto dead infrastructure:
 *
 *  1. zero Lovable dependency;
 *  2. standard Supabase send-email-hook contract: standardwebhooks
 *     signature verification with SEND_EMAIL_HOOK_SECRET, fail-fast when
 *     unset, verify BEFORE trusting the payload;
 *  3. sends through the shared Gmail SMTP module used platform-wide;
 *  4. every auth action type still has a template + subject;
 *  5. anon-callable in config.toml (Supabase Auth posts without a JWT).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
// comment lines stripped: the doc header narrates the migration history and may
// name the removed packages; only functional code is held to the contracts
const hook = readFileSync(join(ROOT, "supabase/functions/auth-email-hook/index.ts"), "utf8")
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
  .join("\n");

describe("1 — Lovable fully removed from auth emails", () => {
  it("no @lovable.dev imports, no LOVABLE_API_KEY, no lovable URLs, no sendLovableEmail", () => {
    expect(hook).not.toMatch(/@lovable\.dev/);
    expect(hook).not.toMatch(/LOVABLE_API_KEY/);
    expect(hook).not.toMatch(/lovable\.app/);
    expect(hook).not.toMatch(/sendLovableEmail|verifyWebhookRequest/);
  });

  it("the Lovable preview endpoint is gone", () => {
    expect(hook).not.toMatch(/handlePreview|SAMPLE_PROJECT_URL/);
  });
});

describe("2 — standard Supabase send-email-hook contract", () => {
  it("verifies the standardwebhooks signature with SEND_EMAIL_HOOK_SECRET", () => {
    expect(hook).toMatch(/from 'npm:standardwebhooks/);
    expect(hook).toMatch(/SEND_EMAIL_HOOK_SECRET/);
    expect(hook).toMatch(/replace\('v1,whsec_', ''\)/);
    expect(hook).toMatch(/webhook-signature/);
  });

  it("fails fast (500) when the hook secret is unset — never sends unverified", () => {
    expect(hook).toMatch(/SEND_EMAIL_HOOK_SECRET is not configured/);
  });

  it("verification happens before the payload is used", () => {
    const verifyIdx = hook.indexOf("wh.verify(");
    const useIdx = hook.search(/email_data\??\.email_action_type/);
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(useIdx).toBeGreaterThan(verifyIdx);
  });

  it("rejects bad signatures with 401", () => {
    expect(hook).toMatch(/Invalid signature/);
    expect(hook).toMatch(/status: 401/);
  });
});

describe("3 — sends via the shared SMTP module", () => {
  it("imports sendEmail from _shared/email.ts and surfaces send failures as 500", () => {
    expect(hook).toMatch(/import \{ sendEmail \} from '\.\.\/_shared\/email\.ts'/);
    expect(hook).toMatch(/await sendEmail\(/);
    expect(hook).toMatch(/Failed to send email/);
  });

  it("builds the confirmation link on the auth verify endpoint with the token hash", () => {
    expect(hook).toMatch(/auth\/v1\/verify\?token=/);
    expect(hook).toMatch(/email_data\.token_hash/);
  });
});

describe("4 — every auth action type covered", () => {
  const ACTION_TYPES = [
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
    "email_change_current",
    "email_change_new",
    "reauthentication",
  ];

  it("template + subject exist for each action type", () => {
    for (const type of ACTION_TYPES) {
      expect(hook, `template mapping for ${type}`).toMatch(new RegExp(`${type}: \\w+Email`));
      expect(hook, `subject for ${type}`).toMatch(new RegExp(`${type}: ["']`));
    }
  });

  it("email_change_new goes to the NEW address", () => {
    expect(hook).toMatch(/email_change_new.*user\.new_email/);
  });
});

describe("5 — wiring", () => {
  it("anon-callable in config.toml (Supabase Auth posts without a JWT)", () => {
    const config = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
    expect(config).toMatch(/\[functions\.auth-email-hook\]\s*\n\s*verify_jwt = false/);
  });

  it("SEND_EMAIL_HOOK_SECRET is documented in .env.example", () => {
    const env = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(env).toMatch(/SEND_EMAIL_HOOK_SECRET/);
  });
});
