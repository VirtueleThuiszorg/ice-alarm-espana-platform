import { useEffect, useCallback, useState } from "react";

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if browser supports notifications
    if ("Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === "granted";
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (!isSupported || permission !== "granted") {
        return null;
      }

      try {
        const notification = new Notification(title, {
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: "ice-alarm-notification",
          requireInteraction: true,
          ...options,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        return notification;
      } catch (error) {
        console.error("Error showing notification:", error);
        return null;
      }
    },
    [isSupported, permission]
  );

  const showAlertNotification = useCallback(
    (alertType: string, memberName: string) => {
      const typeLabels: Record<string, string> = {
        sos_button: "🚨 SOS Button Pressed",
        fall_detected: "⚠️ Fall Detected",
        low_battery: "🔋 Low Battery",
        geo_fence: "📍 Geo-fence Alert",
        check_in: "✅ Check-in",
        manual: "📞 Manual Alert",
      };

      return showNotification(
        typeLabels[alertType] || "New Alert",
        {
          body: `Alert from ${memberName}. Click to view details.`,
          tag: `alert-${Date.now()}`,
          requireInteraction: true,
        }
      );
    },
    [showNotification]
  );

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
    showAlertNotification,
  };
}
