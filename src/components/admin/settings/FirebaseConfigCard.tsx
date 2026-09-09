import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Flame, Loader2, Send, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { functionError } from "@/lib/functionError";
import { logActivity } from "@/lib/auditLog";
import { FIREBASE_CONFIG_QUERY_KEY, useFirebaseConfig } from "@/hooks/useFirebaseConfig";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  FIREBASE_SETTING_KEYS,
  describeServiceAccount,
  parseFirebaseWebConfig,
  parseServiceAccountJson,
} from "../../../../supabase/functions/_shared/firebase-config";

/**
 * FIREBASE, CONFIGURED BY PASTING — three fields, no consoles.
 *
 * WHAT IT REPLACES: six `VITE_FIREBASE_*` build-time variables in Vercel plus a
 * `FIREBASE_SERVICE_ACCOUNT` Edge secret in Supabase. Seven values, two dashboards, and a
 * redeploy before any of them did anything — and Vercel is deployment rate-limited for 24 hours
 * as this is written, so the six web values could not have been applied today at all.
 *
 * EACH FIELD TAKES WHAT FIREBASE ACTUALLY SHOWS YOU. The web config arrives as a JavaScript
 * snippet with unquoted keys, which is not JSON; asking somebody to convert it by hand is asking
 * for a typo in one of six values whose failure mode is silence. The parser reads the snippet.
 *
 * AND THE STATUS IS LIVE, per part: web config, VAPID key, service account — each set or
 * missing, with the missing web keys NAMED, because "not configured" is the message that
 * produces a support call.
 *
 * THE SERVICE ACCOUNT IS THE ONLY SECRET HERE. The six web values are public by design (they
 * identify the project to a browser; Google's own docs say so) and every operator's phone needs
 * them to register. The service account can send a push as us, so it is stored under a key
 * ending in `_key`, which `system_settings`' staff read policy excludes — and it is never read
 * back into this form, only reported as set.
 */

const MASK = "••••••••";

