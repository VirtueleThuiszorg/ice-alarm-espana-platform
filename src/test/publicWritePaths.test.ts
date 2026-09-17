import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

/**
 * NO PUBLIC PAGE WRITES A TABLE DIRECTLY.
 *
 * The defect was not one form. It was a shape: a page that inserts with the anon key, validated
 * only by `required` attributes that exist in a visitor's browser and nowhere at all for a script
 * POSTing to the REST endpoint. Fixing the contact form and leaving the shape available would
 * mean the next public form is written the same way — the second one always is.
 *
 * So this file guards the SHAPE on the CLIENT side: the pages that would make such a write, and
 * the refusal handling that makes routing them through a function an improvement rather than a
 * form that fails more often.
 *
 * THE OTHER HALF — that the `WITH CHECK (true)` anon INSERT policies are actually revoked in the
 * schema — is deliberately NOT here, and the order is the reason. Revoking them before this
 * change is deployed takes the live contact form down; the policies go in the migration that
 * follows this, and the replay that proves it goes with them.
 */

describe("no public page writes a table from the browser", () => {
  /** Pages and components a visitor reaches without signing in. */
  const PUBLIC_SOURCES = [
    "src/pages/ContactPage.tsx",
    "src/components/products/NotifyInterestDialog.tsx",
  ];

  it.each(PUBLIC_SOURCES)("%s inserts nothing directly", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\.from\(["'][a-z_]+["']\)[\s\S]{0,80}\.insert\(/);
  });

  it("the contact form goes through public-submit and sends the honeypot", () => {
    const src = read("src/pages/ContactPage.tsx");
    expect(src).toContain('invoke("public-submit"');
    expect(src).toContain('form: "contact"');
    // The hidden field, named `company` so a script filling every input finds it.
    expect(src).toContain("company,");
    expect(src).toMatch(/data-testid="contact-honeypot"/);
  });

  it("the honeypot is hidden from a screen reader as well as from the eye", () => {
    /*
      A trap that catches assistive technology is not a trap, it is a barrier: a screen-reader
      user would be asked for a company name that must be left blank, with no way to know that.
    */
    const src = read("src/pages/ContactPage.tsx");
    const block = src.slice(src.indexOf('data-testid="contact-honeypot"') - 600);
    expect(block).toContain('aria-hidden="true"');
    expect(block).toContain("tabIndex={-1}");
  });

  it("the Notify Me box goes through it too, with its own honeypot", () => {
    const src = read("src/components/products/NotifyInterestDialog.tsx");
    expect(src).toContain('invoke("public-submit"');
    expect(src).toContain('form: "product_interest"');
    expect(src).toMatch(/data-testid="notify-honeypot"/);
  });

  it("a refusal marks the boxes rather than saying 'something went wrong'", () => {
    // A form that highlights nothing makes somebody re-read seven fields to find the one, and on
    // a site read mostly by people in their seventies and eighties that is where they give up.
    const src = read("src/pages/ContactPage.tsx");
    expect(src).toContain("readPublicSubmitRefusal");
    expect(src).toContain("setBadFields");
    expect(src).toMatch(/aria-invalid/);
  });
});

describe("the function is registered as anonymous, on purpose", () => {
  it("verify_jwt is false for public-submit, with the reason beside it", () => {
    const toml = read("supabase/config.toml");
    const block = toml.slice(toml.indexOf("[functions.public-submit]"));
    expect(block.slice(0, 120)).toMatch(/verify_jwt = false/);
    // The comment above it is what stops this reading as an oversight to somebody tidying up.
    const before = toml.slice(0, toml.indexOf("[functions.public-submit]"));
    expect(before.slice(-400)).toMatch(/honeypot|limit/i);
  });
});
