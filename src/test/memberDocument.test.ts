import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BRAND_INK,
  BRAND_RED,
  HEARTBEAT_PATH,
  SHIELD_PATH,
  brandMarkSvg,
} from "@/lib/brandMark";
import {
  EMPTY_VALUE,
  MEMBER_DOCUMENT_PRINT_CSS,
  documentInitials,
  documentPhone,
  memberDocumentAsPrintHtml,
  memberDocumentAsText,
  type MemberDocument,
} from "@/lib/memberDocument";

/**
 * THE PRINTED MEMBER RECORD, ASSERTED WITHOUT A BROWSER.
 *
 * The photographs are in `e2e/memberDocumentVisual.spec.ts` — a picture is the only honest proof
 * that a document LOOKS like a document. This file proves the things a picture cannot be trusted
 * on: that a member called `O'Brien & Sons <Ltd>` is not markup, that the confidentiality notice
 * is on every rendering rather than only the one somebody looked at, that the red rule is a
 * border and not a fill, and that the mark in the printed masthead is the SAME shield the app
 * draws on screen.
 */

const doc: MemberDocument = {
  title: "Member record",
  subject: {
    name: "David Evans",
    initials: "DE",
    memberNumber: "ICE-000431",
    status: "Active",
  },
  factCount: "21 details on file",
  meta: "Printed by Carmen Nicolás on 14 September 2026, 15:04 · icealarm.es",
  company: {
    name: "ICE Alarm España",
    phone: "+34 950 473 199",
    email: "info@icealarm.es",
    address: "Calle Principal 1, Albox, 04800 Almería",
  },
  confidentiality: [
    "Confidential — personal data of a member of ICE Alarm España. Destroy securely when no longer needed.",
    "Confidencial — datos personales de un socio de ICE Alarm España. Destrúyalo de forma segura cuando ya no sea necesario.",
    "Vertrouwelijk — persoonsgegevens van een lid van ICE Alarm España. Vernietig dit veilig wanneer het niet langer nodig is.",
  ],
  sections: [
    {
      key: "identity",
      title: "Identity",
      fields: [
        { label: "Name", value: "David Evans" },
        { label: "Date of birth", value: "12 April 1948" },
      ],
    },
    {
      key: "address",
      title: "Address",
      fields: [
        { label: "Address", value: "Calle Mayor 14" },
        { label: "Access notes", value: "Key safe left of the gate.\nDog in the yard.", note: true },
      ],
    },
  ],
};

describe("the printed document carries what a filed sheet has to carry", () => {
  const html = memberDocumentAsPrintHtml(doc);

  it("names the company in the masthead, as text a reader can see", () => {
    expect(html).toContain("ICE Alarm <span>España</span>");
  });

  it("inlines the brand mark rather than linking an asset the print frame cannot fetch", () => {
    // A `<img src="/icon.svg">` in a document written with document.write either 404s or races
    // the print dialog and prints blank. The path itself must be in the string.
    expect(html).toContain(SHIELD_PATH);
    expect(html).toContain(HEARTBEAT_PATH);
    expect(html).not.toContain("icon.svg");
    expect(html).not.toContain("<img src=\"/");
  });

  it("says what the document is, whose it is, and how much of a record it is", () => {
    expect(html).toContain("Member record");
    expect(html).toContain("David Evans");
    expect(html).toContain("21 details on file");
    expect(html).toContain("ICE-000431");
    expect(html).toContain("Active");
  });

  it("says who printed it and when — a filed sheet with no date is not evidence of anything", () => {
    expect(html).toContain("Printed by Carmen Nicolás on 14 September 2026, 15:04");
    expect(html).toContain("icealarm.es");
  });

  it("carries the confidentiality notice in all three languages", () => {
    expect(html).toContain("Destroy securely when no longer needed");
    expect(html).toContain("Destrúyalo de forma segura");
    expect(html).toContain("Vernietig dit veilig");
  });

  it("carries the company's contact details from settings, not from a literal in this file", () => {
    expect(html).toContain("+34 950 473 199");
    expect(html).toContain("info@icealarm.es");
    expect(html).toContain("Calle Principal 1, Albox, 04800 Almería");
  });

  it("omits the phone line entirely when settings hold no emergency number", () => {
    // `useCompanySettings` returns null rather than inventing a number. A document that printed
    // an empty separator, or worse a placeholder, would send somebody to dial nothing.
    const html = memberDocumentAsPrintHtml({ ...doc, company: { ...doc.company, phone: null } });
    expect(html).not.toContain("· ·");
    expect(html).toContain("ICE Alarm España · info@icealarm.es");
  });

  it("gives long free text its own full-width box rather than a squeezed value column", () => {
    expect(html).toContain('<div class="doc-note"><b>Access notes</b>');
    expect(html).toContain("Key safe left of the gate.");
  });
});

describe("a member's own text is never markup", () => {
  it("escapes the five characters that could open a tag or close an attribute", () => {
    const html = memberDocumentAsPrintHtml({
      ...doc,
      subject: { ...doc.subject, name: `O'Brien & Sons <Ltd>` },
      sections: [
        {
          key: "identity",
          title: "Identity",
          fields: [{ label: 'The "label"', value: "<script>alert(1)</script>" }],
        },
      ],
    });
    expect(html).toContain("O&#39;Brien &amp; Sons &lt;Ltd&gt;");
    expect(html).toContain("The &quot;label&quot;");
    expect(html).not.toContain("<script>");
  });

  it("escapes a photo URL before it becomes an attribute", () => {
    const html = memberDocumentAsPrintHtml({
      ...doc,
      subject: { ...doc.subject, photoUrl: `https://x/p.jpg" onerror="alert(1)` },
    });
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&quot; onerror=&quot;");
  });
});

