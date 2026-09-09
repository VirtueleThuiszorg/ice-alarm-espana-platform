// @vitest-environment node
//
// FIREBASE, CONFIGURED BY PASTING WHAT FIREBASE GIVES YOU.
//
// WHAT THIS REPLACES: six `VITE_FIREBASE_*` build-time variables in Vercel plus a
// `FIREBASE_SERVICE_ACCOUNT` Edge secret in Supabase. Seven values, two dashboards, and a
// redeploy before any of them took effect — and Vercel is deployment rate-limited for 24 hours
// as this is written, so the six web values could not have been applied today at all.
//
// THE TWO THINGS THAT DECIDE WHETHER THIS IS AN IMPROVEMENT:
//
//   1. THE PARSER TAKES WHAT IS ON THE CLIPBOARD. Firebase shows the config as a JavaScript
//      snippet with UNQUOTED keys, which `JSON.parse` refuses. Asking somebody to convert it is
//      asking for a typo in one of six values whose failure mode is silence.
//   2. THE SERVICE ACCOUNT IS NOT READABLE BY STAFF. It can send a push to any registered staff
//      device as us. `system_settings`' staff policy excludes keys matching
//      `(secret|token|password|api_key|_key)` — and `settings_firebase_service_account`, the
//      name the brief proposed, matches NONE of those five. This asserts the name that does.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FIREBASE_PUSH_REQUIRED,
  FIREBASE_SETTING_KEYS,
  FIREBASE_WEB_KEYS,
  describeServiceAccount,
  missingWebKeys,
  parseFirebaseWebConfig,
  resolveFirebaseConfig,
  parseServiceAccountJson,
} from "../../supabase/functions/_shared/firebase-config";
import { resolveServiceAccount } from "../../supabase/functions/_shared/fcm";
import { stripComments } from "./helpers/stripComments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Exactly what Firebase puts on the clipboard when you add a Web app. */
const FIREBASE_SNIPPET = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use

