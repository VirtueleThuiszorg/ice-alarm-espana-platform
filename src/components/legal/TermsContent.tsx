import { useTranslation } from "react-i18next";
import { usePricing } from "@/hooks/usePricing";
import {
  formatPrice,
  getPendantFinalPrice,
  getRegistrationFee,
  getShippingCost,
  getSubscriptionFinalPrice,
  getSubscriptionMonthlyFinal,
} from "@/config/pricing";

/**
 * Member Terms of Service (`legal.terms.*`).
 *
 * The document is described as data — one entry per section, each a list of blocks — so the
 * order of clauses is readable in one place and every key is spelled out in full (tests grep
 * this file for the withdrawal clause keys).
 *
 * Locale strings are static, reviewed copy; the few that carry <strong>/<a> markup are the
 * ones rendered as HTML.
 */

type Block =
  | { kind: "h3"; key: string }
  | { kind: "p"; key: string; html?: boolean }
  | { kind: "label"; key: string }
  | { kind: "list"; key: string }
  | { kind: "warning"; key: string }
  | { kind: "form"; title: string; intro: string; body: string };

interface Section {
  title: string;
  blocks: Block[];
}

const SECTIONS: Section[] = [
  {
    title: "legal.terms.s1Title",
    blocks: [
      { kind: "p", key: "legal.terms.s1p1" },
      { kind: "p", key: "legal.terms.s1p2" },
      { kind: "p", key: "legal.terms.s1p3" },
      { kind: "p", key: "legal.terms.s1DefsIntro" },
      { kind: "list", key: "legal.terms.s1DefsItems" },
    ],
  },
  {
    title: "legal.terms.s2Title",
    blocks: [
      { kind: "p", key: "legal.terms.s2p1" },
      { kind: "list", key: "legal.terms.s2Items" },
      { kind: "p", key: "legal.terms.s2p2" },
    ],
  },
  {
    title: "legal.terms.s3Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s3_1Title" },
      { kind: "list", key: "legal.terms.s3_1Items" },
      { kind: "h3", key: "legal.terms.s3_2Title" },
      { kind: "list", key: "legal.terms.s3_2Items" },
      { kind: "h3", key: "legal.terms.s3_3Title" },
      { kind: "p", key: "legal.terms.s3_3p1" },
      { kind: "h3", key: "legal.terms.s3_4Title" },
      { kind: "p", key: "legal.terms.s3_4p1", html: true },
    ],
  },
  {
    title: "legal.terms.s4Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s4_1Title" },
      { kind: "warning", key: "legal.terms.s4_1Warning" },
      { kind: "list", key: "legal.terms.s4_1Items" },
      { kind: "h3", key: "legal.terms.s4_2Title" },
      { kind: "p", key: "legal.terms.s4_2Intro" },
      { kind: "label", key: "legal.terms.s4_2GpsLabel" },
      { kind: "list", key: "legal.terms.s4_2GpsItems" },
      { kind: "label", key: "legal.terms.s4_2SystemsLabel" },
      { kind: "list", key: "legal.terms.s4_2SystemsItems" },
      { kind: "label", key: "legal.terms.s4_2ThirdPartyLabel" },
      { kind: "list", key: "legal.terms.s4_2ThirdPartyItems" },
      { kind: "h3", key: "legal.terms.s4_3Title" },
      { kind: "warning", key: "legal.terms.s4_3Warning" },
      { kind: "p", key: "legal.terms.s4_3p1" },
      { kind: "h3", key: "legal.terms.s4_4Title" },
      { kind: "p", key: "legal.terms.s4_4p1" },
      { kind: "h3", key: "legal.terms.s4_5Title" },
      { kind: "p", key: "legal.terms.s4_5Intro" },
      { kind: "list", key: "legal.terms.s4_5Items" },
      { kind: "p", key: "legal.terms.s4_5p1" },
    ],
  },
  {
    title: "legal.terms.s5Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s5_1Title" },
      { kind: "p", key: "legal.terms.s5Intro" },
      { kind: "list", key: "legal.terms.s5Items" },
      { kind: "p", key: "legal.terms.s5p1" },
      { kind: "h3", key: "legal.terms.s5_2Title" },
      { kind: "list", key: "legal.terms.s5_2Items" },
      { kind: "h3", key: "legal.terms.s5_3Title" },
      { kind: "p", key: "legal.terms.s5_3p1" },
    ],
  },
  {
    title: "legal.terms.s6Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s6_1Title" },
      { kind: "p", key: "legal.terms.s6_1p1" },
      { kind: "h3", key: "legal.terms.s6_2Title" },
      { kind: "p", key: "legal.terms.s6_2Intro" },
      { kind: "list", key: "legal.terms.s6_2Items" },
      { kind: "h3", key: "legal.terms.s6_3Title" },
      { kind: "warning", key: "legal.terms.s6_3Warning" },
      { kind: "p", key: "legal.terms.s6_3p1" },
      { kind: "h3", key: "legal.terms.s6_4Title" },
      { kind: "p", key: "legal.terms.s6_4Intro" },
      { kind: "list", key: "legal.terms.s6_4Items" },
      { kind: "p", key: "legal.terms.s6_4p1" },
    ],
  },
  {
    title: "legal.terms.s7Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s7_1Title" },
      { kind: "list", key: "legal.terms.s7_1Items" },
      { kind: "h3", key: "legal.terms.s7_2Title" },
      { kind: "p", key: "legal.terms.s7_2Intro" },
      { kind: "list", key: "legal.terms.s7_2Items" },
      { kind: "h3", key: "legal.terms.s7_3Title" },
      { kind: "p", key: "legal.terms.s7_3p1" },
      { kind: "p", key: "legal.terms.s7_3p2" },
      { kind: "list", key: "legal.terms.s7_3Items" },
      { kind: "h3", key: "legal.terms.s7_4Title" },
      { kind: "list", key: "legal.terms.s7_4Items" },
      { kind: "h3", key: "legal.terms.s7_5Title" },
      { kind: "list", key: "legal.terms.s7_5Items" },
    ],
  },
  {
    title: "legal.terms.s8Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s8_1Title" },
      { kind: "p", key: "legal.terms.s8_1p1" },
      { kind: "list", key: "legal.terms.s8_1Items" },
      { kind: "p", key: "legal.terms.s8_1p2" },
      { kind: "h3", key: "legal.terms.s8_2Title" },
      { kind: "list", key: "legal.terms.s8_2Items" },
      { kind: "h3", key: "legal.terms.s8_3Title" },
      { kind: "p", key: "legal.terms.s8_3p1" },
      { kind: "h3", key: "legal.terms.s8_4Title" },
      { kind: "list", key: "legal.terms.s8_4Items" },
      { kind: "h3", key: "legal.terms.s8_5Title" },
      { kind: "p", key: "legal.terms.s8_5Intro" },
      { kind: "list", key: "legal.terms.s8_5Items" },
    ],
  },
  {
    title: "legal.terms.s9Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s9_1Title" },
      { kind: "p", key: "legal.terms.s9_1Intro" },
      { kind: "list", key: "legal.terms.s9_1Items" },
      { kind: "p", key: "legal.terms.s9_1p1" },
      { kind: "p", key: "legal.terms.s9_1p2" },
      { kind: "h3", key: "legal.terms.s9_2Title" },
      { kind: "p", key: "legal.terms.s9_2p1" },
      { kind: "list", key: "legal.terms.s9_2Items" },
      {
        kind: "form",
        title: "legal.terms.s9_2FormTitle",
        intro: "legal.terms.s9_2FormIntro",
        body: "legal.terms.s9_2FormBody",
      },
      { kind: "h3", key: "legal.terms.s9_3Title" },
      { kind: "p", key: "legal.terms.s9_3Intro" },
      { kind: "list", key: "legal.terms.s9_3Items" },
      { kind: "p", key: "legal.terms.s9_3p1" },
      { kind: "h3", key: "legal.terms.s9_4Title" },
      { kind: "p", key: "legal.terms.s9_4Intro" },
      { kind: "list", key: "legal.terms.s9_4Items" },
      { kind: "h3", key: "legal.terms.s9_5Title" },
      { kind: "p", key: "legal.terms.s9_5p1" },
    ],
  },
  {
    title: "legal.terms.s10Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s10_1Title" },
      { kind: "p", key: "legal.terms.s10_1p1" },
      { kind: "h3", key: "legal.terms.s10_2Title" },
      { kind: "p", key: "legal.terms.s10_2Intro" },
      { kind: "list", key: "legal.terms.s10_2Items" },
      { kind: "p", key: "legal.terms.s10_2p1" },
      { kind: "h3", key: "legal.terms.s10_3Title" },
      { kind: "p", key: "legal.terms.s10_3p1" },
      { kind: "h3", key: "legal.terms.s10_4Title" },
      { kind: "p", key: "legal.terms.s10_4Intro" },
      { kind: "list", key: "legal.terms.s10_4Items" },
    ],
  },
  {
    title: "legal.terms.s11Title",
    blocks: [
      { kind: "p", key: "legal.terms.s11p1" },
      { kind: "list", key: "legal.terms.s11Items" },
    ],
  },
  {
    title: "legal.terms.s12Title",
    blocks: [
      { kind: "p", key: "legal.terms.s12p1" },
      { kind: "list", key: "legal.terms.s12Items" },
    ],
  },
  {
    title: "legal.terms.s13Title",
    blocks: [
      { kind: "p", key: "legal.terms.s13p1", html: true },
      { kind: "p", key: "legal.terms.s13p2" },
      { kind: "list", key: "legal.terms.s13Items" },
      { kind: "p", key: "legal.terms.s13p3" },
    ],
  },
  {
    title: "legal.terms.s14Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s14_1Title" },
      { kind: "p", key: "legal.terms.s14_1Intro" },
      { kind: "list", key: "legal.terms.s14_1Items" },
      { kind: "p", key: "legal.terms.s14_1p1" },
      { kind: "h3", key: "legal.terms.s14_2Title" },
      { kind: "p", key: "legal.terms.s14_2Intro" },
      { kind: "list", key: "legal.terms.s14_2Items" },
      { kind: "h3", key: "legal.terms.s14_3Title" },
      { kind: "p", key: "legal.terms.s14_3p1" },
    ],
  },
  {
    title: "legal.terms.s15Title",
    blocks: [
      { kind: "p", key: "legal.terms.s15p1" },
      { kind: "p", key: "legal.terms.s15p2" },
    ],
  },
  {
    title: "legal.terms.s16Title",
    blocks: [
      { kind: "p", key: "legal.terms.s16Intro" },
      { kind: "list", key: "legal.terms.s16Items" },
      { kind: "p", key: "legal.terms.s16p1" },
      { kind: "p", key: "legal.terms.s16p2" },
    ],
  },
  {
    title: "legal.terms.s17Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s17_1Title" },
      { kind: "p", key: "legal.terms.s17_1p1" },
      { kind: "list", key: "legal.terms.s17_1Items" },
      { kind: "p", key: "legal.terms.s17_1p2" },
      { kind: "h3", key: "legal.terms.s17_2Title" },
      { kind: "p", key: "legal.terms.s17_2p1" },
      { kind: "h3", key: "legal.terms.s17_3Title" },
      { kind: "p", key: "legal.terms.s17_3p1" },
      { kind: "p", key: "legal.terms.s17_3p2" },
      { kind: "h3", key: "legal.terms.s17_4Title" },
      { kind: "p", key: "legal.terms.s17_4p1" },
      { kind: "h3", key: "legal.terms.s17_5Title" },
      { kind: "p", key: "legal.terms.s17_5p1" },
    ],
  },
  {
    title: "legal.terms.s18Title",
    blocks: [
      { kind: "h3", key: "legal.terms.s18_1Title" },
      { kind: "p", key: "legal.terms.s18_1p1" },
      { kind: "h3", key: "legal.terms.s18_2Title" },
      { kind: "p", key: "legal.terms.s18_2p1" },
      { kind: "h3", key: "legal.terms.s18_3Title" },
      { kind: "p", key: "legal.terms.s18_3p1" },
      { kind: "h3", key: "legal.terms.s18_4Title" },
      { kind: "p", key: "legal.terms.s18_4p1" },
      { kind: "h3", key: "legal.terms.s18_5Title" },
      { kind: "p", key: "legal.terms.s18_5p1" },
      { kind: "h3", key: "legal.terms.s18_6Title" },
      { kind: "p", key: "legal.terms.s18_6p1" },
      { kind: "h3", key: "legal.terms.s18_7Title" },
      { kind: "p", key: "legal.terms.s18_7p1" },
      { kind: "h3", key: "legal.terms.s18_8Title" },
      { kind: "p", key: "legal.terms.s18_8p1" },
    ],
  },
  {
    title: "legal.terms.s19Title",
    blocks: [{ kind: "p", key: "legal.terms.s19Content", html: true }],
  },
];

