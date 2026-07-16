import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { requestPushPermission, onForegroundMessage } from "@/lib/firebase";
import { toast } from "sonner";

// The push columns on `notification_settings` are not reflected in the
// generated Supabase types, so this façade exposes just the writes used here.
const pushDb = supabase as unknown as {
  from: (table: string) => {
    upsert: (
      values: {
        user_id: string;
        push_token: string;
        push_enabled: boolean;
        updated_at: string;
      },
      options: { onConflict: string },
    ) => Promise<{ error: unknown }>;
    update: (values: { push_enabled: boolean; push_token: string | null }) => {
      eq: (column: string, value: unknown) => Promise<{ error: unknown }>;
    };
  };
};

/**
 * Manages push notification subscription lifecycle.
 * Requests permission, gets FCM token, stores it in Supabase,
 * and listens for foreground messages.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [isRequesting, setIsRequesting] = useState(false);

  // Subscribe: request permission → get token → store in DB
  const subscribe = useCallback(async () => {
    if (!user) return null;
    setIsRequesting(true);

    try {
      const fcmToken = await requestPushPermission();
      if (!fcmToken) {
        setPermission(Notification.permission);
        return null;
      }

      // Store token in notification_settings (or system_integrations)
      const { error } = await pushDb.from("notification_settings").upsert(
        {
          user_id: user.id,
          push_token: fcmToken,
          push_enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.error("[Push] Failed to store token:", error);
      }

      setToken(fcmToken);
      setPermission("granted");
      toast.success("Push notifications enabled");
      return fcmToken;
    } catch (e) {
      console.error("[Push] Subscription failed:", e);
      toast.error("Failed to enable push notifications");
      return null;
    } finally {
      setIsRequesting(false);
    }
  }, [user]);

  // Unsubscribe: clear token from DB
  const unsubscribe = useCallback(async () => {
    if (!user) return;

    try {
      await pushDb
        .from("notification_settings")
        .update({ push_enabled: false, push_token: null })
        .eq("user_id", user.id);

      setToken(null);
      toast.success("Push notifications disabled");
    } catch (e) {
      console.error("[Push] Unsubscribe failed:", e);
    }
  }, [user]);

  // Listen for foreground messages
  useEffect(() => {
    if (!token) return;

    let cleanup: (() => void) | null = null;

    onForegroundMessage((payload) => {
      // Show as a toast when the app is in the foreground
      toast(payload.title, { description: payload.body });
    }).then((unsub) => {
      cleanup = unsub;
    });

    return () => {
      cleanup?.();
    };
  }, [token]);

  return {
    token,
    permission,
    isRequesting,
    isSupported:
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator,
    subscribe,
    unsubscribe,
  };
}
