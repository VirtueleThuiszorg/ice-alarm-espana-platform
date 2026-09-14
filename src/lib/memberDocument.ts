import { BRAND_INK, BRAND_RED, brandMarkSvg } from "@/lib/brandMark";

/**
 * ONE TEMPLATE FOR THE MEMBER RECORD — the same document on screen and on paper.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * Two surfaces already print a member's record: the staff Overview dialog and the member's own
 * "Review my details". Both produced an unbranded sheet — a bare `<h1>`, a grey rule, a grid of
 * dashes — that a member's daughter would put in front of a consultant, or a carer would file in
 * a folder, with nothing on it saying which company holds this data, how to reach us, or that it
 * is confidential. Printed out it read as a browser dump of a database row.
 *
 * They were also drifting apart: the staff sheet's print HTML lived in `memberOverview.ts` and
 * the member's own sheet was `window.print()` over the dialog with `@media print` rules. Two
 * implementations of the same document is how one of them gets the confidentiality footer and
 * the other does not.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 *
 * A DOCUMENT MODEL and two renderers over it. `MemberDocument` is what a member record IS —
 * header, member strip, sections of fields, company block, confidentiality. `memberDocumentAsPrintHtml`
 * renders it to a standalone HTML document; `memberDocumentAsText` renders it for the clipboard.
 * The React dialogs render the SAME model on screen, so the three cannot disagree about what is
 * on the sheet.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * NOT A DATA SOURCE. It decides nothing about which fields a member has. `buildMemberOverview`
 * still assembles the staff sheet and the portal dialog still assembles its own (narrower) one;
 * both hand the result here. Fields we do not hold are still left out upstream, and this module
 * never invents a row.
 *
 * ── THE RULES IT ENCODES ────────────────────────────────────────────────────
 *
 * MEMBER_UX_RULES R1/R2: brand red appears ONCE PER SECTION, as a 3px rule left of the caption.
 * Never as a fill behind text, never on a status, never twice. A printed sheet washed in red
 * would also be the most expensive thing this product prints.
 *
 * GREYSCALE SURVIVES. Every structural cue is a BORDER, not a background: a red rule prints as a
 * dark line on a mono laser, and a member's local print shop is a mono laser. Backgrounds are
 * dropped by browsers' default "don't print backgrounds" behaviour anyway, so a design that
 * needs them is a design that arrives blank.
 */

/** One label/value line. `note: true` gives free text its own full-width bordered box. */
export interface DocumentField {
  label: string;
  value: string;
  /**
   * Long free text — access notes, availability, anything somebody typed a paragraph into.
   * A paragraph squeezed into the value column of a two-column grid wraps to eight short lines
   * and is unreadable; it gets the full width and a border instead.
   */
  note?: boolean;
}

export interface DocumentSection {
  key: string;
  title: string;
  fields: DocumentField[];
}

/** The company block, from `system_settings` — never hard-coded. See `useCompanySettings`. */
export interface DocumentCompany {
  name: string;
  /** NULL when `settings_emergency_phone` is unset; the block then omits the line entirely. */
  phone: string | null;
  email: string;
  address: string;
}

/** The member strip under the masthead: who this document is about. */
export interface DocumentSubject {
  name: string;
  /** Two letters for the avatar when there is no photo. */
  initials: string;
  photoUrl?: string | null;
  /** Omitted from the strip when we do not hold one. */
  memberNumber?: string | null;
  /** Humanised via `statusLabel.ts` — never a raw enum on a document somebody files. */
  status?: string | null;
}

export interface MemberDocument {
  /** "Member record" / "Ficha del socio" / "Ledendossier", already translated by the caller. */
  title: string;
  subject: DocumentSubject;
  /** "21 details on file" — how much of a record this is, in the caller's language. */
  factCount: string;
  /** "Printed by Carmen Nicolás on 14 September 2026, 15:04 · icealarm.es" */
  meta: string;
  company: DocumentCompany;
  /**
   * The confidentiality notice, one line per language. All three print: a sheet about a Spanish
   * member of a Dutch-owned company, read by a British family, has no single right language, and
   * the line is three short sentences rather than a page.
   */
  confidentiality: readonly string[];
  sections: readonly DocumentSection[];
}

