import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { openCookieSettings } from "@/components/gdpr/CookieConsentBanner";

/**
 * COOKIE POLICY BODY — `legal.cookies.*`.
 *
 * Plain text only (no `dangerouslySetInnerHTML`): nothing in this document needs markup, and the
 * table rows are data. The table lists what the code actually stores; `cookieConsent.test.ts`
 * fails if a storage key used in `src/` is missing from it.
 *
 * DRAFT — pending legal review (LEGAL.md §5). The version line on the page says so.
 */
export interface CookieRow {
  name: string;
  provider: string;
  purpose: string;
  duration: string;
  type: string;
}

const COOKIE_TABLE_GROUPS = [
  { title: "essentialTitle", rows: "essentialRows", intro: null },
  { title: "preferencesTitle", rows: "preferencesRows", intro: null },
  { title: "analyticsTitle", rows: "analyticsRows", intro: null },
  { title: "referralTitle", rows: "referralRows", intro: "referralIntro" },
  { title: "staffTitle", rows: "staffRows", intro: "staffIntro" },
] as const;

const COLUMNS = ["name", "provider", "purpose", "duration", "type"] as const;

export default function CookiesContent() {
  const { t } = useTranslation();
  const k = (key: string) => `legal.cookies.${key}`;
  const list = (key: string) => t(k(key), { returnObjects: true }) as string[];

  const renderList = (items: string[]) => (
    <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );

  const renderTable = (rows: CookieRow[], caption: string) => (
    <div className="overflow-x-auto mb-6">
      <table className="w-full border-collapse border border-border text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-muted/50">
            {COLUMNS.map((c) => (
              <th key={c} scope="col" className="border border-border px-3 py-2 text-left font-semibold">
                {t(k(`tableHeaders.${c}`))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {rows.map((row) => (
            <tr key={row.name}>
              {COLUMNS.map((c) => (
                <td
                  key={c}
                  className={
                    c === "name"
                      ? "border border-border px-3 py-2 font-mono text-xs text-foreground break-words"
                      : "border border-border px-3 py-2"
                  }
                >
                  {row[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <p className="text-muted-foreground mb-8">{t(k("intro"))}</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s1Title"))}</h2>
        <p className="text-muted-foreground mb-4">{t(k("s1p1"))}</p>
        <p className="text-muted-foreground mb-4">{t(k("s1p2"))}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s2Title"))}</h2>
        <p className="text-muted-foreground mb-4">{t(k("s2p1"))}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s3Title"))}</h2>
        {renderList(list("s3Items"))}
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s4Title"))}</h2>
        <p className="text-muted-foreground mb-4">{t(k("s4Intro"))}</p>
        {COOKIE_TABLE_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="text-lg font-medium mb-3">{t(k(g.title))}</h3>
            {g.intro && <p className="text-muted-foreground mb-3">{t(k(g.intro))}</p>}
            {renderTable(t(k(g.rows), { returnObjects: true }) as CookieRow[], t(k(g.title)))}
          </div>
        ))}
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s5Title"))}</h2>
        {renderList(list("s5Items"))}
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s6Title"))}</h2>
        <p className="text-muted-foreground mb-4">{t(k("s6p1"))}</p>
        <p className="text-muted-foreground mb-4">{t(k("s6p2"))}</p>
        <Button type="button" variant="outline" className="mb-6" onClick={openCookieSettings}>
          {t(k("settingsButton"))}
        </Button>
        <p className="text-muted-foreground mb-2">{t(k("s6BrowsersIntro"))}</p>
        {renderList(list("s6Browsers"))}
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s7Title"))}</h2>
        <p className="text-muted-foreground mb-4">{t(k("s7p1"))}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s8Title"))}</h2>
        <p className="text-muted-foreground mb-4">{t(k("s8p1"))}</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t(k("s9Title"))}</h2>
        <p className="text-muted-foreground mb-4">{t(k("s9p1"))}</p>
      </section>
    </>
  );
}
