import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * CANCELLATION, WITHDRAWAL AND REFUND POLICY — the consumer-facing statement of what a member
 * can undo, how, and what they get back.
 *
 * DRAFT, PENDING LEGAL REVIEW (LEGAL.md §0: Claude may draft, never declare compliant). The copy
 * lives in `legal.cancellation.*` in all three locales and carries `[[TO CONFIRM: …]]` markers
 * wherever a company fact or a product behaviour is not yet settled — those are meant to be
 * visible until somebody with authority replaces them.
 *
 * It restates, and must stay consistent with, Terms §7.1 (the pendant is sold), §8.4 (refunds),
 * §9.1 (cancel any time, effective at the end of the paid period) and §9.2 (the 14-day right of
 * withdrawal with its model form). `src/test/cancellationPolicy.test.tsx` pins the load-bearing
 * statements.
 *
 * The strings are ours, static, and contain only `<strong>` / `<br/>` markup, which is why they
 * are rendered as HTML — the same pattern as `TermsContent`.
 */

/** Locale key suffixes under `legal.cancellation`: a heading, lead paragraphs, then a list. */
interface Section {
  title: string;
  paragraphs?: string[];
  items?: string;
}

const SECTIONS: Section[] = [
  { title: "s1Title", paragraphs: ["s1p1", "s1p2"] },
  { title: "s2Title", paragraphs: ["s2p1"], items: "s2Items" },
  { title: "s3Title", paragraphs: ["s3p1"], items: "s3Items" },
  { title: "s4Title", items: "s4Items" },
  { title: "s5Title", paragraphs: ["s5p1"], items: "s5Items" },
  { title: "s6Title", items: "s6Items" },
  { title: "s7Title", items: "s7Items" },
  { title: "s8Title", items: "s8Items" },
  { title: "s9Title", items: "s9Items" },
  { title: "s10Title", items: "s10Items" },
  { title: "s11Title", paragraphs: ["s11p1"] },
  { title: "s12Title", paragraphs: ["s12p1"] },
  { title: "s13Title", paragraphs: ["s13p1"] },
  { title: "s14Title", paragraphs: ["s14p1"] },
];

/** Paragraphs that follow a section's list rather than preceding it. */
const AFTER_LIST: Record<string, string[]> = {
  s3Title: ["s3p2", "s3p3"],
};

export default function CancellationContent() {
  const { t } = useTranslation();
  const k = (key: string) => `legal.cancellation.${key}`;

  const list = (key: string) => {
    const items = t(k(key), { returnObjects: true });
    if (!Array.isArray(items)) return null;
    return (
      <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-1">
        {(items as string[]).map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
        ))}
      </ul>
    );
  };

  const para = (key: string) => (
    <p key={key} className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t(k(key)) }} />
  );

  return (
    <>
      <div className="rounded-lg border bg-muted/40 p-4 mb-8" data-testid="cancellation-summary">
        <h2 className="text-lg font-semibold mb-2">{t(k("summaryTitle"))}</h2>
        {list("summaryItems")}
        <p className="text-sm text-muted-foreground">{t(k("draftNotice"))}</p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-8">
          <h2 className="text-xl font-semibold mb-4">{t(k(section.title))}</h2>
          {section.paragraphs?.map(para)}
          {section.items && list(section.items)}
          {AFTER_LIST[section.title]?.map(para)}
        </section>
      ))}

      <section className="mb-8" id="withdrawal-form" data-testid="withdrawal-form">
        <h2 className="text-xl font-semibold mb-2">{t(k("formTitle"))}</h2>
        <p className="text-muted-foreground text-sm mb-3">{t(k("formIntro"))}</p>
        <div className="rounded-lg border p-4 bg-muted/30">
          <p
            className="text-sm leading-relaxed break-words"
            dangerouslySetInnerHTML={{ __html: t(k("formBody")) }}
          />
        </div>
        <Button variant="outline" className="mt-4 print:hidden" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {t(k("printForm"))}
        </Button>
      </section>

      <section className="mb-8 print:hidden">
        <h2 className="text-lg font-semibold mb-2">{t(k("relatedTitle"))}</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <Link to="/terms" className="underline">{t("legal.footer.termsOfService")}</Link>
          </li>
          <li>
            <Link to="/privacy" className="underline">{t("legal.footer.privacyPolicy")}</Link>
          </li>
        </ul>
      </section>
    </>
  );
}