/**
 * THE CONFIDENTIALITY NOTICE — three languages, always all three.
 *
 * Not translated by the reader's language, because the reader who most needs it is whoever finds
 * the sheet LATER: the cleaner who empties the bin, the receptionist who files it, the relative
 * who clears the flat. None of them were in the conversation that set the language, and a sheet
 * about a Spanish member of a Dutch-owned company held by a British family has no single right
 * one. Three short lines are cheaper than being wrong about which.
 *
 * Literals rather than i18n keys for the same reason: `t()` returns ONE language.
 */
export const MEMBER_DOCUMENT_CONFIDENTIALITY: readonly string[] = [
  "Confidential — personal data of a member of ICE Alarm España. Destroy securely when no longer needed.",
  "Confidencial — datos personales de un socio de ICE Alarm España. Destrúyalo de forma segura cuando ya no sea necesario.",
  "Vertrouwelijk — persoonsgegevens van een lid van ICE Alarm España. Vernietig dit veilig wanneer het niet langer nodig is.",
];

/** The em dash a lone empty section gets. A heading over blank paper reads as a printing fault. */
export const EMPTY_VALUE = "—";

/**
 * Initials for the avatar. Two letters from the first and last word — "Ana María Alpha" is AA,
 * not AMA, because the avatar is a 40px circle.
 */
export function documentInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * A phone number somebody can read aloud down a line.
 *
 * `+34600000001` is twelve digits nobody can dictate; `+34 600 000 001` is four chunks. Spanish
 * mobile and landline numbers are both 9 digits after +34, grouped 3-3-3. Anything else — a UK
 * number a family member left, a number with extensions — is returned untouched rather than
 * grouped wrongly: a misgrouped number read aloud is worse than an ungrouped one.
 */
export function documentPhone(phone: string): string {
  const trimmed = phone.trim();
  const spanish = trimmed.replace(/[\s.-]/g, "").match(/^(\+34|0034)?(\d{9})$/);
  if (!spanish) return trimmed;
  const [, prefix, digits] = spanish;
  const grouped = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return prefix ? `+34 ${grouped}` : grouped;
}

/**
 * Escaped for the print document. A member called `O'Brien & Sons <Ltd>` is not markup, and an
 * access-notes field is free text somebody typed — neither may become tags in the printout.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A section with no fields still prints its heading and one em dash.
 *
 * Upstream drops empty sections, so this is reached only when a caller has deliberately kept a
 * heading — the portal's whitelist can empty a section by removing every staff-only line in it.
 * A heading followed by nothing looks like the printer ran out; a heading followed by "—" says
 * we hold nothing under it, which is the honest answer to the question the sheet exists to ask.
 */
function fieldsOf(section: DocumentSection): DocumentField[] {
  return section.fields.length > 0 ? section.fields : [{ label: "", value: EMPTY_VALUE }];
}

/** The document's stylesheet. Exported so a test can assert the print rules without a browser. */
/**
 * A string safe to put inside a CSS `content: "…"`.
 *
 * The strip carries the company name, which comes from `system_settings` — somebody's input. A
 * stray quote would end the declaration and take the rest of the stylesheet with it, so quotes
 * and backslashes are escaped and newlines are dropped (a margin box is one line by nature).
 */
function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}

/**
 * The page rule, built per document because the strip in its margin names the company.
 *
 * ── WHY A MARGIN BOX AND NOT `position: fixed` ──────────────────────────────
 *
 * The brief asked for a fixed footer. It was built that way, printed, and the PDF is what
 * changed it: in Chrome's print engine a fixed element is painted at the same offset on EVERY
 * sheet while the text flows on underneath it, so the notice printed straight across the middle
 * of the Emergency contacts section on page two. Widening the page's bottom margin and pulling
 * the footer down into it with a negative offset moved the overlap rather than removing it.
 * Both were rendered to PDF and looked at; neither was reasoned about and assumed.
 *
 * A page margin box cannot overlap the text, because a margin is by definition the part of the
 * page text never enters. Chrome honours `@bottom-left` / `@bottom-right` — which is why the
 * page counter here is stated plainly rather than hedged as "where supported". What Chrome does
 * NOT honour is a multi-line `content`: `\A` prints as a literal glyph. So the repeating strip
 * is ONE line, and the full three-language notice is an ordinary block at the end of the
 * document.
 *
 * That split is the better document anyway. Every loose sheet is marked confidential and
 * numbered, which is what matters when one page is left on a desk; and the full notice appears
 * once, where a reader finishes, rather than four lines deep on every page.
 */
