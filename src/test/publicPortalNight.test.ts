/**
 * Public-portal night audit (2026-07-24) — source contracts.
 *
 * Pins the audited fixes so they can't silently regress:
 *  - JoinWizard: real isSubmitting busy state (double-click double-submit),
 *    payment-recovery path (a paying customer whose saved wizard data fails
 *    to parse must still land on the confirmation step), and the correct
 *    brand/currency in the Sync Hub sale label;
 *  - no LifeLink/£ branding anywhere in src (Spanish business, EUR);
 *  - JoinContactsStep tells the user which fields are missing instead of
 *    silently dropping the save;
 *  - JoinSummaryStep links the legal documents it asks the user to accept;
 *  - MemberUpdatePage uses theme tokens, not raw gray/red/amber/green;
 *  - LandingPage: no hardcoded "Nuestra Diferencia" language sniffing;
 *  - PendantPage: no fixture testimonials (LAUNCH_SCOPE §7 — no fake reviews).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("public portal night audit — source contracts", () => {
  it("JoinWizard has a real isSubmitting setter and toggles it around handleNext", () => {
    const src = read("src/pages/join/JoinWizard.tsx");
    expect(src).toMatch(/const \[isSubmitting, setIsSubmitting\] = useState\(false\)/);
    expect(src).toMatch(/setIsSubmitting\(true\)/);
    // released in finally so a saveDraft throw can't wedge the button
    expect(src).toMatch(/finally\s*\{\s*setIsSubmitting\(false\)/);
  });

  it("JoinWizard payment-recovery catch still confirms the paid customer (step 9)", () => {
    const src = read("src/pages/join/JoinWizard.tsx");
    const catchStart = src.indexOf('console.error("Failed to parse saved wizard data:", e);');
    expect(catchStart).toBeGreaterThan(-1);
    const block = src.slice(catchStart, catchStart + 600);
    expect(block).toMatch(/paymentComplete:\s*true/);
    expect(block).toMatch(/orderId:\s*orderNumber/);
    expect(block).toMatch(/setCurrentStep\(9\)/);
    expect(block).toMatch(/joinWizard\.paymentSuccessRecovered/);
  });

  it("no LifeLink branding or £ sterling anywhere in src (EUR business)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "test") continue;
          walk(p);
        } else if (/\.(ts|tsx|json)$/.test(name)) {
          const src = readFileSync(p, "utf8");
          if (src.includes("LifeLink") || src.includes("£")) {
            offenders.push(p.replace(ROOT + "/", ""));
          }
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders, "LifeLink/£ remnants — this is ICE Alarm España, in euros").toEqual([]);
  });

  it("JoinContactsStep surfaces missing required fields instead of a silent return", () => {
    const src = read("src/components/join/steps/JoinContactsStep.tsx");
    const guard = src.indexOf("!contactForm.contactName || !contactForm.relationship || !contactForm.phone");
    expect(guard).toBeGreaterThan(-1);
    const block = src.slice(guard, guard + 300);
    expect(block).toMatch(/toast\.error\(t\("joinWizard\.contactRequiredFields"/);
  });

  it("JoinSummaryStep links the terms and privacy documents from the accept checkboxes", () => {
    const src = read("src/components/join/steps/JoinSummaryStep.tsx");
    expect(src).toMatch(/<Link to="\/terms" target="_blank" className="underline">/);
    expect(src).toMatch(/<Link to="\/privacy" target="_blank" className="underline">/);
  });

  it("MemberUpdatePage uses theme tokens — no bg-gray-50 or raw status colors", () => {
    const src = read("src/pages/MemberUpdatePage.tsx");
    expect(src).not.toMatch(/bg-gray-50/);
    expect(src).not.toMatch(/text-(red|amber|green)-500/);
    expect(src).toMatch(/text-destructive/);
    expect(src).toMatch(/text-alert-battery/);
    expect(src).toMatch(/text-alert-resolved/);
  });

  it("LandingPage translates 'Our Difference' — no hardcoded Nuestra Diferencia sniffing", () => {
    const src = read("src/pages/LandingPage.tsx");
    expect(src).not.toMatch(/Nuestra Diferencia/);
    expect(src).not.toMatch(/\.includes\("Protecting"\)/);
    expect(src).toMatch(/t\("landing\.ourDifference"/);
  });

  it("PendantPage has no fixture testimonials — DB-sourced only", () => {
    const src = read("src/pages/PendantPage.tsx");
    expect(src).not.toMatch(/fb-1/);
    expect(src).not.toMatch(/pendant\.testimonials\.quote1/);
    // and the section is gated on real data
    expect(src).toMatch(/\{testimonials\.length > 0 &&/);
  });
});
