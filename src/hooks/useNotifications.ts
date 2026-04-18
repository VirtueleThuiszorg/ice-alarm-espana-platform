import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type NotificationType = "alert" | "system" | "message" | "task";

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Maps a raw notification_log row to our NotificationRecord interface.
 * The actual table columns are: id, admin_user_id, event_type, entity_type,
 * entity_id, message, status, provider_message_id, error, created_at.
 */
function mapRow(row: Record<string, unknown>): NotificationRecord {
  return {
    id: row.id as string,
    type: (row.event_type as NotificationType) ?? "system",
    title: (row.event_type as string) ?? "Notification",
    message: (row.message as string) ?? "",
    read: (row.status as string) === "read",
    created_at: row.created_at as string,
    user_id: (row.admin_user_id as string) ?? null,
    metadata: {
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      status: row.status,
      provider_message_id: row.provider_message_id,
      error: row.error,
    } as Record<string, unknown>,
  };
}

interface UseNotificationsOptions {
  pageSize?: number;
  userId?: string | null;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { pageSize = 20, userId } = options;

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      let query = (supabase.from("notification_log") as any)
        .select("id", { count: "exact", head: true })
        .neq("status", "read");

      if (userId) {
        query = query.or(`admin_user_id.eq.${userId},admin_user_id.is.null`);
      }

      const { count, error } = await query;
      if (error) throw error;
      setUnreadCount(count ?? 0);
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  }, [userId]);

  // Fetch notifications with filters and pagination
  const fetchNotifications = useCallback(
    async (pageNum: number = 0, append: boolean = false) => {
      setIsLoading(true);
      try {
        let query = (supabase.from("notification_log") as any)
          .select("*")
          .order("created_at", { ascending: false })
          .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1);

        if (userId) {
          query = query.or(`admin_user_id.eq.${userId},admin_user_id.is.null`);
        }

        if (typeFilter !== "all") {
          query = query.eq("event_type", typeFilter);
        }

        if (readFilter === "read") {
          query = query.eq("status", "read");
        } else if (readFilter === "unread") {
          query = query.neq("status", "read");
        }

        const { data, error } = await query;
        if (error) throw error;

        const records = ((data as Record<string, unknown>[]) ?? []).map(mapRow);
        setHasMore(records.length === pageSize);

        if (append) {
          setNotifications((prev) => [...prev, ...records]);
        } else {
          setNotifications(records);
        }
      } catch (error) {
        console.error("Error fetching notifications:", error);
        toast.error("Failed to load notifications");
      } finally {
        setIsLoading(false);
      }
    },
    [userId, typeFilter, readFilter, pageSize]
  );

  // Mark a single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await (supabase.from("notification_log") as any)
        .update({ status: "read" })
        .eq("id", notificationId);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast.error("Failed to update notification");
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      let query = (supabase.from("notification_log") as any)
        .update({ status: "read" })
        .neq("status", "read");

      if (userId) {
        query = query.or(`admin_user_id.eq.${userId},admin_user_id.is.null`);
      }

      const { error } = await query;
      if (error) throw error;

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error("Failed to update notifications");
    }
  }, [userId]);

  // Load next page
  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, true);
  }, [page, fetchNotifications]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0);
    fetchNotifications(0, false);
  }, [typeFilter, readFilter, fetchNotifications]);

  // Fetch unread count on mount
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Real-time subscription
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel("notification-log-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_log" },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          const newNotification = mapRow(raw);

          if (userId && newNotification.user_id && newNotification.user_id !== userId) {
            return;
          }

          const matchesType = typeFilter === "all" || newNotification.type === typeFilter;
          const matchesRead =
            readFilter === "all" ||
            (readFilter === "unread" && !newNotification.read) ||
            (readFilter === "read" && newNotification.read);

          if (matchesType && matchesRead) {
            setNotifications((prev) => [newNotification, ...prev]);
          }

          if (!newNotification.read) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notification_log" },
        (payload) => {
          const updated = mapRow(payload.new as Record<string, unknown>);
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n))
          );
          fetchUnreadCount();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, typeFilter, readFilter, fetchUnreadCount]);

  return {
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
    refetch: () => {
      setPage(0);
      fetchNotifications(0, false);
      fetchUnreadCount();
    },
  };
}
