import { useState, useEffect } from "react";
import {
  Bell,
  MessageSquare,
  AlertTriangle,
  ListTodo,
  Settings,
  Check,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import {
  useNotifications,
  NotificationType,
  NotificationRecord,
} from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { notificationLink } from "@/lib/notificationLink";
import { notificationBody, notificationTitle } from "@/lib/notificationTitles";

interface NotificationBellProps {
  staffId: string | null;
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "message":
      return <MessageSquare className="h-4 w-4 text-blue-500" />;
    case "alert":
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "task":
      return <ListTodo className="h-4 w-4 text-green-500" />;
    case "system":
      return <Settings className="h-4 w-4 text-gray-500" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

export function NotificationBell({ staffId }: NotificationBellProps) {
  const { t } = useTranslation();
  const isStaff = !!staffId;
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { requestPermission } = useBrowserNotifications();

  /*
    THE USER ID COMES FROM THE CONTEXT THAT ALREADY HAS IT.

    This used to call `supabase.auth.getUser()` in an effect, which cost a network
    round trip AND made `userId` null on the first render and the real id on the
    second. `useNotifications` fires two reads per identity, so the bell — which is
    mounted in every authenticated layout — issued FOUR `notification_log` requests
    on every page load, two of them for a user it already knew was nobody.

    `useAuth()` holds the session the app is already running on. No request, no
    null-then-value flicker, and the hook below never runs against an identity that
    does not exist.
  */
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (staffId) {
      requestPermission();
    }
  }, [staffId, requestPermission]);

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications({ userId, pageSize: 5, enabled: !!userId });

  // Show only the latest 5 in the dropdown
  const recentNotifications = notifications.slice(0, 5);

  const handleNotificationClick = (notification: NotificationRecord) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    const link = notificationLink(notification.type, notification.metadata, isStaff);
    if (link) {
      navigate(link);
    }
    setIsOpen(false);
  };

  const handleViewAll = () => {
    navigate(isStaff ? "/admin/notifications" : "/dashboard/messages");
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">{t("notifications.title", "Notifications")}</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-1" />
              {t("notifications.markAllRead", "Mark all read")}
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {recentNotifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("notifications.empty", "No notifications")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {recentNotifications.map((notification) => (
                <button
                  key={notification.id}
                  className={cn(
                    "w-full p-4 text-left hover:bg-muted/50 transition-colors",
                    !notification.read && "bg-primary/5"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm truncate",
                          !notification.read && "font-medium"
                        )}
                      >
                        {notificationTitle(notification.type, t)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {notificationBody(notification.message, notification.type, t)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title={t("notifications.markRead", "Mark as read")}
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t">
          <Button
            variant="ghost"
            className="w-full text-sm"
            onClick={handleViewAll}
          >
            {t("notifications.viewAll", "View all notifications")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
