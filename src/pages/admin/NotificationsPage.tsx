import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import {
  Bell,
  BellOff,
  MessageSquare,
  AlertTriangle,
  ListTodo,
  Settings,
  Check,
  CheckCheck,
  Loader2,
  Inbox,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useNotifications,
  NotificationType,
} from "@/hooks/useNotifications";

// Map notification types to navigation routes
function getNotificationLink(
  type: NotificationType,
  metadata: Record<string, unknown> | null
): string | null {
  if (metadata?.link && typeof metadata.link === "string") {
    return metadata.link;
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

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "message":
      return <MessageSquare className="h-5 w-5 text-blue-500" />;
    case "alert":
      return <AlertTriangle className="h-5 w-5 text-red-500" />;
    case "task":
      return <ListTodo className="h-5 w-5 text-green-500" />;
    case "system":
      return <Settings className="h-5 w-5 text-gray-500" />;
    default:
      return <Bell className="h-5 w-5 text-muted-foreground" />;
  }
}

function getTypeBadgeVariant(type: NotificationType) {
  switch (type) {
    case "alert":
      return "destructive" as const;
    case "message":
      return "default" as const;
    case "task":
      return "secondary" as const;
    case "system":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);

  // Resolve the current user id for scoping notifications
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    typeFilter,
    readFilter,
    setTypeFilter,
    setReadFilter,
    markAsRead,
    markAllAsRead,
    loadMore,
  } = useNotifications({ userId, pageSize: 20 });

  const handleNotificationClick = (notification: (typeof notifications)[0]) => {
    // Mark as read if not already
    if (!notification.read) {
      markAsRead(notification.id);
    }
    // Navigate to the relevant page
    const link = getNotificationLink(notification.type, notification.metadata);
    if (link) {
      navigate(link);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notification Center</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Tabs
          value={typeFilter}
          onValueChange={(val) =>
            setTypeFilter(val as NotificationType | "all")
          }
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="alert">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="system">
              <Settings className="h-3.5 w-3.5 mr-1" />
              System
            </TabsTrigger>
            <TabsTrigger value="message">
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              Messages
            </TabsTrigger>
            <TabsTrigger value="task">
              <ListTodo className="h-3.5 w-3.5 mr-1" />
              Tasks
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={readFilter}
            onValueChange={(val) =>
              setReadFilter(val as "all" | "read" | "unread")
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="unread">Unread only</SelectItem>
              <SelectItem value="read">Read only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Notification List */}
      {isLoading && notifications.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            {readFilter === "unread" ? (
              <>
                <BellOff className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No unread notifications</h3>
                <p className="text-muted-foreground mt-1">
                  You're all caught up! Check back later for new notifications.
                </p>
              </>
            ) : (
              <>
                <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No notifications</h3>
                <p className="text-muted-foreground mt-1">
                  {typeFilter !== "all"
                    ? `No ${typeFilter} notifications found.`
                    : "Notifications will appear here when there is new activity."}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={cn(
                "transition-colors hover:bg-muted/50 cursor-pointer",
                !notification.read && "border-l-4 border-l-primary bg-primary/5"
              )}
            >
              <CardContent className="p-4">
                <button
                  className="w-full text-left"
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={cn(
                            "text-sm",
                            !notification.read && "font-semibold"
                          )}
                        >
                          {notification.title}
                        </span>
                        <Badge variant={getTypeBadgeVariant(notification.type)} className="text-[10px] px-1.5 py-0">
                          {notification.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                        <span className="hidden sm:inline">
                          {format(new Date(notification.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!notification.read && (
                        <div className="w-2.5 h-2.5 rounded-full bg-primary" title="Unread" />
                      )}
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Mark as read"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </button>
              </CardContent>
            </Card>
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more notifications"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
