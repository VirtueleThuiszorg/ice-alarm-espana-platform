/**
 * FIREBASE, CONFIGURED BY PASTING WHAT FIREBASE GIVES YOU.
 *
 * WHAT THIS REPLACES. Push needed six `VITE_FIREBASE_*` build-time variables in Vercel AND a
 * `FIREBASE_SERVICE_ACCOUNT` Edge secret in Supabase: seven values, two consoles, and a redeploy
 * before any of them took effect. Vercel is also deployment rate-limited for 24 hours at the
 * time of writing, so the six web values could not have been applied today at all.
 *
 * Stripe's keys already work the other way — pasted into Admin → Settings, stored in
 * `system_settings`, read at runtime — and this is that, for Firebase.
 *
 * THREE THINGS TO PASTE, EACH EXACTLY AS FIREBASE SHOWS IT:
 *
 *   1. the web-app config snippet   Project settings → General → Your apps → SDK setup
 *   2. the VAPID public key          Cloud Messaging → Web Push certificates
 *   3. a service-account JSON        Project settings → Service accounts → Generate new private key
 *
 * NOBODY SHOULD HAVE TO EXTRACT SIX FIELDS BY HAND. Firebase shows the config as a JavaScript
 * snippet with UNQUOTED keys — `const firebaseConfig = { apiKey: "…", … };` — which is not JSON
 * and `JSON.parse` refuses it. Asking somebody to convert it is asking them to make a typo in
 * one of six values whose failure mode is a silent no-op. So the parser accepts what is on the
 * clipboard: the whole snippet, the object alone, quoted or unquoted keys, trailing commas,
 * trailing semicolon.
 *
 * AND IT NAMES WHAT IS MISSING. "Invalid config" is the message that produces a support call.
 * The VAPID key in particular lives on a DIFFERENT settings page from the other six, which is
 * why it is the one that gets forgotten.
 */

/** The six values a Firebase Web app needs. `measurementId` is analytics-only and ignored. */
export const FIREBASE_WEB_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

export type FirebaseWebKey = (typeof FIREBASE_WEB_KEYS)[number];
export type FirebaseWebConfig = Record<FirebaseWebKey, string>;

/**
 * The four values the push CLIENT cannot work without.
 *
 * `storageBucket` is in the snippet and is stored, but Cloud Messaging never reads it — so a
 * config missing only that is usable, and refusing it would block somebody whose Firebase
 * project has no Storage bucket enabled. `authDomain` is likewise Auth's, not FCM's.
 */
export const FIREBASE_PUSH_REQUIRED: readonly FirebaseWebKey[] = [
  "apiKey",
  "projectId",
  "messagingSenderId",
  "appId",
];

export const FIREBASE_SETTING_KEYS = {
  /** The six web values, as JSON. Not credential-shaped, so staff may read it — see below. */
  webConfig: "settings_firebase_web_config",
  /** The VAPID PUBLIC key. Public by design; it identifies the sender to the browser. */
  vapid: "settings_firebase_vapid_public",
  /**
   * The service-account JSON. NAMED TO END IN `_key` ON PURPOSE.
   *
   * `system_settings`' staff read policy is `key !~* '(secret|token|password|api_key|_key)'`
   * (20260908120000, fix F12 — every active staff account could read the Stripe secret). A key
   * called `settings_firebase_service_account` matches NONE of those five alternatives, so it
   * would have been readable by every call-centre login: a credential that can send a push
   * notification to any registered staff device, as us. The `_key` suffix is what excludes it,
   * and src/test/firebaseConfig.test.ts plus the RLS harness both assert that it does.
   */
  serviceAccount: "settings_firebase_service_account_key",
} as const;

export type ParsedWebConfig =
  | { ok: true; config: FirebaseWebConfig }
  | { ok: false; error: string; missing: FirebaseWebKey[] };

/**
 * Turn a pasted snippet into the six values.
 *
 * Deliberately tolerant about SHAPE and strict about CONTENT: any wrapper Firebase might put
 * around the object is stripped, and then every required key must be present and non-empty or
 * the answer names the ones that are not.
 */
