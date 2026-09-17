import { useTranslation } from "react-i18next";

/**
 * Privacy Policy body (/privacy), all copy in `legal.privacy.*`.
 *
 * Version 2.0 (17 Sep 2026) is a DRAFT pending legal review (LEGAL.md §5 tripwire): it was
 * rewritten against what the code actually processes. The version line in
 * `legal.privacy.lastUpdated` says so; `[[TO CONFIRM: …]]` markers are facts only Lee or
 * counsel can supply. Do not remove either without that review.
 *
 * Section ids are stable anchors (`/privacy#health-data` etc.) so other surfaces can deep-link.
 */
export default function PrivacyContent() {
  const { t } = useTranslation();

  const list = (key: string) => t(`legal.privacy.${key}`, { returnObjects: true }) as string[];
  const rows = (key: string) => t(`legal.privacy.${key}`, { returnObjects: true }) as string[][];
  const html = (key: string) => ({ __html: t(`legal.privacy.${key}`) });

  const renderList = (key: string) => (
    <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-1">
      {list(key).map((item, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
      ))}
    </ul>
  );

  const renderTable = (headersKey: string, rowsKey: string) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full border-collapse border border-border text-sm">
        <thead>
          <tr className="bg-muted/50">
            {list(headersKey).map((h, i) => (
              <th key={i} scope="col" className="border border-border px-4 py-2 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {rows(rowsKey).map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={`border border-border px-4 py-2 align-top${ci === 0 ? " font-medium" : ""}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const h2 = (key: string) => <h2 className="text-xl font-semibold mb-4">{t(`legal.privacy.${key}`)}</h2>;
  const h3 = (key: string) => <h3 className="text-lg font-medium mb-2">{t(`legal.privacy.${key}`)}</h3>;
  const p = (key: string, mb = "mb-4") => (
    <p className={`text-muted-foreground ${mb}`} dangerouslySetInnerHTML={html(key)} />
  );

  return (
    <>
      {/* At a glance */}
      <section id="summary" className="mb-8 rounded-lg border border-border bg-muted/30 p-4">
        {h2("summaryTitle")}
        {renderList("summaryItems")}
      </section>

      <section id="controller" className="mb-8">
        {h2("s1Title")}
        {p("s1p1")}
        {p("s1p2")}
        {p("s1p3")}
      </section>

      <section id="scope" className="mb-8">
        {h2("s2Title")}
        {p("s2Intro", "mb-2")}
        {renderList("s2Items")}
        {p("s2p1")}
      </section>

      <section id="data" className="mb-8">
        {h2("s3Title")}
        {p("s3Intro")}
        {renderTable("s3TableHeaders", "s3TableRows")}
      </section>

      <section id="legal-basis" className="mb-8">
        {h2("s4Title")}
        {p("s4Intro")}
        {renderTable("s4TableHeaders", "s4TableRows")}
        {p("s4p1")}
      </section>

      <section id="health-data" className="mb-8">
        {h2("s5Title")}
        {p("s5p1")}
        {p("s5Intro", "mb-2")}
        {renderList("s5Items")}
        {p("s5p2")}
        {p("s5p3")}
        {p("s5p4")}
        {p("s5p5")}
      </section>

      <section id="isabella" className="mb-8">
        {h2("s6Title")}
        {p("s6p1")}
        {p("s6Intro", "mb-2")}
        {renderList("s6Items")}
        {p("s6p2")}
        {p("s6p3")}
        {p("s6p4")}
      </section>

      <section id="recipients" className="mb-8">
        {h2("s7Title")}
        {p("s7Intro")}
        {h3("s7_1Title")}
        {p("s7_1p1")}
        {h3("s7_2Title")}
        {p("s7_2p1")}
        {h3("s7_3Title")}
        {p("s7_3p1")}
        {h3("s7_4Title")}
        {p("s7_4p1")}
        {h3("s7_5Title")}
        {p("s7_5p1", "mb-2")}
        {renderTable("s7_5TableHeaders", "s7_5TableRows")}
        {h3("s7_6Title")}
        {p("s7_6p1")}
        {h3("s7_7Title")}
        {renderList("s7_7Items")}
      </section>

      <section id="transfers" className="mb-8">
        {h2("s8Title")}
        {p("s8p1", "mb-2")}
        {renderList("s8Items")}
        {p("s8p2")}
      </section>

      <section id="retention" className="mb-8">
        {h2("s9Title")}
        {p("s9Intro")}
        {renderTable("s9TableHeaders", "s9TableRows")}
        {p("s9p1")}
      </section>

      <section id="security" className="mb-8">
        {h2("s10Title")}
        {p("s10Intro", "mb-2")}
        {renderList("s10Items")}
        {p("s10p1")}
      </section>

      <section id="rights" className="mb-8">
        {h2("s11Title")}
        {p("s11Intro", "mb-2")}
        {renderList("s11Items")}
        {h3("s11HowTitle")}
        {renderList("s11HowItems")}
        {p("s11p1")}
        {h3("s11DeletionTitle")}
        {renderList("s11DeletionItems")}
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
          <p className="font-bold text-destructive">{t("legal.privacy.s11Warning")}</p>
        </div>
        {p("s11p2")}
      </section>

      <section id="minors" className="mb-8">
        {h2("s12Title")}
        {p("s12p1")}
      </section>

      <section id="cookies" className="mb-8">
        {h2("s13Title")}
        {p("s13Intro", "mb-2")}
        {renderList("s13Items")}
        {p("s13p1")}
      </section>

      <section id="changes" className="mb-8">
        {h2("s14Title")}
        {p("s14Intro", "mb-2")}
        {renderList("s14Items")}
        {p("s14p1")}
      </section>

      <section id="complaints" className="mb-8">
        {h2("s15Title")}
        {p("s15p1")}
        {p("s15Authority")}
        {p("s15p2")}
      </section>

      <section id="contact" className="mb-8">
        {h2("s16Title")}
        {p("s16Intro")}
        {p("s16Content")}
      </section>

      <p className="text-sm text-muted-foreground italic">{t("legal.privacy.governedBy")}</p>
    </>
  );
}
