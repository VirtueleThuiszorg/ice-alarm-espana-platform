import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";
import nl from "./locales/nl.json";

// Load all languages immediately for instant switching
const resources = {
  en: { translation: en },
  es: { translation: es },
  nl: { translation: nl },
};

// Audit hook: when the page-audit harness sets window.__AUDIT__ before boot,
// collect every missing translation key so specs can assert zero. No-op in
// production (the flag is never set there). See e2e/helpers/pageAudit.ts.
const auditMode =
  typeof window !== "undefined" &&
  (window as unknown as { __AUDIT__?: boolean }).__AUDIT__ === true;

// Initialize i18n synchronously to prevent race conditions
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "es", "nl"],
    saveMissing: auditMode,
    missingKeyHandler: auditMode
      ? (_lngs, _ns, key) => {
          const w = window as unknown as { __I18N_MISSING__?: string[] };
          (w.__I18N_MISSING__ ||= []).push(key);
        }
      : undefined,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
    // Ensure synchronous initialization
    initImmediate: false,
    react: {
      useSuspense: false, // Disable suspense to prevent issues with lazy-loaded components
    },
  });

export default i18n;
