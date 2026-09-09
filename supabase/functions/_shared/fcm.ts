/**
 * Firebase Cloud Messaging, HTTP v1 — the push transport.
 *
 * WHY v1 AND NOT THE LEGACY API. There is no legacy FCM key to replace: nothing server-side has
 * ever sent a push in this codebase (`grep -rl fcm supabase/functions` finds nothing). So this
 * is built on the API that exists rather than the one that was switched off — the legacy
 * `https://fcm.googleapis.com/fcm/send` endpoint with a server key was retired by Google in
 * 2024, and any tutorial offering a `FCM_SERVER_KEY` is describing a dead endpoint.
 *
 * WHAT IT NEEDS: one Edge secret, `FIREBASE_SERVICE_ACCOUNT`, holding the service-account JSON
 * Firebase hands out (project_id, client_email, private_key). No project id in code, no sender
 * id, nothing per-environment: the credential names its own project.
 *
 * THE AUTH DANCE, and why it is here rather than in a library: v1 needs an OAuth access token,
 * obtained by signing a JWT with the service account's private key (RS256) and exchanging it at
 * Google's token endpoint. Deno's Web Crypto does the signing; the token is cached in module
 * scope until a minute before it expires, because an edge function that re-signs on every send
 * pays two extra round trips per notification.
 *
 * PURE WHERE IT CAN BE. The claim set, the message body and the "is this token dead" decision
 * are functions with no I/O, so the contract tests assert the exact JSON Google will receive
 * and the exact conditions under which a token is pruned — without a Firebase project.
 */

import { FIREBASE_SETTING_KEYS } from "./firebase-config.ts";
import type { NotifyEvent } from "./notify-staff.ts";
import type { PushTokenResult } from "./notify-staff.ts";

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/**
 * Read the secret, or say precisely what is wrong with it.
 *
 * Returns null when the secret is ABSENT — that is "push is not configured", a legitimate state
 * the router reports as `not_configured`. Throws only when the secret is PRESENT and unusable,
 * because silently treating a malformed credential as "not configured" would hide a typo in a
 * secret nobody can see.
 */
export function parseServiceAccount(raw: string | undefined | null): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON. Paste the whole service-account " +
        "file, including the braces.",
    );
  }

  const missing = ["project_id", "client_email", "private_key"].filter(
    (k) => typeof parsed[k] !== "string" || !(parsed[k] as string).trim(),
  );
  if (missing.length) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing ${missing.join(", ")}`);
  }

  return {
    project_id: parsed.project_id as string,
    client_email: parsed.client_email as string,
    // Vercel and the Supabase dashboard both turn a pasted newline into a literal \n. Left
    // unhandled, importKey fails with "invalid keyData" and the error says nothing about why.
    private_key: (parsed.private_key as string).replace(/\\n/g, "\n"),
  };
}

/**
 * The smallest read this needs. Structural, so the resolver below is testable with a plain
 * object — `notify-staff-runtime.ts` imports the Supabase client from esm.sh, and vitest's ESM
 * loader cannot resolve that.
 */
export interface SettingReader {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: { value: string | null } | null; error: unknown }>;
      };
    };
  };
}

export interface ServiceAccountSource {
  /** `Deno.env.get("FIREBASE_SERVICE_ACCOUNT")`, or undefined. */
  env?: string | null;
  /** Where to look second. Omit to check the environment only. */
  db?: SettingReader | null;
}

/**
 * THE SERVICE ACCOUNT, FROM WHEREVER IT IS — the Edge secret first, then `system_settings`.
 *
 * ENVIRONMENT FIRST, and the order is the point. An Edge secret is the stronger place to keep a
 * credential (it never touches a table, so no RLS mistake can expose it), so a deployment that
 * has one keeps using it. The settings row exists so that a deployment WITHOUT one still works:
 * asking somebody to set an Edge secret means the Supabase dashboard or the CLI, which is
 * exactly the friction this change removes.
 *
 * IT NEVER LOGS THE VALUE. Not on success, not on a parse failure, not in the error it throws —
 * `parseServiceAccount` reports which FIELD is missing and never quotes the JSON. A private key
 * in a Deno log is a private key in a log aggregator.
 *
 * A MALFORMED VALUE STILL THROWS, from either source: absent is a legitimate state ("push is
 * not configured"), and a typo is not — hiding one behind the other is how a channel comes to be
 * silently off for months.
 */
export async function resolveServiceAccount(
  source: ServiceAccountSource,
): Promise<ServiceAccount | null> {
  const fromEnv = parseServiceAccount(source.env);
  if (fromEnv) return fromEnv;

  if (!source.db) return null;

  const { data, error } = await source.db
    .from("system_settings")
    .select("value")
    .eq("key", FIREBASE_SETTING_KEYS.serviceAccount)
    .maybeSingle();

  // A failed read is "not configured", not a crash: the caller reports push as unconfigured and
  // every other channel still sends. It is also the state before the settings row exists at all.
  if (error) return null;
  return parseServiceAccount(data?.value ?? null);
}

/** The JWT claim set Google's token endpoint expects. Pure, so the test reads it. */
export function jwtClaims(sa: ServiceAccount, nowSeconds: number) {
  return {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    // One hour is the maximum Google accepts; anything longer is rejected as invalid_grant.
    exp: nowSeconds + 3600,
  };
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** PEM (PKCS#8) → CryptoKey. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function signJwt(sa: ServiceAccount, nowSeconds: number): Promise<string> {
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  const payload = b64urlJson(jwtClaims(sa, nowSeconds));
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
}

/** Cached across invocations of a warm function. */
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Exposed so a test can start from a known state; not used in production code. */
export function resetAccessTokenCache(): void {
  cachedToken = null;
}

export async function getAccessToken(
  sa: ServiceAccount,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<string> {
  // A minute of headroom: a token that expires between the check and the send is a 401 nobody
  // can reproduce.
  if (cachedToken && cachedToken.expiresAt - 60_000 > now()) return cachedToken.value;

  const assertion = await signJwt(sa, Math.floor(now() / 1000));
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Firebase token exchange failed (${res.status}): ${body.error_description ?? "no access_token"}`,
    );
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: now() + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/**
 * The v1 message for one token.
 *
 * `webpush.fcm_options.link` is what makes a background click open the right screen — the
 * service worker reads it, and without it every notification lands on the app's home page.
 * `data` carries the same link for the foreground handler, because the two halves of FCM read
 * different fields and only sending one of them is how "tapping it does nothing" happens.
 */
