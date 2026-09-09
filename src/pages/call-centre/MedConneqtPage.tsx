import { useTranslation } from "react-i18next";
import { ExternalLink, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MEDCONNEQT_URL } from "@/config/medconneqt";

/**
 * MedConneqt — the chrome above the embedded partner platform.
 *
 * THE FRAME IS NOT HERE, deliberately. It is mounted once by CallCentreLayout
 * (`MedConneqtFrameHost`) and hidden on every other route, because a route component unmounts
 * when the operator navigates away and unmounting an iframe destroys its session — so before
 * this split, every trip to Members and back logged them out of Medconneqt (Lee's dashboard
 * notes, 9 Sep, item 8). This page therefore renders the title, the login note and the
 * always-present new-tab escape hatch, and nothing that holds a session.
 *
 * A second iframe added here would be a second session, so `src/test/medconneqtEmbed.test.ts`
 * asserts this file has none.
 */
export default function MedConneqtPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("medconneqt.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("medconneqt.subtitle")}</p>
        </div>
        {/* Always available: staff may need the separate login, and browsers can refuse the
            frame's cookies even when framing itself works. */}
        <Button variant="outline" size="sm" asChild>
          <a href={MEDCONNEQT_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            {t("medconneqt.openInNewTab")}
          </a>
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {t("medconneqt.loginNote")} {t("medconneqt.sessionNote")}
        </p>
      </div>
    </div>
  );
}