export function parseFirebaseWebConfig(pasted: string): ParsedWebConfig {
  const text = (pasted ?? "").trim();
  if (!text) {
    return { ok: false, error: "Paste the Firebase config snippet first", missing: [...FIREBASE_PUSH_REQUIRED] };
  }

  // The object, wherever it sits: `const firebaseConfig = {…};`, `{…}`, or an export.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return {
      ok: false,
      error: "That does not look like a Firebase config object — it should contain { … }",
      missing: [...FIREBASE_PUSH_REQUIRED],
    };
  }

  const body = text.slice(start + 1, end);

  /*
    Read the pairs rather than eval the object. `new Function("return " + body)` would run
    pasted text with the page's privileges — this is an admin console, but "we only run it for
    admins" is not a reason to run arbitrary JavaScript from a clipboard. A regex over
    `key: "value"` pairs cannot execute anything.
  */
  const found = new Map<string, string>();
  const pair = /(["']?)([A-Za-z_$][\w$]*)\1\s*:\s*(["'`])((?:\\.|(?!\3).)*)\3/g;
  for (const match of body.matchAll(pair)) {
    found.set(match[2], match[4].trim());
  }

  const config = {} as FirebaseWebConfig;
  const missing: FirebaseWebKey[] = [];
  for (const key of FIREBASE_WEB_KEYS) {
    const value = found.get(key) ?? "";
    config[key] = value;
    if (!value && FIREBASE_PUSH_REQUIRED.includes(key)) missing.push(key);
  }

  if (missing.length > 0) {
    return {
      ok: false,
      // Named, not counted. Somebody who pasted half the snippet needs to know which half.
      error: `The pasted config is missing: ${missing.join(", ")}`,
      missing,
    };
  }

  return { ok: true, config };
}

/** Which of the six a stored config is missing — for the card's live status line. */
export function missingWebKeys(config: Partial<FirebaseWebConfig> | null): FirebaseWebKey[] {
  if (!config) return [...FIREBASE_PUSH_REQUIRED];
  return FIREBASE_PUSH_REQUIRED.filter((key) => !config[key]?.trim());
}

// ── the service account ─────────────────────────────────────────────────────

export interface ServiceAccountFields {
  project_id: string;
  client_email: string;
  private_key: string;
}

export type ParsedServiceAccount =
  | { ok: true; account: ServiceAccountFields }
  | { ok: false; error: string };

/**
 * Validate the service-account JSON, and un-escape its newlines.
 *
 * THE NEWLINES ARE THE WHOLE TRAP. Both the Supabase dashboard and Vercel turn a pasted newline
 * inside a value into a literal `\n`, and `crypto.subtle.importKey` then fails with "invalid
 * keyData" — a message that says nothing about why. Un-escaping here means the same JSON works
 * whether it arrived through a textarea, an Edge secret or a shell.
 *
 * It reports what is WRONG rather than "invalid": these three fields are the ones FCM's JWT is
 * signed from, and a JSON blob missing `private_key` looks identical to a correct one at a
 * glance.
 */
export function parseServiceAccountJson(pasted: string): ParsedServiceAccount {
  const text = (pasted ?? "").trim();
  if (!text) return { ok: false, error: "Paste the service-account JSON first" };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "That is not valid JSON — paste the whole file Firebase downloaded, including the braces",
    };
  }

  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "The service account must be a JSON object" };
  }

  const candidate = raw as Record<string, unknown>;
  const missing = (["project_id", "client_email", "private_key"] as const).filter(
    (field) => typeof candidate[field] !== "string" || !(candidate[field] as string).trim(),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `The service-account JSON is missing: ${missing.join(", ")}. Use Project settings → Service accounts → Generate new private key.`,
    };
  }

  const privateKey = (candidate.private_key as string).replace(/\\n/g, "\n");
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    return {
      ok: false,
      error: "private_key does not look like a PEM key — it should start with -----BEGIN PRIVATE KEY-----",
    };
  }

  return {
    ok: true,
    account: {
      project_id: candidate.project_id as string,
      client_email: candidate.client_email as string,
      private_key: privateKey,
    },
  };
}

/**
 * A one-line summary for the card, carrying NOTHING secret.
 *
 * The project id and the client email are identifiers, not credentials, and showing them is how
 * somebody confirms they pasted the right project's key. The private key is never returned, and
 * never logged anywhere in this module.
 */
export function describeServiceAccount(account: ServiceAccountFields): string {
  return `${account.project_id} · ${account.client_email}`;
}

// ── which source wins ──────────────────────────────────────────────────────

/** The five values the push client initialises with, plus the VAPID key. */
export interface PushConfigLike {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

export type ConfigSource = "settings" | "env" | "none";

export interface ResolvedConfig {
  config: PushConfigLike | null;
  source: ConfigSource;
  missingWeb: FirebaseWebKey[];
  vapidSet: boolean;
  /** A stored config that does not parse — a live problem, not an absence. */
  parseError: string | null;
}

/**
 * SETTINGS FIRST, the build-time variables second, and the order is a decision.
 *
 * If both are present the admin console is the thing somebody just changed, and a
 * `VITE_FIREBASE_*` variable silently overriding it would be indistinguishable from the save not
 * having worked — with a redeploy as the only way to find out.
 *
 * A STORED-BUT-BROKEN CONFIG DOES NOT FALL BACK. Falling through to the environment there would
 * be worse than failing: the card would go on saying "from build variables" while the paste that
 * somebody just made sat in the table doing nothing. So a partially-stored config reports what
 * is wrong with it and nothing else takes over.
 *
 * Pure, because it is the one decision on this path that has to be provable: the hook around it
 * is react-query and a Supabase client, and `if (false)` in front of the settings branch
 * survived a source-scan version of this assertion.
 */
export function resolveFirebaseConfig(input: {
  storedWebConfig: string | null | undefined;
  storedVapid: string | null | undefined;
  envConfig: PushConfigLike | null;
}): ResolvedConfig {
  const storedRaw = input.storedWebConfig?.trim() ?? "";
  const storedVapid = input.storedVapid?.trim() ?? "";
  const stored = storedRaw ? parseFirebaseWebConfig(storedRaw) : null;

  if (stored?.ok && storedVapid) {
    return {
      // Mapped rather than passed through: `storageBucket` is in Firebase's snippet and is
      // stored, and Cloud Messaging never reads it.
      config: {
        apiKey: stored.config.apiKey,
        authDomain: stored.config.authDomain,
        projectId: stored.config.projectId,
        messagingSenderId: stored.config.messagingSenderId,
        appId: stored.config.appId,
        vapidKey: storedVapid,
      },
      source: "settings",
      missingWeb: [],
      vapidSet: true,
      parseError: null,
    };
  }

  const partiallyStored = !!(storedRaw || storedVapid);
  const parseError = stored && !stored.ok
    ? stored.error
    : partiallyStored && !storedVapid
      ? "The VAPID key is not set — Cloud Messaging → Web Push certificates"
      : null;

  if (input.envConfig && !partiallyStored) {
    return { config: input.envConfig, source: "env", missingWeb: [], vapidSet: true, parseError: null };
  }

  return {
    config: null,
    source: "none",
    missingWeb: missingWebKeys(stored?.ok ? stored.config : null),
    vapidSet: !!storedVapid,
    parseError,
  };
}
