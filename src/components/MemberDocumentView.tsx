import { EMPTY_VALUE, type MemberDocument } from "@/lib/memberDocument";

/**
 * THE MEMBER RECORD ON SCREEN — the same document the printer gets, in React.
 *
 * `memberDocumentAsPrintHtml` renders a `MemberDocument` to paper; this renders the identical
 * model to the dialog. The point is not code reuse, it is that the two cannot DISAGREE: a staff
 * member reads the sheet on screen, presses Print, and hands over a page with the same masthead,
 * the same sections in the same order and the same confidentiality notice. Two hand-written
 * layouts over one record is how the printed copy quietly loses a section.
 *
 * ── WHAT IS THE SAME, DELIBERATELY ──────────────────────────────────────────
 *
 * Masthead, member strip, section rules, field grid, note boxes, company block, notice. The
 * screen version adds nothing the paper one lacks and omits nothing it has.
 *
 * ── WHAT IS NOT, AND WHY ────────────────────────────────────────────────────
 *
 * TOKENS, NOT HEX. On screen this uses the app's own tokens (`text-foreground`,
 * `text-muted-foreground`, `border-primary`), so it follows the theme and the A/A text control
 * the way every other surface does. The print document cannot: it is a standalone `<html>` with
 * no Tailwind and no `:root`, so it carries the same two colours as literal hex. Same palette,
 * two forms, one source (`brandMark.ts`), asserted by `memberDocument.test.ts`.
 *
 * THE FOOTER IS NOT FIXED HERE. On paper it repeats on every page; in a scrolling dialog a
 * fixed footer would sit over the content. It is the last block instead — same words, same
 * place in the reading order.
 *
 * MEMBER_UX_RULES R1/R2: brand red appears once per section, as the left rule on the caption.
 * Nowhere else — not on the status chip, not on a heading, not as a fill.
 */
export function MemberDocumentView({ doc }: { doc: MemberDocument }) {
  const { subject, company } = doc;

  const companyParts = [company.name, company.phone, company.email, company.address].filter(
    (part): part is string => !!part && part.trim().length > 0,
  );

  return (
    <article data-testid="member-document" className="text-foreground">
      {/* ── MASTHEAD ── */}
      <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-foreground pb-3">
        <div className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 100 100"
            className="h-8 w-8 shrink-0"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M50 7 L87 21 V50 C87 71.5 71 87.5 50 93.5 C29 87.5 13 71.5 13 50 V21 Z"
              className="fill-primary"
            />
            <path
              d="M25 52 H37 L43 38 L52 66 L58 52 H75"
              fill="none"
              className="stroke-background"
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-display text-lg font-bold leading-none tracking-tight">
            ICE Alarm <span className="font-medium text-muted-foreground">España</span>
          </span>
        </div>
        <p className="pt-1 text-right text-xs uppercase tracking-[0.1em] text-muted-foreground">
          {doc.title}
        </p>
      </header>

      {/* ── MEMBER STRIP ── */}
      <div className="mb-2.5 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border text-base font-bold text-muted-foreground"
        >
          {subject.photoUrl ? (
            <img src={subject.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            subject.initials
          )}
        </span>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight" data-testid="member-document-name">
            {subject.name}
            {subject.memberNumber ? <Chip>{subject.memberNumber}</Chip> : null}
            {subject.status ? <Chip>{subject.status}</Chip> : null}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground" data-testid="member-document-count">
            {doc.factCount}
          </p>
        </div>
      </div>
      <p className="mb-4 border-b border-border pb-2.5 text-xs text-muted-foreground">{doc.meta}</p>

      {/* ── SECTIONS ── */}
      <div className="space-y-4">
        {doc.sections.map((s) => (
          <section key={s.key} data-testid={`member-document-section-${s.key}`}>
            {/*
              The one place brand red appears on this document: a rule, never a fill (R1/R2).
              `border-l-[3px]` matches the 3px the print stylesheet uses, so the screen and the
              page are the same weight rather than approximately the same.
            */}
            <h3 className="mb-1.5 border-l-[3px] border-primary pl-2 text-xs font-bold uppercase tracking-[0.09em]">
              {s.title}
            </h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(140px,32%)_1fr]">
              {(s.fields.length > 0 ? s.fields : [{ label: "", value: EMPTY_VALUE }]).map((f, i) =>
                f.note ? (
                  <div
                    key={`${f.label}-${i}`}
                    className="col-span-full my-0.5 whitespace-pre-wrap rounded border border-border px-2 py-1.5 text-sm"
                  >
                    <span className="mb-0.5 block text-xs text-muted-foreground">{f.label}</span>
                    {f.value}
                  </div>
                ) : (
                  <div key={`${f.label}-${i}`} className="contents">
                    <dt className="text-sm text-muted-foreground">{f.label}</dt>
                    <dd className="break-words text-sm">{f.value}</dd>
                  </div>
                ),
              )}
            </dl>
          </section>
        ))}
      </div>

      {/* ── FOOTER ── */}
      <footer className="mt-5 border-t border-border pt-2 text-[0.6875rem] leading-snug text-muted-foreground">
        <p className="text-foreground">{companyParts.join(" · ")}</p>
        {doc.confidentiality.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </footer>
    </article>
  );
}

/** Member number and status. Outline, never a colour — a status is not an alarm (R2). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 inline-block rounded-full border border-border px-1.5 align-[2px] text-xs font-normal text-muted-foreground">
      {children}
    </span>
  );
}
