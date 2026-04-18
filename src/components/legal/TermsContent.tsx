import { useTranslation } from "react-i18next";

export default function TermsContent() {
  const { t } = useTranslation();

  const renderList = (items: string[]) => (
    <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-1">
      {items.map((item, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
      ))}
    </ul>
  );

  const renderWarning = (text: string) => (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
      <p className="font-bold text-destructive" dangerouslySetInnerHTML={{ __html: text }} />
    </div>
  );

  return (
    <>
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-8">
        <p className="font-bold text-destructive mb-2">
          {t("legal.terms.importantWarning", "IMPORTANT: PLEASE READ THESE TERMS CAREFULLY BEFORE USING OUR SERVICES.")}
        </p>
        <p className="font-bold text-destructive">
          {t("legal.terms.emergencyWarning", "THIS IS A PERSONAL EMERGENCY RESPONSE SERVICE, NOT A SUBSTITUTE FOR EMERGENCY SERVICES (112). IN A LIFE-THREATENING EMERGENCY, ALWAYS CALL 112 DIRECTLY IF POSSIBLE.")}
        </p>
      </div>

      {/* Section 1 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s1Title", "1. Agreement to Terms")}</h2>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s1p1")}</p>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s1p2")}</p>
      </section>

      {/* Section 2 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s2Title", "2. Who We Are")}</h2>
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.terms.s2p1") }} />
        <p className="text-muted-foreground mb-4">{t("legal.terms.s2p2")}</p>
      </section>

      {/* Section 3 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s3Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s3_1Title")}</h3>
        {renderList(t("legal.terms.s3_1Items", { returnObjects: true }) as string[])}
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s3_2Title")}</h3>
        {renderList(t("legal.terms.s3_2Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 4 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s4Title")}</h2>

        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s4_1Title")}</h3>
        {renderWarning(t("legal.terms.s4_1Warning"))}
        {renderList(t("legal.terms.s4_1Items", { returnObjects: true }) as string[])}

        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s4_2Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s4_2Intro")}</p>
        <p className="text-muted-foreground font-medium mb-1">{t("legal.terms.s4_2GpsLabel")}</p>
        {renderList(t("legal.terms.s4_2GpsItems", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground font-medium mb-1">{t("legal.terms.s4_2SystemsLabel")}</p>
        {renderList(t("legal.terms.s4_2SystemsItems", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground font-medium mb-1">{t("legal.terms.s4_2ThirdPartyLabel")}</p>
        {renderList(t("legal.terms.s4_2ThirdPartyItems", { returnObjects: true }) as string[])}

        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s4_3Title")}</h3>
        {renderWarning(t("legal.terms.s4_3Warning"))}
        <p className="text-muted-foreground mb-4">{t("legal.terms.s4_3p1")}</p>

        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s4_4Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s4_4p1")}</p>

        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s4_5Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s4_5Intro")}</p>
        {renderList(t("legal.terms.s4_5Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 5 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s5Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s5Intro")}</p>
        {renderList(t("legal.terms.s5Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.terms.s5p1")}</p>
      </section>

      {/* Section 6 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s6Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s6_1Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s6_1p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s6_2Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s6_2Intro")}</p>
        {renderList(t("legal.terms.s6_2Items", { returnObjects: true }) as string[])}
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s6_3Title")}</h3>
        {renderWarning(t("legal.terms.s6_3Warning"))}
        <p className="text-muted-foreground mb-4">{t("legal.terms.s6_3p1")}</p>
      </section>

      {/* Section 7 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s7Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s7_1Title")}</h3>
        {renderList(t("legal.terms.s7_1Items", { returnObjects: true }) as string[])}
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s7_2Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s7_2Intro")}</p>
        {renderList(t("legal.terms.s7_2Items", { returnObjects: true }) as string[])}
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s7_3Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s7_3p1")}</p>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s7_3p2")}</p>
        {renderList(t("legal.terms.s7_3Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 8 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s8Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s8_1Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s8_1p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s8_2Title")}</h3>
        {renderList(t("legal.terms.s8_2Items", { returnObjects: true }) as string[])}
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s8_3Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s8_3p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s8_4Title")}</h3>
        {renderList(t("legal.terms.s8_4Items", { returnObjects: true }) as string[])}
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s8_5Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s8_5Intro")}</p>
        {renderList(t("legal.terms.s8_5Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 9 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s9Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s9_1Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s9_1Intro")}</p>
        {renderList(t("legal.terms.s9_1Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.terms.s9_1p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s9_2Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s9_2p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s9_3Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s9_3Intro")}</p>
        {renderList(t("legal.terms.s9_3Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.terms.s9_3p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s9_4Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s9_4Intro")}</p>
        {renderList(t("legal.terms.s9_4Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 10 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s10Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s10_1Title")}</h3>
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
          <p className="font-bold text-destructive mb-2">{t("legal.terms.s10_1Warning")}</p>
          <p className="text-muted-foreground mb-2" dangerouslySetInnerHTML={{ __html: t("legal.terms.s10_1a") }} />
          <p className="text-muted-foreground mb-2" dangerouslySetInnerHTML={{ __html: t("legal.terms.s10_1b") }} />
          <p className="text-muted-foreground mb-1" dangerouslySetInnerHTML={{ __html: t("legal.terms.s10_1c") }} />
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            {(t("legal.terms.s10_1cItems", { returnObjects: true }) as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s10_2Title")}</h3>
        {renderWarning(t("legal.terms.s10_2Warning"))}

        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s10_3Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s10_3Intro")}</p>
        {renderList(t("legal.terms.s10_3Items", { returnObjects: true }) as string[])}

        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s10_4Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s10_4Intro")}</p>
        {renderList(t("legal.terms.s10_4Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 11 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s11Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s11p1")}</p>
        {renderList(t("legal.terms.s11Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 12 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s12Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s12p1")}</p>
        {renderList(t("legal.terms.s12Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 13 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s13Title")}</h2>
        <p className="text-muted-foreground mb-2" dangerouslySetInnerHTML={{ __html: t("legal.terms.s13p1") }} />
        <p className="text-muted-foreground mb-2">{t("legal.terms.s13p2")}</p>
        {renderList(t("legal.terms.s13Items", { returnObjects: true }) as string[])}
      </section>

      {/* Section 14 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s14Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s14_1Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s14_1Intro")}</p>
        {renderList(t("legal.terms.s14_1Items", { returnObjects: true }) as string[])}
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s14_2Title")}</h3>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s14_2Intro")}</p>
        {renderList(t("legal.terms.s14_2Items", { returnObjects: true }) as string[])}
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s14_3Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s14_3p1")}</p>
      </section>

      {/* Section 15 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s15Title")}</h2>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s15p1")}</p>
      </section>

      {/* Section 16 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s16Title")}</h2>
        <p className="text-muted-foreground mb-2">{t("legal.terms.s16Intro")}</p>
        {renderList(t("legal.terms.s16Items", { returnObjects: true }) as string[])}
        <p className="text-muted-foreground mb-4">{t("legal.terms.s16p1")}</p>
      </section>

      {/* Section 17 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s17Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s17_1Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s17_1p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s17_2Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s17_2p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s17_3Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s17_3p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s17_4Title")}</h3>
        <p className="text-muted-foreground mb-4">
          {t("legal.terms.s17_4p1")}{" "}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            https://ec.europa.eu/consumers/odr
          </a>
        </p>
      </section>

      {/* Section 18 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s18Title")}</h2>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s18_1Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s18_1p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s18_2Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s18_2p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s18_3Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s18_3p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s18_4Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s18_4p1")}</p>
        <h3 className="text-lg font-medium mb-3">{t("legal.terms.s18_5Title")}</h3>
        <p className="text-muted-foreground mb-4">{t("legal.terms.s18_5p1")}</p>
      </section>

      {/* Section 19 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s19Title")}</h2>
        <p className="text-muted-foreground mb-4" dangerouslySetInnerHTML={{ __html: t("legal.terms.s19Content") }} />
      </section>

      {/* Section 20 */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("legal.terms.s20Title")}</h2>
        <div className="bg-muted/50 border rounded-lg p-4">
          <p className="font-bold mb-3">{t("legal.terms.s20Warning")}</p>
          <ol className="list-decimal pl-6 text-muted-foreground space-y-1">
            {(t("legal.terms.s20Items", { returnObjects: true }) as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </div>
      </section>

      <p className="text-sm text-muted-foreground italic">{t("legal.terms.effectiveDate")}</p>
      <p className="text-sm text-muted-foreground italic">{t("legal.terms.tagline")}</p>
    </>
  );
}
