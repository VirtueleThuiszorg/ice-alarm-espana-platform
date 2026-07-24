import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";

/**
 * Locale loading strategy (perf):
 * - `en` is bundled eagerly — it is the fallback language and must exist
 *   before first render.
 * - `es` / `nl` are code-split via dynamic import and loaded only when they
 *   are the active language. This keeps ~550KB of JSON out of the entry
 *   bundle for every visitor.
 */
const LAZY_LOCALES: Record<string, () => Promise<{ default: object }>> = {
  es: () => import("./locales/es.json"),
  nl: () => import("./locales/nl.json"),
};

const loadedLanguages = new Set(["en"]);

async function loadLocale(lng: string): Promise<void> {
  const base = lng.split("-")[0];
  if (loadedLanguages.has(base) || !LAZY_LOCALES[base]) return;
  const data = (await LAZY_LOCALES[base]()).default;
  i18n.addResourceBundle(base, "translation", data, true, true);
  loadedLanguages.add(base);
  // If this is still the active language, re-emit languageChanged so
  // react-i18next re-renders with the real translations (it rendered the
  // en fallback while the bundle was in flight).
  if (i18n.language?.split("-")[0] === base) {
    void i18n.changeLanguage(i18n.language);
  }
}

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
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    fallbackLng: "en",
    supportedLngs: ["en", "es", "nl"],
    saveMissing: auditMode,
    missingKeyHandler: auditMode
      ? (lngs, _ns, key) => {
          // Only record once the language's bundle is actually loaded —
          // otherwise every key looks "missing" during the async load.
          const lng = (lngs?.[0] ?? i18n.language ?? "en").split("-")[0];
          if (!loadedLanguages.has(lng)) return;
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

// Load the detected language's bundle if it isn't the eager one…
if (i18n.language) void loadLocale(i18n.language);
// …and lazy-load on every future language switch.
i18n.on("languageChanged", (lng) => {
  void loadLocale(lng);
});

export default i18n;
