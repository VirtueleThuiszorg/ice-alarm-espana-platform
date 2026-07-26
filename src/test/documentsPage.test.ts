/**
 * Staff Documents — the operator-facing library (call-centre → Documents).
 *
 * Audit 2026-07-26 found three defects on this page while the admin side was
 * fine: procedures were rendered by replacing newlines with <br/>, so staff
 * read raw markdown (## headings, **asterisks**, ASCII tables); the query had
 * no language filter, so every procedure appeared twice (en + es rows); and
 * the Dutch page chrome was untranslated English.
 *
 * The operator/internal boundary is `visibility`: a document reaches this page
 * only if 'staff' is in its visibility array. Internal or engineering notes
 * are visibility ['admin'] and are excluded by the query AND by the RLS policy
 * ("Staff can view staff-visible docs"). These pins keep that true.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const page = read("src/pages/call-centre/DocumentsPage.tsx");
const hook = read("src/hooks/useDocumentation.ts");
const support = read("src/pages/client/SupportPage.tsx");

describe("operator boundary — internal docs never reach call-centre staff", () => {
  it("the page asks only for staff-visible, published documents", () => {
    expect(page).toMatch(/visibility: 'staff'/);
    expect(page).toMatch(/status: 'published'/);
  });

  it("the visibility filter is a containment check on the array, not a guess", () => {
    expect(hook).toMatch(/\.contains\('visibility', \[filters\.visibility\]\)/);
  });

  it("the page never widens the query to admin-visible material", () => {
    expect(page).not.toMatch(/visibility: '?admin/);
    // and never bypasses the hook with its own unfiltered table read
    expect(page).not.toMatch(/from\(['"]documentation['"]\)/);
  });
});

describe("procedures are readable", () => {
  it("markdown is rendered, not injected as raw HTML", () => {
    expect(page).toMatch(/<ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}>/);
    expect(page).not.toMatch(/dangerouslySetInnerHTML/);
    // the specific bug: newline-to-<br/> substitution left ## and ** on screen
    expect(page).not.toMatch(/replace\(\/\\n\/g, '<br\/>'\)/);
  });

  it("the member knowledge base renders markdown too (same content, same fix)", () => {
    expect(support).not.toMatch(/dangerouslySetInnerHTML/);
    expect(support).toMatch(/ReactMarkdown/);
  });
});

describe("one language at a time", () => {
  it("the query is language-scoped, so procedures are not listed twice", () => {
    expect(page).toMatch(/language: docLanguage/);
    expect(page).toMatch(/i18n\.language\?\.startsWith\("es"\) \? "es" : "en"/);
  });

  it("a Dutch operator is told they are reading the English copy", () => {
    // documentation.language is CHECK-constrained to en|es, so nl has no rows
    expect(page).toMatch(/showingFallbackLanguage/);
    expect(page).toMatch(/staffDocuments\.languageFallback/);
  });

  it("the page chrome exists in all three locales", () => {
    const keys = [
      "title",
      "subtitle",
      "searchPlaceholder",
      "important",
      "noDocuments",
      "noDocumentsDesc",
      "languageFallback",
    ];
    const en = JSON.parse(read("src/i18n/locales/en.json")).staffDocuments;
    for (const locale of ["en", "es", "nl"]) {
      const ns = JSON.parse(read(`src/i18n/locales/${locale}.json`)).staffDocuments;
      expect(ns, `${locale} needs staffDocuments`).toBeDefined();
      for (const key of keys) {
        expect(ns[key], `${locale}.staffDocuments.${key}`).toBeTruthy();
        if (locale !== "en") {
          expect(ns[key], `${locale}.staffDocuments.${key} is still English`).not.toBe(en[key]);
        }
      }
      for (const cat of ["general", "memberGuide", "staff", "device", "emergency", "partner"]) {
        expect(ns.categories?.[cat], `${locale}.staffDocuments.categories.${cat}`).toBeTruthy();
      }
    }
  });
});

describe("admin-side CRUD is present (the operator page is read-only by design)", () => {
  it("create, update and delete mutations all exist", () => {
    for (const fn of ["useCreateDocument", "useUpdateDocument", "useDeleteDocument"]) {
      expect(hook).toMatch(new RegExp(`export function ${fn}`));
    }
  });

  it("the admin tab wires view, edit, delete, print and download", () => {
    const tab = read("src/components/admin/settings/DocumentationSettingsTab.tsx");
    for (const action of ["handleView", "handleEdit", "handleDeleteClick", "printDocument", "downloadMarkdown"]) {
      expect(tab, `admin tab must wire ${action}`).toMatch(new RegExp(action));
    }
  });
});
