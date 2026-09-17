/**
 * COOKIE CONSENT — the one place that knows what the visitor chose.
 *
 * LSSI-CE art. 22.2 and the AEPD "Guía sobre el uso de las cookies" (July 2023 update) are the
 * reference. STATUS: starting point, pending legal review (LEGAL.md §5) — not a compliance claim.
 *
 * What this module guarantees, and `src/test/cookieConsent.test.ts` proves:
 *   - NOTHING NON-ESSENTIAL RUNS BEFORE A CHOICE. `hasAnalyticsConsent()` is false until the
 *     visitor has actively accepted analytics; absence, corruption and an outdated record all
 *     read as "no".
 *   - THE RECORD IS VERSIONED AND EXPIRES. A change to the Cookie Policy that needs fresh consent
 *     bumps `COOKIE_CONSENT_VERSION`; a record older than `CONSENT_MAX_AGE_MS` is asked again.
 *     The AEPD guide treats 24 months as the maximum before asking again. [[TO CONFIRM: counsel]]
 *   - WITHDRAWAL IS REAL. Saving a record without analytics deletes what analytics had stored,
 *     and every change is broadcast so a mounted tracker stops without a reload.
 *
 * The record lives in the visitor's own browser (localStorage). There is no server-side consent
 * log yet — see the report for why that is a counsel question, not a quick fix.
 */

export const COOKIE_CONSENT_STORAGE_KEY = "ice_cookie_consent";

/** Bump when the Cookie Policy changes in a way that needs the visitor to choose again. */
export const COOKIE_CONSENT_VERSION = 2;

/** 24 months. */
export const CONSENT_MAX_AGE_MS = 24 * 30.44 * 24 * 60 * 60 * 1000;

/** Fired on `window` whenever the stored choice changes. */
export const COOKIE_CONSENT_CHANGED_EVENT = "ice:cookie-consent-changed";

/** Fired on `window` to re-open the settings dialog from anywhere (footer, account page). */
export const OPEN_COOKIE_SETTINGS_EVENT = "ice:open-cookie-settings";

/**
 * What the first-party analytics (`PageTracker`) keeps in localStorage. Deleted when analytics
 * consent is refused or withdrawn. The Cookie Policy table lists these same names, and a test
 * holds the two together.
 */
export const ANALYTICS_STORAGE_KEYS = ["ice_visitor_id", "ice_session_id", "ice_session_timestamp"] as const;

export interface CookiePreferences {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  /** ISO timestamp of the choice. */
  consentedAt: string;
  /** `COOKIE_CONSENT_VERSION` at the time of the choice. Absent on records written before v2. */
  version?: number;
  /** How the choice was made — kept so the record can show it was an active choice. */
  method?: "accept_all" | "reject_all" | "custom";
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The stored record, or null when there is none, it is unreadable, outdated or expired. */
export function readCookieConsent(now: number = Date.now()): CookiePreferences | null {
  try {
    const raw = storage()?.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookiePreferences> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    const at = Date.parse(parsed.consentedAt ?? "");
    if (Number.isNaN(at) || now - at > CONSENT_MAX_AGE_MS) return null;
    return {
      essential: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      consentedAt: parsed.consentedAt as string,
      version: parsed.version,
      method: parsed.method,
    };
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return readCookieConsent()?.analytics === true;
}

/** Remove what analytics stored. Safe to call at any time. */
export function clearAnalyticsStorage(): void {
  const s = storage();
  if (!s) return;
  for (const key of ANALYTICS_STORAGE_KEYS) {
    try {
      s.removeItem(key);
    } catch {
      // storage unavailable — nothing to clear
    }
  }
}

export function saveCookieConsent(
  choice: { analytics: boolean; marketing: boolean; method: NonNullable<CookiePreferences["method"]> },
  now: Date = new Date(),
): CookiePreferences {
  const prefs: CookiePreferences = {
    essential: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
    consentedAt: now.toISOString(),
    version: COOKIE_CONSENT_VERSION,
    method: choice.method,
  };
  try {
    storage()?.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / blocked storage: the choice holds for this page view only.
  }
  if (!prefs.analytics) clearAnalyticsStorage();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: prefs }));
  }
  return prefs;
}
