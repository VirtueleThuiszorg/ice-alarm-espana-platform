import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { readPushEnv, type FirebasePushConfig } from "@/lib/firebase";
import {
  FIREBASE_SETTING_KEYS,
  resolveFirebaseConfig,
  type FirebaseWebKey,
} from "../../supabase/functions/_shared/firebase-config";

/**
 * WHERE THE FIREBASE CONFIG COMES FROM, and in which order.
 *
 * 1. `system_settings` — pasted into Admin → Settings → Notifications. Takes effect on the next
 *    query, with no redeploy: that is the whole point of the change.
 * 2. the six `VITE_FIREBASE_*` variables — FALLBACK ONLY, so a deployment already configured
 *    that way keeps working and nobody has to migrate anything.
 *
 * SETTINGS WIN, deliberately. If both are present the admin console is the thing somebody just
 * changed, and a build-time variable silently overriding it would be indistinguishable from the
 * save not working.
 *
 * THE ROW IS STAFF-READABLE AND THAT IS CORRECT. `settings_firebase_web_config` matches none of
 * `(secret|token|password|api_key|_key)`, so the staff read policy allows it — which it must,
 * because every operator's phone registers for push with these values. They are public by
 * design: Google's own documentation says the Firebase web config identifies the project and is
 * not a secret. The SERVICE ACCOUNT is the secret, it is a different row, and its name ends in
 * `_key` precisely so that policy excludes it.
 */

export interface FirebaseConfigState {
  /** Null until every value Cloud Messaging needs is present. */
  config: FirebasePushConfig | null;
  /** Which of the required web keys are absent — for the card's status line. */
  missingWeb: FirebaseWebKey[];
  vapidSet: boolean;
  /** Where the answer came from, so the card can say so. */
  source: "settings" | "env" | "none";
  /** A stored web config that does not parse — a live problem, not an absence. */
  parseError: string | null;
  isLoading: boolean;
  refetch: () => void;
}

export const FIREBASE_CONFIG_QUERY_KEY = ["firebase-config"] as const;

export function useFirebaseConfig(): FirebaseConfigState {
  const { data, isLoading, refetch } = useQuery({
    queryKey: FIREBASE_CONFIG_QUERY_KEY,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [FIREBASE_SETTING_KEYS.webConfig, FIREBASE_SETTING_KEYS.vapid]);

      const value = (key: string) => rows?.find((r) => r.key === key)?.value?.trim() ?? "";
      return {
        webConfigRaw: value(FIREBASE_SETTING_KEYS.webConfig),
        vapid: value(FIREBASE_SETTING_KEYS.vapid),
      };
    },
    // A settings row is not something that changes under you mid-session, but it IS something
    // an admin changes and then immediately expects to see reflected on the same screen.
    staleTime: 30_000,
  });

  /*
    THE PRECEDENCE IS A PURE FUNCTION, in `_shared/firebase-config.ts`, and not four `if`s here.
    It has to be provable: the first version of that assertion compared the ORDER OF THE BRANCHES
    IN THIS FILE, and `if (false)` in front of the settings branch left it green.
  */
  const env = readPushEnv(import.meta.env as unknown as Record<string, string | undefined>);
  const resolved = resolveFirebaseConfig({
    storedWebConfig: data?.webConfigRaw,
    storedVapid: data?.vapid,
    envConfig: env.config,
  });

  return { ...resolved, isLoading, refetch: () => void refetch() };
}
