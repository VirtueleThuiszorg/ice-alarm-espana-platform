import { useTranslation } from "react-i18next";

export default function PrivacyContent() {
  const { t } = useTranslation();

  const renderList = (items: string[]) => (
    <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-1">
      {items.map((item, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
      ))}
    </ul>
  );

  const renderTable = (headers: string[], rows: string[][]) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full border-collapse border border-border text-sm">
        <thead>
          <tr className="bg-muted/50">
            {headers.map((h, i) => (
              <th key={i} className="border border-border px-4 py-2 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={`border border-border px-4 py-2${ci === 0 ? " font-medium" : ""}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {/* Section 1 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s1Title")}</h2>
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.privacy.s1p1") }} />
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.privacy.s1p2") }} />
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s1p3")}</p>
      </section>

      {/* Section 2 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s2Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s2Intro")}</p>
        {renderList(t("legal.privacy.s2Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 3 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s3Title")}</h2>

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s3_1Title")}</h3>

        <p className="text-muted-foreground font-medium mb-1">{t("legal.privacy.s3AccountLabel")}</p>
        {renderList(t("legal.privacy.s3AccountItems", { returnObjects: true }) as string[])}

        <p className="text-muted-foreground font-medium mb-1">{t("legal.privacy.s3HealthLabel")}</p>
        {renderList(t("legal.privacy.s3HealthItems", { returnObjects: true }) as string[])}

        <p className="text-muted-foreground font-medium mb-1">{t("legal.privacy.s3EmergencyLabel")}</p>
        {renderList(t("legal.privacy.s3EmergencyItems", { returnObjects: true }) as string[])}

        <p className="text-muted-foreground font-medium mb-1">{t("legal.privacy.s3PaymentLabel")}</p>
        {renderList(t("legal.privacy.s3PaymentItems", { returnObjects: true }) as string[])}

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s3_2Title")}</h3>

        <p className="text-muted-foreground font-medium mb-1">{t("legal.privacy.s3DeviceLabel")}</p>
        {renderList(t("legal.privacy.s3DeviceItems", { returnObjects: true }) as string[])}

        <p className="text-muted-foreground font-medium mb-1">{t("legal.privacy.s3UsageLabel")}</p>
        {renderList(t("legal.privacy.s3UsageItems", { returnObjects: true }) as string[])}

        <p className="text-muted-foreground font-medium mb-1">{t("legal.privacy.s3CommsLabel")}</p>
        {renderList(t("legal.privacy.s3CommsItems", { returnObjects: true }) as string[])}

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s3_3Title")}</h3>
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.privacy.s3_3p1") }} />
      </section>

      {/* Section 4 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s4Title")}</h2>
        {renderTable(
          t("legal.privacy.s4TableHeaders", { returnObjects: true }) as string[],
          t("legal.privacy.s4TableRows", { returnObjects: true }) as string[][]
        )}
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.privacy.s4SpecialCategory") }} />
      </section>

      {/* Section 5 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s5Title")}</h2>

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s5_1Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s5_1Intro")}</p>
        {renderList(t("legal.privacy.s5_1Items", { returnObjects: true }) as string[])}

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s5_2Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s5_2Intro")}</p>
        {renderList(t("legal.privacy.s5_2Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s5_2p1")}</p>

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s5_3Title")}</h3>
        {renderList(t("legal.privacy.s5_3Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 6 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s6Title")}</h2>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s6Intro")}</p>

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s6_1Title")}</h3>
        {renderTable(
          t("legal.privacy.s6_1TableHeaders", { returnObjects: true }) as string[],
          t("legal.privacy.s6_1TableRows", { returnObjects: true }) as string[][]
        )}

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s6_2Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s6_2Intro")}</p>
        {renderList(t("legal.privacy.s6_2Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s6_2p1")}</p>

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s6_3Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s6_3Intro")}</p>
        {renderList(t("legal.privacy.s6_3Items", { returnObjects: true }) as string[])}

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s6_4Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s6_4Intro")}</p>
        {renderList(t("legal.privacy.s6_4Items", { returnObjects: true }) as string[])}

        <h3 className="text-lg font-medium mb-3">{t("legal.privacy.s6_5Title")}</h3>
        {renderList(t("legal.privacy.s6_5Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 7 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s7Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s7Intro")}</p>
        {renderList(t("legal.privacy.s7Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s7p1")}</p>
      </section>

      {/* Section 8 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s8Title")}</h2>
        {renderTable(
          t("legal.privacy.s8TableHeaders", { returnObjects: true }) as string[],
          t("legal.privacy.s8TableRows", { returnObjects: true }) as string[][]
        )}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s8p1")}</p>
      </section>

      {/* Section 9 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s9Title")}</h2>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9Intro")}</p>

        <h3 className="text-lg font-medium mb-2">{t("legal.privacy.s9_1Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9_1p1")}</p>

        <h3 className="text-lg font-medium mb-2">{t("legal.privacy.s9_2Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9_2p1")}</p>

        <h3 className="text-lg font-medium mb-2">{t("legal.privacy.s9_3Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9_3p1")}</p>

        <h3 className="text-lg font-medium mb-2">{t("legal.privacy.s9_4Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9_4p1")}</p>

        <h3 className="text-lg font-medium mb-2">{t("legal.privacy.s9_5Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9_5p1")}</p>

        <h3 className="text-lg font-medium mb-2">{t("legal.privacy.s9_6Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9_6p1")}</p>

        <h3 className="text-lg font-medium mb-2">{t("legal.privacy.s9_7Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9_7p1")}</p>

        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
          <p className="font-bold text-destructive">{t("legal.privacy.s9Warning")}</p>
        </div>

        <h3 className="text-lg font-medium mb-2">{t("legal.privacy.s9_8Title")}</h3>
        {renderList(t("legal.privacy.s9_8Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s9_8p1")}</p>
      </section>

      {/* Section 10 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s10Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s10Intro")}</p>
        {renderList(t("legal.privacy.s10Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s10p1")}</p>
      </section>

      {/* Section 11 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s11Title")}</h2>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s11p1")}</p>
      </section>

      {/* Section 12 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s12Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s12Intro")}</p>
        {renderList(t("legal.privacy.s12Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s12p1")}</p>
      </section>

      {/* Section 13 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s13Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s13Intro")}</p>
        {renderList(t("legal.privacy.s13Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s13p1")}</p>
      </section>

      {/* Section 14 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s14Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.privacy.s14Intro")}</p>
        {renderList(t("legal.privacy.s14Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s14p1")}</p>
      </section>

      {/* Section 15 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s15Title")}</h2>
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s15p1")}</p>
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.privacy.s15Authority") }} />
        <p className="text-muted-foreground mb-4">{t("legal.privacy.s15p2")}</p>
      </section>

      {/* Section 16 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.privacy.s16Title")}</h2>
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.privacy.s16Intro") }} />
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.privacy.s16Content") }} />
      </section>

      <p className="text-sm text-muted-foreground italic">{t("legal.privacy.governedBy")}</p>
    </>
  );
}
