import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";

// Load both languages immediately for instant switching
const resources = {
  en: { translation: en },
  es: { translation: es },
};

// Initialize i18n synchronously to prevent race conditions
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "es"],
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
