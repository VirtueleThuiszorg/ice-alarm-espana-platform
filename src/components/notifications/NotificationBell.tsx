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
import { supabase } from "@/integrations/supabase/client";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import {
  useNotifications,
  NotificationType,
  NotificationRecord,
} from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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

function getNotificationLink(
  type: NotificationType,
  metadata: Record<string, unknown> | null,
  isStaff: boolean
): string | null {
  if (metadata?.link && typeof metadata.link === "string") {
    return metadata.link;
  }

  // Route by entity_type for section-specific navigation
  const entityType = metadata?.entity_type as string;
  if (entityType) {
    switch (entityType) {
      case "social_post":
        return "/admin/media-manager";
      case "outreach_pipeline":
      case "outreach_email":
        return "/admin/ai-outreach";
      case "video_render":
        return "/admin/video-hub";
    }
  }

  if (!isStaff) {
    // Member-facing links
    switch (type) {
      case "message":
        return "/dashboard/messages";
      case "alert":
        return "/dashboard/alerts";
      default:
        return "/dashboard";
    }
  }
  switch (type) {
    case "alert":
      return "/call-centre";
    case "message":
      return "/admin/messages";
    case "task":
      return "/admin/tasks";
    case "system":
      return "/admin/settings";
    default:
      return null;
  }
}

export function NotificationBell({ staffId }: NotificationBellProps) {
  const isStaff = !!staffId;
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { requestPermission } = useBrowserNotifications();

  // Resolve user_id from the authenticated user
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

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
  } = useNotifications({ userId, pageSize: 5 });

  // Show only the latest 5 in the dropdown
  const recentNotifications = notifications.slice(0, 5);

  const handleNotificationClick = (notification: NotificationRecord) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    const link = getNotificationLink(notification.type, notification.metadata, isStaff);
    if (link) {
      navigate(link);
    }
    setIsOpen(false);
  };

  const handleViewAll = () => {
    navigate(isStaff ? "/admin/notifications" : "/dashboard");
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
          <h4 className="font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {recentNotifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No notifications</p>
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
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {notification.message}
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
                          title="Mark as read"
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
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