describe("the print rules are the ones a printed page needs", () => {
  it("is A4 with the brief's 18mm margins", () => {
    expect(MEMBER_DOCUMENT_PRINT_CSS).toContain("size:A4");
    expect(MEMBER_DOCUMENT_PRINT_CSS).toContain("margin:18mm");
  });

  it("refuses to split a section across a page, in both the old and the new property", () => {
    // Half a medical record on the next sheet is how the second half gets lost. Older print
    // engines only read `page-break-inside`.
    expect(MEMBER_DOCUMENT_PRINT_CSS).toContain("page-break-inside:avoid");
    expect(MEMBER_DOCUMENT_PRINT_CSS).toContain("break-inside:avoid");
  });

  it("repeats the footer on every page with a fixed element, not only an @page margin box", () => {
    // Chrome does not implement @page margin boxes; a design that relied on them would print
    // the notice on page one and nowhere else.
    expect(MEMBER_DOCUMENT_PRINT_CSS).toMatch(/\.doc-footer\{position:fixed/);
    expect(MEMBER_DOCUMENT_PRINT_CSS).toContain("counter(page)");
  });

  it("leaves room at the foot of the page so the fixed footer never lands on the text", () => {
    expect(MEMBER_DOCUMENT_PRINT_CSS).toMatch(/padding:0 0 22mm/);
  });

  it("uses brand red ONCE, as a rule beside the caption — never as a fill (R1/R2)", () => {
    const reds = MEMBER_DOCUMENT_PRINT_CSS.match(new RegExp(BRAND_RED, "gi")) ?? [];
    expect(reds).toHaveLength(1);
    expect(MEMBER_DOCUMENT_PRINT_CSS).toContain(`border-left:3px solid ${BRAND_RED}`);
  });

  it("has no background fills at all, so the sheet survives a mono laser and wastes no ink", () => {
    expect(MEMBER_DOCUMENT_PRINT_CSS).not.toMatch(/background(-color)?\s*:/);
  });
});

describe("the mark and the palette are the app's, not a second set", () => {
  it("draws the same two paths the Logo component draws", () => {
    const logo = fs.readFileSync(
      path.join(process.cwd(), "src/components/ui/logo.tsx"),
      "utf8",
    );
    expect(logo).toContain('from "@/lib/brandMark"');
    expect(logo).not.toContain("M50 7 L87 21");
  });

  it("is the same ICE Red and Ink as :root, written in the only form a print document reads", () => {
    // hsl(350 85% 42%) === #C8102E, hsl(218 22% 10%) === #14181F. The print document has no
    // Tailwind and no :root to resolve `hsl(var(--primary))` against, so it needs hex — but it
    // must be THIS hex.
    const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
    expect(css).toContain("--primary: 350 85% 42%");
    expect(css).toContain("--brand-ink: 218 22% 10%");
    expect(BRAND_RED.toUpperCase()).toBe("#C8102E");
    expect(BRAND_INK.toUpperCase()).toBe("#14181F");
  });

  it("marks the printed shield aria-hidden — the wordmark beside it already says the name", () => {
    expect(brandMarkSvg({ size: 34 })).toContain('aria-hidden="true"');
  });
});

describe("the small readability decisions", () => {
  it("takes two initials from the ends of a name, not one per word", () => {
    expect(documentInitials("Ana María Alpha")).toBe("AA");
    expect(documentInitials("David Evans")).toBe("DE");
    expect(documentInitials("Cher")).toBe("C");
    expect(documentInitials("   ")).toBe("");
  });

  it("groups a Spanish number so it can be read down a line", () => {
    expect(documentPhone("+34600000001")).toBe("+34 600 000 001");
    expect(documentPhone("950473199")).toBe("950 473 199");
    expect(documentPhone("0034950473199")).toBe("+34 950 473 199");
  });

  it("leaves a number it cannot group alone rather than grouping it wrongly", () => {
    // A misgrouped number read aloud to somebody dialling is worse than an ungrouped one.
    expect(documentPhone("+44 7700 900123")).toBe("+44 7700 900123");
    expect(documentPhone("600 000 001 ext 4")).toBe("600 000 001 ext 4");
  });

  it("prints an em dash under a heading only when that section has been emptied", () => {
    const html = memberDocumentAsPrintHtml({
      ...doc,
      sections: [{ key: "medical", title: "Medical", fields: [] }],
    });
    expect(html).toContain(EMPTY_VALUE);
    const text = memberDocumentAsText({
      ...doc,
      sections: [{ key: "medical", title: "Medical", fields: [] }],
    });
    expect(text).toContain(`MEDICAL\n  ${EMPTY_VALUE}`);
  });
});

describe("the clipboard copy is the same document", () => {
  const text = memberDocumentAsText(doc);

  it("opens with who it is about and what it is", () => {
    expect(text.startsWith("David Evans — Member record\n===")).toBe(true);
  });

  it("carries the printed-by line", () => {
    expect(text).toContain("Printed by Carmen Nicolás on 14 September 2026, 15:04");
  });

  it("ends with the company block and the confidentiality notice", () => {
    // A pasted record that has lost the notice is the copy most likely to end up somewhere it
    // should not.
    expect(text).toContain("ICE Alarm España · +34 950 473 199 · info@icealarm.es");
    expect(text.trimEnd().endsWith("Vernietig dit veilig wanneer het niet langer nodig is.")).toBe(
      true,
    );
  });

  it("lists every section and every field, with no HTML in it", () => {
    expect(text).toContain("IDENTITY\n  Name: David Evans");
    expect(text).toContain("Access notes: Key safe left of the gate.");
    expect(text).not.toContain("<");
  });
});