export function memberDocumentPageRule(strip: string): string {
  return (
    `@page{size:A4;margin:18mm 18mm 26mm;` +
    `@bottom-left{content:"${escapeCssString(strip)}";font:8pt system-ui,sans-serif;color:#5A6470;vertical-align:top}` +
    `@bottom-right{content:counter(page) " / " counter(pages);font:8pt system-ui,sans-serif;color:#5A6470;vertical-align:top}` +
    `}`
  );
}

/** The document's stylesheet, minus the per-document `@page` rule above. */
export const MEMBER_DOCUMENT_PRINT_CSS = `
*{box-sizing:border-box}

body{
  font:11pt/1.5 "Archivo",system-ui,-apple-system,"Segoe UI",sans-serif;
  color:${BRAND_INK};
  margin:0;
  padding:0;
}

/* ── MASTHEAD ────────────────────────────────────────────────────────────── */
.doc-masthead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;
  border-bottom:2px solid ${BRAND_INK};padding-bottom:10px;margin-bottom:14px}
.doc-brand{display:flex;align-items:center;gap:10px}
.doc-wordmark{font-size:15pt;font-weight:700;letter-spacing:-.01em;line-height:1}
.doc-wordmark span{font-weight:500;color:#5A6470}
.doc-title{font-size:10pt;text-transform:uppercase;letter-spacing:.10em;color:#5A6470;
  text-align:right;padding-top:4px}

/* ── MEMBER STRIP ───────────────────────────────────────────────────────── */
.doc-subject{display:flex;align-items:center;gap:12px;margin:0 0 10px}
.doc-avatar{width:42px;height:42px;border-radius:50%;border:1px solid #C9CFD8;flex:0 0 auto;
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13pt;
  color:#5A6470;overflow:hidden}
.doc-avatar img{width:100%;height:100%;object-fit:cover}
.doc-name{font-size:16pt;font-weight:700;line-height:1.15;margin:0}
.doc-facts{font-size:9.5pt;color:#5A6470;margin:2px 0 0}
.doc-chip{display:inline-block;border:1px solid #C9CFD8;border-radius:999px;padding:0 7px;
  font-size:8.5pt;line-height:1.7;color:#5A6470;margin-left:6px;vertical-align:1px}
.doc-meta{font-size:9pt;color:#5A6470;margin:0 0 16px;padding-bottom:10px;
  border-bottom:1px solid #E2E5EA}

/* ── SECTIONS ───────────────────────────────────────────────────────────── */
/*
  Half a medical record on the next sheet is how the second half gets lost. \`break-inside\` is
  the modern property; \`page-break-inside\` is what older print engines read. Both, deliberately.
*/
section{page-break-inside:avoid;break-inside:avoid;margin:0 0 15px}
/* The one place brand red appears, once per section, as a rule. It prints as a dark line on a
   mono laser — which is the point of a border rather than a fill. */
section h2{font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.09em;
  color:${BRAND_INK};border-left:3px solid ${BRAND_RED};padding:1px 0 1px 9px;margin:0 0 7px}
dl{display:grid;grid-template-columns:minmax(46mm,32%) 1fr;gap:3px 10px;margin:0}
dt{color:#5A6470;font-size:9.5pt;line-height:1.45;padding-top:1px}
dd{margin:0;font-size:10pt;line-height:1.45;overflow-wrap:anywhere}
/* Free text gets the whole measure, in a box, so a paragraph is not eight ragged lines. */
.doc-note{grid-column:1 / -1;border:1px solid #C9CFD8;border-radius:3px;padding:6px 8px;
  margin:3px 0 1px;white-space:pre-wrap}
.doc-note b{display:block;font-weight:400;color:#5A6470;font-size:9pt;margin-bottom:2px}

/* ── FOOTER ─────────────────────────────────────────────────────────────── */
/*
  IN THE FLOW, at the end — printed once, on the last page. See \`memberDocumentPageRule\` for
  why this footer is a plain block rather than a pinned one, and what repeats instead.
*/
.doc-footer{border-top:1px solid #C9CFD8;padding-top:5px;margin-top:14px;
  page-break-inside:avoid;break-inside:avoid;font-size:8pt;line-height:1.45;color:#5A6470}
.doc-company{margin:0 0 3px;color:${BRAND_INK}}
.doc-confidential p{margin:0}
`;

