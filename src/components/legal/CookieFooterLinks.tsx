import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { openCookieSettings } from "@/components/gdpr/CookieConsentBanner";

/**
 * The two cookie entries every public footer carries: the Cookie Policy, and a way to change or
 * withdraw consent at any time (AEPD: withdrawing must be as easy as giving consent, and always
 * reachable). Rendered as `<li>` items so it drops into the existing footer link lists.
 */
export function CookieFooterLinks({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <>
      <li>
        <Link to="/cookies" className={className}>
          {t("legal.cookies.footerLink")}
        </Link>
      </li>
      <li>
        <button
          type="button"
          onClick={openCookieSettings}
          className={className}
          data-testid="footer-cookie-settings"
        >
          {t("legal.cookies.settingsLink")}
        </button>
      </li>
    </>
  );
}