export function fcmMessage(token: string, event: NotifyEvent, siteUrl?: string) {
  const url = event.link && siteUrl ? `${siteUrl.replace(/\/+$/, "")}${event.link}` : undefined;
  return {
    message: {
      token,
      notification: { title: event.title, body: event.body },
      data: {
        type: event.type,
        ...(event.link ? { link: event.link } : {}),
        ...(event.entity ? { entity_type: event.entity.type, entity_id: event.entity.id } : {}),
      },
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/favicon-32x32.png",
          // One notification per event type replaces the previous one rather than stacking six
          // "device offline" cards on a lock screen.
          tag: event.type,
        },
        ...(url ? { fcm_options: { link: url } } : {}),
      },
    },
  };
}

/**
 * Is this a DEAD TOKEN, or a problem with our request?
 *
 * The distinction decides whether a row is deleted. FCM answers `UNREGISTERED` (404) for a token
 * whose app was uninstalled, and `INVALID_ARGUMENT` (400) for a token that is not a token at
 * all — both are permanent and both should be pruned. Everything else (401 on our credentials,
 * 429, 500, a network error) is OUR problem, and deleting somebody's device because Google had
 * a bad minute would silently stop their alerts.
 */
export function isDeadToken(status: number, body: unknown): boolean {
  if (status === 404) return true;
  if (status !== 400) return false;
  const code = (body as { error?: { status?: string; details?: Array<{ errorCode?: string }> } })?.error;
  if (code?.status === "INVALID_ARGUMENT") return true;
  return (code?.details ?? []).some((d) => d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT");
}

export interface FcmDeps {
  serviceAccount: ServiceAccount;
  fetcher?: typeof fetch;
  now?: () => number;
  siteUrl?: string;
}

/**
 * Send one event to a list of tokens, one HTTP call each.
 *
 * ONE CALL PER TOKEN, deliberately: v1 removed the multicast endpoint, and the batch API needs
 * a multipart body whose per-part failures are harder to attribute than four sequential POSTs.
 * A person has two or three devices; this is not a fan-out of thousands.
 */
export async function sendPush(
  tokens: string[],
  event: NotifyEvent,
  deps: FcmDeps,
): Promise<PushTokenResult[]> {
  const fetcher = deps.fetcher ?? fetch;
  const accessToken = await getAccessToken(deps.serviceAccount, fetcher, deps.now ?? Date.now);
  const url = `https://fcm.googleapis.com/v1/projects/${deps.serviceAccount.project_id}/messages:send`;

  const results: PushTokenResult[] = [];
  for (const token of tokens) {
    try {
      const res = await fetcher(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fcmMessage(token, event, deps.siteUrl)),
      });

      if (res.ok) {
        results.push({ token, ok: true });
        continue;
      }

      const body = await res.json().catch(() => ({}));
      const dead = isDeadToken(res.status, body);
      results.push({
        token,
        ok: false,
        invalid: dead,
        error: `fcm ${res.status}${dead ? " (token pruned)" : ""}: ${
          (body as { error?: { message?: string } })?.error?.message ?? "no message"
        }`,
      });
    } catch (e) {
      // A network failure is never a dead token: see isDeadToken's comment.
      results.push({
        token,
        ok: false,
        invalid: false,
        error: e instanceof Error ? e.message : "push request failed",
      });
    }
  }

  return results;
}