export function FirebaseConfigCard() {
  const queryClient = useQueryClient();
  const firebase = useFirebaseConfig();
  const { devices, state: pushState } = usePushNotifications();

  const [webConfigInput, setWebConfigInput] = useState("");
  const [vapidInput, setVapidInput] = useState("");
  const [serviceAccountInput, setServiceAccountInput] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  /**
   * Is the service account stored? Asked WITHOUT reading it.
   *
   * A `count` on the key: super_admin could read the value, but nothing on this screen needs
   * it, and a credential that never enters the page cannot leak from it. For an admin the row is
   * invisible under the read policy, so a zero count is also the honest "you cannot see this".
   */
  const serviceAccountStored = useQuery({
    queryKey: ["firebase-service-account-present"],
    queryFn: async () => {
      const { count } = await supabase
        .from("system_settings")
        .select("key", { count: "exact", head: true })
        .eq("key", FIREBASE_SETTING_KEYS.serviceAccount);
      return (count ?? 0) > 0;
    },
  });

  const save = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const { data, error } = await supabase.functions.invoke("save-api-keys", {
        body: { service: "settings", keys: updates },
      });
      if (error) throw await functionError(error, "Could not save the Firebase configuration");

      // Audited, with the KEY NAMES and never the values: "who put a different Firebase project
      // in" has to be answerable, and the service-account JSON must not end up in activity_logs.
      await logActivity({
        action: "update",
        entityType: "settings",
        entityId: "firebase",
        newValues: { keys: Object.keys(updates) },
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: FIREBASE_CONFIG_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["firebase-service-account-present"] });
      void queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      firebase.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveWebConfig = () => {
    const parsed = parseFirebaseWebConfig(webConfigInput);
    if (!parsed.ok) {
      // Refused before the write, and the message names the keys. Storing a half config would
      // make the card say "set" over something that cannot register a single device.
      toast.error(parsed.error);
      return;
    }
    save.mutate(
      { [FIREBASE_SETTING_KEYS.webConfig]: JSON.stringify(parsed.config) },
      { onSuccess: () => { setWebConfigInput(""); toast.success("Firebase web config saved"); } },
    );
  };

  const saveVapid = () => {
    const value = vapidInput.trim();
    if (!value) {
      toast.error("Paste the VAPID key first — Cloud Messaging → Web Push certificates");
      return;
    }
    save.mutate(
      { [FIREBASE_SETTING_KEYS.vapid]: value },
      { onSuccess: () => { setVapidInput(""); toast.success("VAPID key saved"); } },
    );
  };

  const saveServiceAccount = () => {
    const parsed = parseServiceAccountJson(serviceAccountInput);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    // Stored as the ORIGINAL text, not the parsed object: the server re-parses it, and
    // re-serialising a private key here is a chance to mangle its newlines for no benefit.
    save.mutate(
      { [FIREBASE_SETTING_KEYS.serviceAccount]: serviceAccountInput.trim() },
      {
        onSuccess: () => {
          setServiceAccountInput("");
          toast.success(`Service account saved — ${describeServiceAccount(parsed.account)}`);
        },
      },
    );
  };

  /** A push to THIS device, and the outcome is a `notification_log` row either way. */
  const sendTestPush = async () => {
    setIsTesting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) throw new Error("Not signed in");

      const { data: staff } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!staff) throw new Error("Only a member of staff can send a test push");

      const { data, error } = await supabase.functions.invoke("notify-staff", {
        body: {
          event: {
            type: "test",
            title: "Test push",
            body: "Firebase is configured and this device is registered.",
            link: "/admin/settings?tab=notifications",
          },
          // To me, and only me. A test that pushes to the whole company is a test nobody
          // presses twice.
          audience: { staffIds: [staff.id] },
        },
      });
      if (error) throw await functionError(error, "The notification router could not be reached");

      const outcomes = (data as { outcomes?: Array<{ channel: string; status: string; reason?: string; error?: string }> } | null)?.outcomes ?? [];
      const push = outcomes.filter((o) => o.channel === "push");
      const sent = push.filter((o) => o.status === "sent");

      if (sent.length > 0) {
        toast.success(`Push sent to ${sent.length} device(s)`);
      } else if (push.length === 0) {
        toast.warning("No push was attempted — no device on your account is registered yet");
      } else {
        // The reason, from the router. Every one of these is also a notification_log row.
        toast.warning(`No push sent: ${push[0].reason ?? push[0].error ?? "unknown"}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setIsTesting(false);
    }
  };

  const statusRow = (label: string, ok: boolean, detail?: string) => (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-alert-resolved" aria-hidden="true" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div>
        <span className="font-medium">{label}:</span>{" "}
        <span className={ok ? "" : "text-muted-foreground"}>{ok ? "set" : "missing"}</span>
        {detail && <span className="text-muted-foreground"> — {detail}</span>}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5" aria-hidden="true" />
          Firebase (push notifications)
          {firebase.source === "settings" && <Badge variant="secondary">from settings</Badge>}
          {firebase.source === "env" && <Badge variant="outline">from build variables</Badge>}
        </CardTitle>
        <CardDescription>
          Paste the three things Firebase gives you. Nothing here needs a redeploy, and none of it
          needs the Vercel or Supabase console.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── live status ─────────────────────────────────────────────────── */}
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
          {statusRow(
            "Web config",
            firebase.missingWeb.length === 0 && firebase.source !== "none",
            firebase.missingWeb.length > 0 ? `missing ${firebase.missingWeb.join(", ")}` : undefined,
          )}
          {statusRow("VAPID key", firebase.vapidSet || firebase.source === "env")}
          {statusRow(
            "Service account",
            serviceAccountStored.data === true,
            serviceAccountStored.data === true
              ? undefined
              : "the server also accepts a FIREBASE_SERVICE_ACCOUNT Edge secret",
          )}
          {firebase.parseError && (
            <div className="flex items-start gap-2 pt-1 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{firebase.parseError}</span>
            </div>
          )}
        </div>

        {/* ── 1. the web config ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="firebase-web-config">
            1. Web app config — Project settings → General → Your apps → SDK setup
          </Label>
          <Textarea
            id="firebase-web-config"
            rows={7}
            className="font-mono text-xs"
            placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "….firebaseapp.com",\n  projectId: "…",\n  storageBucket: "….appspot.com",\n  messagingSenderId: "…",\n  appId: "1:…:web:…"\n};'}
            value={webConfigInput}
            onChange={(e) => setWebConfigInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Paste the whole snippet — the <code>const firebaseConfig = {"{…}"}</code> block, exactly
            as Firebase shows it. Unquoted keys and the trailing semicolon are fine.
          </p>
          <Button onClick={saveWebConfig} disabled={save.isPending || !webConfigInput.trim()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Save web config
          </Button>
        </div>

        {/* ── 2. the VAPID key ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="firebase-vapid">
            2. VAPID key — Cloud Messaging → Web Push certificates
          </Label>
          <Input
            id="firebase-vapid"
            className="font-mono text-xs"
            placeholder={firebase.vapidSet ? MASK : "B…"}
            value={vapidInput}
            onChange={(e) => setVapidInput(e.target.value)}
          />
          {/* A different settings page from the other six, which is exactly why this is the one
              people forget — so the card names the page. */}
          <p className="text-xs text-muted-foreground">
            The <em>public</em> key pair value. It is on a different page from the config above.
          </p>
          <Button onClick={saveVapid} disabled={save.isPending || !vapidInput.trim()}>
            Save VAPID key
          </Button>
        </div>

        {/* ── 3. the service account ──────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="firebase-service-account">
            3. Service account JSON — Project settings → Service accounts → Generate new private key
          </Label>
          <Textarea
            id="firebase-service-account"
            rows={5}
            className="font-mono text-xs"
            placeholder={serviceAccountStored.data ? MASK : '{"type":"service_account","project_id":"…","private_key":"-----BEGIN PRIVATE KEY-----\\n…"}'}
            value={serviceAccountInput}
            onChange={(e) => setServiceAccountInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The only secret on this card. Stored where staff cannot read it, never shown back, and
            never written to the activity log.
          </p>
          <Button onClick={saveServiceAccount} disabled={save.isPending || !serviceAccountInput.trim()}>
            Save service account
          </Button>
        </div>

        {/* ── the proof ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button variant="outline" onClick={() => void sendTestPush()} disabled={isTesting}>
            {isTesting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Send test push to this device
          </Button>
          <p className="text-sm text-muted-foreground">
            {pushState === "enabled"
              ? `${devices.length} device(s) registered. The outcome is a notification_log row either way.`
              : "Enable notifications on this phone first (the card above)."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default FirebaseConfigCard;
