import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFirebaseConfig } from "@/hooks/useFirebaseConfig";
import {
  describeDevice,
  iosNeedsInstall,
  onForegroundMessage,
  platformOf,
  registerForPush,
  unregisterForPush,
  type PushRegistration,
} from "@/lib/firebase";

/**
 * Push notifications for a member of staff, on this device.
 *
 * WHAT THIS REPLACES, AND WHY IT NEVER WORKED. The previous version upserted
 *
 *     notification_settings { user_id, push_token, push_enabled }
 *
 * and `notification_settings` has none of those three columns — it is keyed on `admin_user_id`
 * and holds `whatsapp_*`. The write was routed through a hand-written `supabase as unknown as`
 * façade whose whole effect was to stop TypeScript saying so, and no component ever called the
 * hook, so nothing surfaced the failure. Zero tokens have ever been stored.
 *
 * A token now belongs to a STAFF ROW, in `staff_push_tokens`, one row per device, keyed on the
 * token itself: the same token must never be attached to two staff members, or the second person
 * to enable notifications on a shared tablet receives the first person's alerts.
 */

export type PushState =
  /** No `Notification`/`serviceWorker`, or SSR. */
  | "unsupported"
  /** The six VITE_FIREBASE_* variables are not all set — nothing to register against. */
  | "not_configured"
  /** iOS Safari grants notifications only to an installed web app. */
  | "ios_needs_install"
  /** Supported and configured; nobody has been asked yet. */
  | "available"
  /** The browser permission was refused. Only the user can undo this, in browser settings. */
  | "denied"
  /** This device has a live token stored against this staff member. */
  | "enabled";

export interface UsePushNotifications {
  state: PushState;
  /** Which VITE_FIREBASE_* names are absent, for a UI that can say what to add. */
  missingEnv: string[];
  /** Devices this staff member has registered, newest first. */
  devices: Array<{ id: string; platform: string; label: string | null; last_seen_at: string }>;
  isBusy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEVICE_LABEL_KEY = "icealarm.push.deviceLabel";

export function usePushNotifications(): UsePushNotifications {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [devices, setDevices] = useState<UsePushNotifications["devices"]>([]);
  const [thisDeviceToken, setThisDeviceToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  /*
    THE CONFIG COMES FROM SETTINGS NOW, with the VITE_FIREBASE_* variables as a fallback — so
    pasting it into Admin → Settings takes effect on this screen without a redeploy. That is
    what `missingEnv` reports on: whichever source is in play, it names what is absent.
  */
  const firebase = useFirebaseConfig();
  const config = firebase.config;
  const missing = firebase.source === "none" ? firebase.missingWeb.map(String) : [];

  const supported =
    typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (window.navigator as { standalone?: boolean }).standalone === true);
  const permission =
    typeof Notification !== "undefined" ? Notification.permission : ("default" as NotificationPermission);

  const state: PushState = !supported
    ? "unsupported"
    : !config
      ? "not_configured"
      : iosNeedsInstall(navigator.userAgent, standalone)
        ? "ios_needs_install"
        : thisDeviceToken
          ? "enabled"
          : permission === "denied"
            ? "denied"
            : "available";

  const refresh = useCallback(async () => {
    if (!user) {
      setStaffId(null);
      setDevices([]);
      return;
    }

    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!staff) {
      // Not staff. Push is a staff feature; a member seeing this hook is a routing bug, not a
      // reason to write a row.
      setStaffId(null);
      setDevices([]);
      return;
    }

    setStaffId(staff.id);
    const { data: rows } = await supabase
      .from("staff_push_tokens")
      .select("id, token, platform, label, last_seen_at")
      .eq("staff_id", staff.id)
      .order("last_seen_at", { ascending: false });

    setDevices((rows ?? []).map(({ id, platform, label, last_seen_at }) => ({ id, platform, label, last_seen_at })));

    // Is THIS device among them? The stored token is the only way to tell one phone from
    // another, and it is why the token — not the staff id — is the unique key.
    const known = localStorage.getItem(DEVICE_LABEL_KEY + ".token");
    setThisDeviceToken(known && (rows ?? []).some((r) => r.token === known) ? known : null);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!staffId) {
      toast.error("Only a member of staff can enable notifications");
      return;
    }
    setIsBusy(true);
    try {
      const result: PushRegistration = await registerForPush(config);
      if (!result.ok) {
        toast.error(
          result.reason === "ios_needs_install"
            ? "On iPhone, add this site to your Home Screen first, then enable notifications from there"
            : result.reason === "denied"
              ? "Notifications are blocked for this site in your browser settings"
              : result.reason === "not_configured"
                ? "Push is not configured on this deployment yet"
                : result.reason === "unsupported"
                  ? "This browser cannot receive push notifications"
                  : `Could not enable notifications: ${result.detail ?? "unknown error"}`,
        );
        return;
      }

      const label = describeDevice(navigator.userAgent, standalone);
      const { error } = await supabase.from("staff_push_tokens").upsert(
        {
          staff_id: staffId,
          token: result.token,
          platform: platformOf(navigator.userAgent, standalone),
          label,
          last_seen_at: new Date().toISOString(),
        },
        // ON CONFLICT (token): re-enabling on the same phone refreshes the row rather than
        // failing on the unique index, and a phone that changed hands moves to its new owner.
        { onConflict: "token" },
      );

      if (error) {
        toast.error(`Could not save this device: ${error.message}`);
        return;
      }

      localStorage.setItem(DEVICE_LABEL_KEY + ".token", result.token);
      setThisDeviceToken(result.token);
      toast.success("Notifications enabled on this phone");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [staffId, standalone, refresh, config]);

  const disable = useCallback(async () => {
    if (!thisDeviceToken) return;
    setIsBusy(true);
    try {
      // Firebase first: a token revoked there stops being deliverable even if the delete below
      // fails, where the reverse order can leave a live token nobody owns.
      await unregisterForPush(config);
      const { error } = await supabase
        .from("staff_push_tokens")
        .delete()
        .eq("token", thisDeviceToken);
      if (error) {
        toast.error(`Could not remove this device: ${error.message}`);
        return;
      }
      localStorage.removeItem(DEVICE_LABEL_KEY + ".token");
      setThisDeviceToken(null);
      toast.success("Notifications disabled on this phone");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [thisDeviceToken, refresh, config]);

  // The app is open, so the OS shows nothing — a toast that navigates is the notification.
  useEffect(() => {
    if (!thisDeviceToken) return;
    let cleanup: (() => void) | null = null;
    void onForegroundMessage(config, ({ title, body, link }) => {
      toast(title, {
        description: body,
        action: link ? { label: "Open", onClick: () => navigate(link) } : undefined,
      });
    }).then((unsubscribe) => {
      cleanup = unsubscribe;
    });
    return () => cleanup?.();
  }, [thisDeviceToken, navigate, config]);

  return { state, missingEnv: missing, devices, isBusy, enable, disable, refresh };
}