const firebaseConfig = {
  apiKey: "AIzaSyD-fake-key-for-tests-000000000",
  authDomain: "ice-alarm-espana.firebaseapp.com",
  projectId: "ice-alarm-espana",
  storageBucket: "ice-alarm-espana.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef0123456789"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);`;

const EXPECTED = {
  apiKey: "AIzaSyD-fake-key-for-tests-000000000",
  authDomain: "ice-alarm-espana.firebaseapp.com",
  projectId: "ice-alarm-espana",
  storageBucket: "ice-alarm-espana.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef0123456789",
};

describe("the web config, pasted as Firebase shows it", () => {
  it("reads the whole snippet — imports, comments, semicolon and all", () => {
    const parsed = parseFirebaseWebConfig(FIREBASE_SNIPPET);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.config).toEqual(EXPECTED);
  });

  it("reads the object alone, and real JSON, and single quotes, and trailing commas", () => {
    /*
      Every one of these is something somebody will actually paste. A parser that took only one
      shape would send them back to the console to reformat by hand — which is the friction this
      whole change exists to remove.
    */
    const shapes = [
      `{ apiKey: "${EXPECTED.apiKey}", authDomain: "${EXPECTED.authDomain}", projectId: "${EXPECTED.projectId}", storageBucket: "${EXPECTED.storageBucket}", messagingSenderId: "${EXPECTED.messagingSenderId}", appId: "${EXPECTED.appId}" }`,
      JSON.stringify(EXPECTED),
      `{ 'apiKey': '${EXPECTED.apiKey}', 'authDomain': '${EXPECTED.authDomain}', 'projectId': '${EXPECTED.projectId}', 'storageBucket': '${EXPECTED.storageBucket}', 'messagingSenderId': '${EXPECTED.messagingSenderId}', 'appId': '${EXPECTED.appId}', }`,
      `export const firebaseConfig = {\n  apiKey: "${EXPECTED.apiKey}",\n  authDomain: "${EXPECTED.authDomain}",\n  projectId: "${EXPECTED.projectId}",\n  storageBucket: "${EXPECTED.storageBucket}",\n  messagingSenderId: "${EXPECTED.messagingSenderId}",\n  appId: "${EXPECTED.appId}",\n};\n`,
    ];
    for (const shape of shapes) {
      const parsed = parseFirebaseWebConfig(shape);
      expect(parsed.ok, shape.slice(0, 40)).toBe(true);
      expect(parsed.ok && parsed.config.appId).toBe(EXPECTED.appId);
    }
  });

  it("NAMES the key that is missing, one at a time", () => {
    // "Invalid config" is the message that produces a support call. Which key it is, is the
    // difference between a ten-second fix and a support call.
    for (const key of FIREBASE_PUSH_REQUIRED) {
      const partial = { ...EXPECTED } as Record<string, string>;
      delete partial[key];
      const parsed = parseFirebaseWebConfig(JSON.stringify(partial));

      expect(parsed.ok, key).toBe(false);
      expect(!parsed.ok && parsed.missing, key).toEqual([key]);
      expect(!parsed.ok && parsed.error, key).toContain(key);
    }
  });

  it("accepts a config with no storageBucket, because Cloud Messaging never reads it", () => {
    /*
      A Firebase project without Storage enabled has no bucket in its snippet. Refusing that
      would block somebody whose config is completely fine for push — so `storageBucket` and
      `authDomain` are stored when present and never required.
    */
    const noBucket = { ...EXPECTED } as Record<string, string>;
    delete noBucket.storageBucket;
    const parsed = parseFirebaseWebConfig(JSON.stringify(noBucket));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.config.storageBucket).toBe("");
    expect(FIREBASE_PUSH_REQUIRED).not.toContain("storageBucket");
    expect(FIREBASE_WEB_KEYS).toContain("storageBucket");
  });

  it("treats an empty value as missing, not as set", () => {
    const blank = parseFirebaseWebConfig(JSON.stringify({ ...EXPECTED, projectId: "   " }));
    expect(blank.ok).toBe(false);
    expect(!blank.ok && blank.missing).toEqual(["projectId"]);
  });

  it("refuses text that is not a config at all, and says so", () => {
    for (const junk of ["", "   ", "the api key is AIzaSy...", "apiKey = AIzaSy"]) {
      const parsed = parseFirebaseWebConfig(junk);
      expect(parsed.ok, junk).toBe(false);
      expect(!parsed.ok && parsed.error.length, junk).toBeGreaterThan(10);
    }
  });

  it("does not EVALUATE the pasted text", () => {
    /*
      `new Function("return " + body)` would run clipboard contents with the page's privileges.
      "We only run it for super_admins" is not a reason to execute arbitrary JavaScript from a
      clipboard — an admin pasting from the wrong tab should get a parse error, not a payload.
    */
    const src = stripComments(read("supabase/functions/_shared/firebase-config.ts"));
    expect(src).not.toMatch(/new Function|\beval\(/);

    // And a snippet carrying an expression yields no value for that key rather than running it.
    const hostile = `{ apiKey: "ok", projectId: "ok", messagingSenderId: "ok", appId: "ok", evil: (() => { throw new Error("executed"); })() }`;
    const parsed = parseFirebaseWebConfig(hostile);
    expect(parsed.ok).toBe(true);
  });

  it("missingWebKeys answers the card's status line", () => {
    expect(missingWebKeys(EXPECTED)).toEqual([]);
    expect(missingWebKeys(null)).toEqual([...FIREBASE_PUSH_REQUIRED]);
    expect(missingWebKeys({ apiKey: "a", projectId: "b" })).toEqual(["messagingSenderId", "appId"]);
  });
});

describe("the service account", () => {
  const VALID = {
    type: "service_account",
    project_id: "ice-alarm-espana",
    private_key_id: "abc",
    private_key: "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANB\\n-----END PRIVATE KEY-----\\n",
    client_email: "firebase-adminsdk-x@ice-alarm-espana.iam.gserviceaccount.com",
  };

  it("validates the three fields FCM's JWT is signed from", () => {
    const parsed = parseServiceAccountJson(JSON.stringify(VALID));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.account.project_id).toBe("ice-alarm-espana");
    expect(parsed.ok && parsed.account.client_email).toContain("gserviceaccount.com");
  });

  it("UN-ESCAPES the newlines, which is the whole trap", () => {
    /*
      Both the Supabase dashboard and Vercel turn a pasted newline inside a value into a literal
      `\\n`, and `crypto.subtle.importKey` then fails with "invalid keyData" — a message that says
      nothing about why. This is the second place that un-escaping happens (fcm.ts does it too),
      and both are needed: this one for the textarea, that one for the Edge secret.
    */
    const parsed = parseServiceAccountJson(JSON.stringify(VALID));
    expect(parsed.ok && parsed.account.private_key).toContain("\n");
    expect(parsed.ok && parsed.account.private_key).not.toContain("\\n");
  });

  it("names the missing field rather than saying invalid", () => {
    for (const field of ["project_id", "client_email", "private_key"] as const) {
      const partial = { ...VALID } as Record<string, unknown>;
      delete partial[field];
      const parsed = parseServiceAccountJson(JSON.stringify(partial));
      expect(parsed.ok, field).toBe(false);
      expect(!parsed.ok && parsed.error, field).toContain(field);
      // And it says where to get a new one.
      expect(!parsed.ok && parsed.error, field).toContain("Service accounts");
    }
  });

  it("refuses a JSON blob whose private_key is not a PEM key", () => {
    // A wrong-but-present value is the failure that would otherwise surface as "invalid keyData"
    // from Web Crypto, hours later, in a Deno log.
    const parsed = parseServiceAccountJson(JSON.stringify({ ...VALID, private_key: "not-a-key" }));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toContain("BEGIN PRIVATE KEY");
  });

  it("refuses text that is not JSON, and says to paste the whole file", () => {
    const parsed = parseServiceAccountJson("project_id: ice-alarm-espana");
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toMatch(/valid JSON/i);
  });

  it("describes itself with identifiers only — never the key", () => {
    const parsed = parseServiceAccountJson(JSON.stringify(VALID));
    const summary = parsed.ok ? describeServiceAccount(parsed.account) : "";
    expect(summary).toContain("ice-alarm-espana");
    expect(summary).not.toContain("PRIVATE KEY");
    expect(summary).not.toContain("MIIEvQ");
  });
});

describe("the key names, which are the access control", () => {
  /*
    THE POLICY IS A REGEX ON THE KEY NAME. 20260908120000 (fix F12 — every active staff account
    could read the Stripe secret) restricts staff reads to keys NOT matching
    `(secret|token|password|api_key|_key)`. So whether a value is readable by every call-centre
    login is decided by what it is CALLED, and nothing warns you when you get that wrong.
  */
  const STAFF_EXCLUDED = /(secret|token|password|api_key|_key)/i;

  it("the service-account key is excluded from staff reads", () => {
    expect(FIREBASE_SETTING_KEYS.serviceAccount).toMatch(STAFF_EXCLUDED);
    // Specifically by the `_key` suffix, which is the alternative that catches it.
    expect(FIREBASE_SETTING_KEYS.serviceAccount.endsWith("_key")).toBe(true);
  });

  it("...and the name that was proposed for it would NOT have been", () => {
    /*
      Recorded because it is the whole reason the name is what it is:
      `settings_firebase_service_account` matches none of the five alternatives, so it would have
      been readable by every active staff account — a credential that can push to any registered
      staff device, as us.
    */
    expect("settings_firebase_service_account").not.toMatch(STAFF_EXCLUDED);
  });

  it("the six web values and the VAPID key ARE staff-readable, which they must be", () => {
    // Every operator's phone registers with them, and they are public by design: the Firebase
    // web config identifies a project to a browser, it does not authorise anything.
    expect(FIREBASE_SETTING_KEYS.webConfig).not.toMatch(STAFF_EXCLUDED);
    expect(FIREBASE_SETTING_KEYS.vapid).not.toMatch(STAFF_EXCLUDED);
    // `settings_firebase_vapid_key` would have matched `_key` and locked staff out of push.
    expect("settings_firebase_vapid_key").toMatch(STAFF_EXCLUDED);
  });

  it("the policy this depends on is the one in the migration set", () => {
    // A mirror: if the regex in 20260908120000 changes, the reasoning above stops holding.
    const migration = read("supabase/migrations/20260908120000_settings_read_policies.sql");
    expect(migration).toContain("key !~* '(secret|token|password|api_key|_key)'");
  });
});

describe("the server reads the Edge secret first, then settings", () => {
  const VALID_JSON = JSON.stringify({
    project_id: "from-settings",
    client_email: "x@y.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----\\n",
  });

  /** The one read `resolveServiceAccount` makes, as a plain object. */
  const reader = (value: string | null, error: unknown = null) => {
    const calls: string[] = [];
    const db = {
      from: () => ({
        select: () => ({
          eq: (_c: string, key: string) => {
            calls.push(key);
            return { maybeSingle: async () => ({ data: value === null ? null : { value }, error }) };
          },
        }),
      }),
    };
    return { db, calls };
  };

  it("prefers the environment, and does not touch the database at all", async () => {
    /*
      ENVIRONMENT FIRST, and the order matters: an Edge secret never touches a table, so no RLS
      mistake can expose it. A deployment that has one keeps using it, and pays no query.
    */
    const envJson = JSON.stringify({
      project_id: "from-env",
      client_email: "x@y.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----\\n",
    });
    const { db, calls } = reader(VALID_JSON);
    const account = await resolveServiceAccount({ env: envJson, db });

    expect(account?.project_id).toBe("from-env");
    expect(calls).toEqual([]);
  });

  it("falls back to the settings row when the secret is absent", async () => {
    const { db, calls } = reader(VALID_JSON);
    const account = await resolveServiceAccount({ env: undefined, db });

    expect(account?.project_id).toBe("from-settings");
    // Read by the shared key name, so the two halves cannot drift apart.
    expect(calls).toEqual([FIREBASE_SETTING_KEYS.serviceAccount]);
  });

  it("is null when neither exists — push is 'not configured', a legitimate state", async () => {
    expect(await resolveServiceAccount({ env: "", db: reader(null).db })).toBeNull();
    expect(await resolveServiceAccount({ env: null, db: null })).toBeNull();
  });

  it("is null when the read FAILS, rather than throwing", async () => {
    // A failed settings read must not break every other channel's dispatch. The caller reports
    // push as unconfigured, which is also the pre-migration state.
    const { db } = reader(null, { message: "permission denied" });
    expect(await resolveServiceAccount({ env: undefined, db })).toBeNull();
  });

  it("but a MALFORMED value throws, from either source", async () => {
    /*
      Absent is legitimate; a typo is not. Treating a broken value as "not configured" is how a
      channel comes to be silently off for months — which is exactly what happened to the EV07B
      WhatsApp alert.
    */
    await expect(resolveServiceAccount({ env: "{not json" })).rejects.toThrow(/valid JSON/i);
    const { db } = reader('{"project_id":"x"}');
    await expect(resolveServiceAccount({ env: undefined, db })).rejects.toThrow(/client_email/);
  });

  it("never logs the value, from anywhere in either module", () => {
    const fcm = read("supabase/functions/_shared/fcm.ts");
    const config = read("supabase/functions/_shared/firebase-config.ts");
    for (const [name, src] of [["fcm.ts", fcm], ["firebase-config.ts", config]] as const) {
      const logs = [...src.matchAll(/console\.(log|warn|error|info)\(([^;]*)\)/g)].map((m) => m[2]);
      for (const call of logs) {
        expect(call, name).not.toMatch(/private_key|serviceAccount|\bsa\b|account\b|raw\b|pasted/i);
      }
    }
  });
});

describe("the client prefers settings, and the env vars are a fallback only", () => {
  const hook = stripComments(read("src/hooks/useFirebaseConfig.ts"));
  const lib = stripComments(read("src/lib/firebase.ts"));
  const push = stripComments(read("src/hooks/usePushNotifications.ts"));

  const ENV = {
    apiKey: "env-key",
    authDomain: "env.firebaseapp.com",
    projectId: "env-project",
    messagingSenderId: "9",
    appId: "1:9:web:env",
    vapidKey: "env-vapid",
  };
  const STORED = JSON.stringify(EXPECTED);

  it("SETTINGS WIN when both are present", () => {
    /*
      The order is a decision, not an accident. If a build-time variable silently overrode a
      value somebody had just pasted, that would be indistinguishable from the save not
      working — with a redeploy as the only way to find out.

      Executed, because the first version of this compared the ORDER OF THE BRANCHES in the hook
      and `if (false)` in front of the settings branch left it green.
    */
    const resolved = resolveFirebaseConfig({
      storedWebConfig: STORED,
      storedVapid: "stored-vapid",
      envConfig: ENV,
    });
    expect(resolved.source).toBe("settings");
    expect(resolved.config?.projectId).toBe(EXPECTED.projectId);
    expect(resolved.config?.vapidKey).toBe("stored-vapid");
  });

  it("falls back to the env vars only when NOTHING is stored", () => {
    const resolved = resolveFirebaseConfig({ storedWebConfig: "", storedVapid: "", envConfig: ENV });
    expect(resolved.source).toBe("env");
    expect(resolved.config?.projectId).toBe("env-project");
  });

  it("does NOT fall back when a config is stored but broken", () => {
    // Falling through here would leave the card saying "from build variables" while the paste
    // somebody just made sat in the table doing nothing.
    const half = JSON.stringify({ apiKey: "a", projectId: "b" });
    const resolved = resolveFirebaseConfig({ storedWebConfig: half, storedVapid: "v", envConfig: ENV });

    expect(resolved.source).toBe("none");
    expect(resolved.config).toBeNull();
    expect(resolved.parseError).toContain("messagingSenderId");
  });

  it("does not fall back when the web config is stored and the VAPID key is not", () => {
    const resolved = resolveFirebaseConfig({ storedWebConfig: STORED, storedVapid: "", envConfig: ENV });
    expect(resolved.source).toBe("none");
    expect(resolved.vapidSet).toBe(false);
    // Named with its page, because it is on a different one from the other six.
    expect(resolved.parseError).toContain("Web Push certificates");
  });

  it("reports nothing configured as nothing configured", () => {
    const resolved = resolveFirebaseConfig({ storedWebConfig: null, storedVapid: null, envConfig: null });
    expect(resolved).toMatchObject({ config: null, source: "none", vapidSet: false, parseError: null });
    expect(resolved.missingWeb).toEqual([...FIREBASE_PUSH_REQUIRED]);
  });

  it("drops storageBucket, which Cloud Messaging never reads", () => {
    const resolved = resolveFirebaseConfig({ storedWebConfig: STORED, storedVapid: "v", envConfig: null });
    expect(Object.keys(resolved.config ?? {}).sort()).toEqual(
      ["apiKey", "appId", "authDomain", "messagingSenderId", "projectId", "vapidKey"],
    );
  });

  it("the hook reads the two settings rows and never the service account", () => {
    expect(hook).toContain("FIREBASE_SETTING_KEYS.webConfig");
    expect(hook).toContain("FIREBASE_SETTING_KEYS.vapid");
    // A credential that never enters the page cannot leak from it.
    expect(hook).not.toContain("FIREBASE_SETTING_KEYS.serviceAccount");
    // ...and it delegates the precedence rather than re-implementing it.
    expect(hook).toContain("resolveFirebaseConfig({");
  });

  it("the config is PASSED to the registration, not read from env inside it", () => {
    // One decision, in one place. Three modules reading `import.meta.env` is three places to
    // forget the settings row.
    expect(lib).toMatch(/registerForPush\(config: FirebasePushConfig \| null\)/);
    expect(lib).toMatch(/unregisterForPush\(config: FirebasePushConfig \| null\)/);
    expect(push).toContain("useFirebaseConfig()");
    expect(push).toContain("registerForPush(config)");
  });

  it("the service worker still gets its config at registration time", () => {
    // Unchanged and still correct: a static worker's only channel is the registration URL. What
    // changed is where the page got the values from.
    expect(lib).toMatch(/navigator\.serviceWorker\.register\(serviceWorkerUrl\(config\)/);
    const sw = stripComments(read("public/firebase-messaging-sw.js"));
    expect(sw).toContain('params.get("apiKey")');
    expect(sw).not.toContain("import.meta.env");
  });
});

describe("the card", () => {
  const card = read("src/components/admin/settings/FirebaseConfigCard.tsx");

  it("names the Firebase page each value comes from", () => {
    // The VAPID key is on a different page from the other six, which is why it is the one that
    // gets forgotten — so the label says which page.
    expect(card).toContain("Project settings → General");
    expect(card).toContain("Cloud Messaging → Web Push certificates");
    expect(card).toContain("Project settings → Service accounts");
  });

  it("refuses to store a config that does not parse", () => {
    expect(card).toMatch(/const parsed = parseFirebaseWebConfig\(webConfigInput\);/);
    expect(card).toMatch(/if \(!parsed\.ok\) \{[\s\S]{0,200}?return;/);
    expect(card).toMatch(/const parsed = parseServiceAccountJson\(serviceAccountInput\);/);
  });

  it("never reads the service account back, and never audits its value", () => {
    // `head: true` with a count: it asks whether the row exists without selecting the value.
    expect(card).toMatch(/count: "exact", head: true/);
    expect(card).toMatch(/newValues: \{ keys: Object\.keys\(updates\) \}/);
    expect(card).not.toMatch(/newValues: \{ *updates/);
  });

  it("shows all three status lines and the missing web keys by name", () => {
    // The labels, wherever the call is wrapped across lines by the formatter.
    for (const label of ["Web config", "VAPID key", "Service account"]) {
      expect(card, label).toMatch(new RegExp(`statusRow\\(\\s*"${label}"`));
    }
    expect(card).toMatch(/missing \$\{firebase\.missingWeb\.join\(", "\)\}/);
  });

  it("sends the test push to ONE staff member, and reports the router's reason", () => {
    expect(card).toContain("audience: { staffIds: [staff.id] }");
    expect(card).toMatch(/o\.channel === "push"/);
    // Never "sent!" when nothing was.
    expect(card).toContain("No push sent");
  });
});