export default function TermsContent() {
  const { t } = useTranslation();
  // Hydrates the module pricing config from the DB, so §8.1 quotes the live prices.
  usePricing();

  const prices = {
    singleMonthly: formatPrice(getSubscriptionMonthlyFinal("single")),
    singleAnnual: formatPrice(getSubscriptionFinalPrice("single", "annual")),
    coupleMonthly: formatPrice(getSubscriptionMonthlyFinal("couple")),
    coupleAnnual: formatPrice(getSubscriptionFinalPrice("couple", "annual")),
    pendant: formatPrice(getPendantFinalPrice(1)),
    registration: formatPrice(getRegistrationFee()),
    shipping: formatPrice(getShippingCost()),
    interpolation: { escapeValue: false },
  };

  const items = (key: string) => {
    const value = t(key, { ...prices, returnObjects: true });
    return Array.isArray(value) ? (value as string[]) : [];
  };

  const renderBlock = (block: Block, i: number) => {
    switch (block.kind) {
      case "h3":
        return (
          <h3 key={i} className="text-lg font-medium mb-3">
            {t(block.key)}
          </h3>
        );
      case "label":
        return (
          <p key={i} className="text-muted-foreground font-medium mb-1">
            {t(block.key)}
          </p>
        );
      case "p":
        return block.html ? (
          <p key={i} className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t(block.key) }} />
        ) : (
          <p key={i} className="text-muted-foreground mb-4">
            {t(block.key, prices)}
          </p>
        );
      case "warning":
        return (
          <div key={i} className="bg-muted/50 border border-border rounded-lg p-3 mb-4">
            <p className="font-semibold">{t(block.key)}</p>
          </div>
        );
      case "list":
        return (
          <ul key={i} className="list-disc pl-6 text-muted-foreground mb-4 space-y-1">
            {items(block.key).map((item, j) => (
              <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
            ))}
          </ul>
        );
      case "form":
        return (
          <div key={i} className="border border-border rounded-lg p-4 mb-4">
            <h4 className="font-medium mb-1">{t(block.title)}</h4>
            <p className="text-muted-foreground text-sm mb-3">{t(block.intro)}</p>
            <p className="text-muted-foreground text-sm" dangerouslySetInnerHTML={{ __html: t(block.body) }} />
          </div>
        );
    }
  };

  return (
    <>
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-8" role="note">
        <p className="font-semibold mb-2">{t("legal.terms.importantWarning")}</p>
        <p className="font-bold text-destructive">{t("legal.terms.emergencyWarning")}</p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-8">
          <h2 className="text-xl font-semibold mb-4">{t(section.title)}</h2>
          {section.blocks.map(renderBlock)}
        </section>
      ))}

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s20Title")}</h2>
        <div className="bg-muted/50 border rounded-lg p-4">
          <p className="font-semibold mb-3">{t("legal.terms.s20Warning")}</p>
          <ol className="list-decimal pl-6 text-muted-foreground space-y-1">
            {items("legal.terms.s20Items").map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </div>
      </section>

      <p className="text-sm text-muted-foreground italic">{t("legal.terms.effectiveDate")}</p>
    </>
  );
}
