import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/auditLog";
import { functionError } from "@/lib/functionError";
import {
  NOTIFY_CHANNELS,
  livenessFor,
  type ChannelLiveness,
  type NotifyChannel,
  type NotifyEventType,
  type PrefRow,
  type RouteRow,
} from "@/lib/notifyMatrix";

/**
 * The notifications screen's data: routes, per-staff preferences, and whether each channel can
 * actually send.
 *
 * A SWITCH FLIPS A ROW THE ROUTER READS. Not a constant, not a redeploy — the router resolves
 * `notification_routes` and `staff_notification_prefs` on every send, so a toggle here changes
 * the next notification. That is the whole reason the defaults are rows in a migration rather
 * than a policy in code.
 *
 * EVERY CHANGE IS AUDITED. `activity_logs` gets the old and new value with the staff member who
 * made it: "who turned off the paid-sale WhatsApp" has to be answerable, because the answer to
 * "why did nobody hear about that sale" is sometimes "somebody switched it off in March".
 */

const CHANNEL_FLAG_KEYS = NOTIFY_CHANNELS.map((c) => `notify_channel_${c}`);

/** The credential rows the browser is allowed to see. Push and email live in Edge secrets. */
const VISIBLE_CREDENTIAL_KEYS = [
  "settings_twilio_account_sid",
  "settings_twilio_auth_token",
  "settings_twilio_api_key_secret",
  "settings_twilio_sms_number",
  "settings_twilio_whatsapp_number",
];

export interface StaffMember {
  id: string;
  first_name: string;
  last_name: string | null;
  role: string;
  email: string | null;
}

export interface UseNotificationMatrix {
  isLoading: boolean;
  error: Error | null;
  routes: RouteRow[];
  prefs: PrefRow[];
  staff: StaffMember[];
  flags: Partial<Record<NotifyChannel, boolean>>;
  liveness: Record<NotifyChannel, ChannelLiveness>;
  /** True while a write is in flight, so a matrix of switches cannot be double-clicked. */
  isSaving: boolean;
  setChannelFlag: (channel: NotifyChannel, on: boolean) => Promise<void>;
  setRoute: (event: NotifyEventType, channel: NotifyChannel, on: boolean) => Promise<void>;
  setPref: (staffId: string, event: NotifyEventType, channel: NotifyChannel, on: boolean) => Promise<void>;
  /** Ask notify-staff which channels it could actually send on, and remember the answer. */
  sendTest: (staffId: string) => Promise<void>;
  isTesting: boolean;
  /** Set once a test has been sent — the authoritative liveness, from the sender. */
  proven: Partial<Record<NotifyChannel, boolean>> | null;
  /** The router's tables are not in the database yet (the migration is not applied). */
  schemaMissing: boolean;
}