/** The company's details as one line, in the order a reader needs them. Empty parts drop out. */
function companyLine(company: DocumentCompany): string {
  return [company.name, company.phone, company.email, company.address]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(" · ");
}

/**
 * The one line that repeats in every page's bottom margin.
 *
 * Short on purpose: a margin box is one line, and this one has to survive beside the page
 * counter at 8pt. It says the two things that matter on a sheet found on its own — whose data
 * this is, and that it is confidential. The full notice is at the end of the document.
 */
export function memberDocumentStrip(doc: MemberDocument): string {
  return `${doc.subject.name} · ${doc.company.name} · Confidential / Confidencial / Vertrouwelijk`;
}

/**
 * The document as a standalone printable page.
 *
 * A SEPARATE DOCUMENT, not a print stylesheet over the dialog, because what needs printing is
 * the record — not the app chrome, the tabs behind it, or a scroll area clipped to its viewport.
 * Built as a string rather than in a component so the escaping above has a test that does not
 * need a browser.
 */
export function memberDocumentAsPrintHtml(doc: MemberDocument): string {
  const { subject } = doc;

  const avatar = subject.photoUrl
    ? `<span class="doc-avatar"><img src="${escapeHtml(subject.photoUrl)}" alt=""></span>`
    : `<span class="doc-avatar">${escapeHtml(subject.initials)}</span>`;

  const chips = [
    subject.memberNumber ? escapeHtml(subject.memberNumber) : null,
    subject.status ? escapeHtml(subject.status) : null,
  ]
    .filter(Boolean)
    .map((c) => `<span class="doc-chip">${c}</span>`)
    .join("");

  const body = doc.sections
    .map((s) => {
      const rows = fieldsOf(s)
        .map((f) =>
          f.note
            ? `<div class="doc-note"><b>${escapeHtml(f.label)}</b>${escapeHtml(f.value)}</div>`
            : `<dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd>`,
        )
        .join("");
      return `<section><h2>${escapeHtml(s.title)}</h2><dl>${rows}</dl></section>`;
    })
    .join("");

  return [
    "<!doctype html><html><head><meta charset='utf-8'>",
    `<title>${escapeHtml(`${subject.name} — ${doc.title}`)}</title>`,
    `<style>${memberDocumentPageRule(memberDocumentStrip(doc))}${MEMBER_DOCUMENT_PRINT_CSS}</style>`,
    "</head><body>",
    `<header class="doc-masthead">`,
    `<div class="doc-brand">${brandMarkSvg({ size: 34 })}`,
    `<div class="doc-wordmark">ICE Alarm <span>España</span></div></div>`,
    `<div class="doc-title">${escapeHtml(doc.title)}</div>`,
    `</header>`,
    `<div class="doc-subject">${avatar}<div>`,
    `<p class="doc-name">${escapeHtml(subject.name)}${chips}</p>`,
    `<p class="doc-facts">${escapeHtml(doc.factCount)}</p>`,
    `</div></div>`,
    `<p class="doc-meta">${escapeHtml(doc.meta)}</p>`,
    body,
    `<footer class="doc-footer">`,
    `<p class="doc-company">${escapeHtml(companyLine(doc.company))}</p>`,
    `<div class="doc-confidential">`,
    doc.confidentiality.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
    `</div></footer>`,
    "</body></html>",
  ].join("");
}

/**
 * The document as plain text, for the Copy button.
 *
 * Plain text on purpose: it is pasted into a handover note, an email or a message to a
 * colleague, and every one of those mangles rich text differently. It carries the SAME header
 * and the SAME confidentiality notice as the printed sheet — a pasted record that has lost the
 * notice is the copy most likely to end up somewhere it should not.
 */
export function memberDocumentAsText(doc: MemberDocument): string {
  const heading = `${doc.subject.name} — ${doc.title}`;
  const lines: string[] = [heading, "=".repeat(heading.length), doc.meta, ""];

  for (const s of doc.sections) {
    lines.push(s.title.toUpperCase());
    for (const f of fieldsOf(s)) {
      lines.push(f.label ? `  ${f.label}: ${f.value}` : `  ${f.value}`);
    }
    lines.push("");
  }

  lines.push("--", companyLine(doc.company), ...doc.confidentiality);
  return lines.join("\n").trimEnd();
}