/** PostgREST's answer when a table does not exist. The migration is held; this is expected. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist/i.test(error.message ?? "");
}

export function useNotificationMatrix(): UseNotificationMatrix {
  const queryClient = useQueryClient();
  const [proven, setProven] = useState<Partial<Record<NotifyChannel, boolean>> | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const query = useQuery({
    queryKey: ["notification-matrix"],
    queryFn: async () => {
      const [settings, routesResult, prefsResult, staffResult, emailResult] = await Promise.all([
        supabase.from("system_settings").select("key, value").in("key", [...CHANNEL_FLAG_KEYS, ...VISIBLE_CREDENTIAL_KEYS]),
        supabase.from("notification_routes").select("event_type, channel, enabled"),
        supabase.from("staff_notification_prefs").select("staff_id, event_type, channel, enabled"),
        supabase.from("staff").select("id, first_name, last_name, role, email").eq("is_active", true).order("first_name"),
        supabase.from("email_settings").select("provider").limit(1).maybeSingle(),
      ]);

      // The tables live in a held migration. Missing is a STATE the screen renders, not an
      // error toast on every visit — but any other error is real and must not read as empty.
      const schemaMissing = isMissingTable(routesResult.error) || isMissingTable(prefsResult.error);
      if (!schemaMissing) {
        if (routesResult.error) throw routesResult.error;
        if (prefsResult.error) throw prefsResult.error;
      }
      if (staffResult.error) throw staffResult.error;

      const setting = (key: string) => settings.data?.find((r) => r.key === key)?.value?.trim() ?? "";
      const has = (key: string) => setting(key).length > 0;

      return {
        schemaMissing,
        routes: (routesResult.data ?? []) as RouteRow[],
        prefs: (prefsResult.data ?? []) as PrefRow[],
        staff: (staffResult.data ?? []) as StaffMember[],
        flags: Object.fromEntries(
          NOTIFY_CHANNELS.map((c) => [c, setting(`notify_channel_${c}`) === "true"]),
        ) as Partial<Record<NotifyChannel, boolean>>,
        visible: {
          twilioAccount:
            has("settings_twilio_account_sid") &&
            (has("settings_twilio_auth_token") || has("settings_twilio_api_key_secret")),
          smsNumber: has("settings_twilio_sms_number"),
          whatsappNumber: has("settings_twilio_whatsapp_number"),
          emailProvider: emailResult.data?.provider ?? null,
        },
      };
    },
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["notification-matrix"] });
  }, [queryClient]);

  const flagMutation = useMutation({
    mutationFn: async ({ channel, on }: { channel: NotifyChannel; on: boolean }) => {
      const key = `notify_channel_${channel}`;
      const was = query.data?.flags[channel] === true;
      const { error } = await supabase
        .from("system_settings")
        .upsert({ key, value: String(on) }, { onConflict: "key" });
      if (error) throw error;
      await logActivity({
        action: "update",
        entityType: "settings",
        entityId: key,
        oldValues: { enabled: was },
        newValues: { enabled: on },
      });
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(`Could not change that channel: ${e.message}`),
  });

  const routeMutation = useMutation({
    mutationFn: async ({ event, channel, on }: { event: NotifyEventType; channel: NotifyChannel; on: boolean }) => {
      const was = query.data?.routes.some(
        (r) => r.event_type === event && r.channel === channel && r.enabled,
      );
      const { error } = await supabase
        .from("notification_routes")
        .upsert(
          { event_type: event, channel, enabled: on, updated_at: new Date().toISOString() },
          { onConflict: "event_type,channel" },
        );
      if (error) throw error;
      await logActivity({
        action: "update",
        entityType: "settings",
        // The event and channel in the id, so the audit log is greppable for "who turned off
        // the paid-sale WhatsApp" without joining anything.
        entityId: `notification_routes:${event}:${channel}`,
        oldValues: { enabled: was === true },
        newValues: { enabled: on },
      });
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(`Could not save that switch: ${e.message}`),
  });

  const prefMutation = useMutation({
    mutationFn: async ({
      staffId,
      event,
      channel,
      on,
    }: {
      staffId: string;
      event: NotifyEventType;
      channel: NotifyChannel;
      on: boolean;
    }) => {
      const was = query.data?.prefs.some(
        (p) => p.staff_id === staffId && p.event_type === event && p.channel === channel && p.enabled,
      );
      const { error } = await supabase
        .from("staff_notification_prefs")
        .upsert(
          { staff_id: staffId, event_type: event, channel, enabled: on, updated_at: new Date().toISOString() },
          { onConflict: "staff_id,event_type,channel" },
        );
      if (error) throw error;
      await logActivity({
        action: "update",
        entityType: "settings",
        entityId: `staff_notification_prefs:${staffId}:${event}:${channel}`,
        oldValues: { enabled: was === true },
        newValues: { enabled: on },
      });
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(`Could not save that preference: ${e.message}`),
  });

  const sendTest = useCallback(async (staffId: string) => {
    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-staff", {
        body: {
          event: {
            type: "test",
            title: "Test notification",
            body: "If you are reading this, this channel works.",
            link: "/admin/settings?tab=notifications",
          },
          // TO YOU, not to everybody. A test that texts the whole company is a test nobody
          // presses twice.
          audience: { staffIds: [staffId] },
        },
      });
      // The server's own reason, not supabase-js's generic string: "Admin access required" and
      // "event.type must be one of…" are the two answers somebody debugging this needs, and
      // `throw error` discards both.
      if (error) throw await functionError(error, "The notification router could not be reached");

      const response = data as {
        configured?: Partial<Record<NotifyChannel, boolean>>;
        outcomes?: Array<{ channel: string; status: string; reason?: string }>;
      } | null;

      // The AUTHORITATIVE liveness: the function that would send, saying what it could send on.
      if (response?.configured) setProven(response.configured);

      const sent = (response?.outcomes ?? []).filter((o) => o.status === "sent" && o.channel !== "bell");
      if (sent.length > 0) {
        toast.success(`Test sent on ${sent.map((o) => o.channel).join(", ")}`);
      } else {
        // Never "sent!" when nothing was. The reasons are in the table this screen renders.
        toast.warning("Nothing was sent — see the channel notes above for why.");
      }
    } catch (e) {
      toast.error(`Test failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsTesting(false);
    }
  }, []);

  const liveness = useMemo(
    () =>
      livenessFor({
        flags: query.data?.flags ?? {},
        visible: query.data?.visible,
        proven: proven ?? undefined,
      }),
    [query.data?.flags, query.data?.visible, proven],
  );

  return {
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    routes: query.data?.routes ?? [],
    prefs: query.data?.prefs ?? [],
    staff: query.data?.staff ?? [],
    flags: query.data?.flags ?? {},
    liveness,
    isSaving: flagMutation.isPending || routeMutation.isPending || prefMutation.isPending,
    setChannelFlag: async (channel, on) => {
      await flagMutation.mutateAsync({ channel, on });
    },
    setRoute: async (event, channel, on) => {
      await routeMutation.mutateAsync({ event, channel, on });
    },
    setPref: async (staffId, event, channel, on) => {
      await prefMutation.mutateAsync({ staffId, event, channel, on });
    },
    sendTest,
    isTesting,
    proven,
    schemaMissing: query.data?.schemaMissing === true,
  };
}
