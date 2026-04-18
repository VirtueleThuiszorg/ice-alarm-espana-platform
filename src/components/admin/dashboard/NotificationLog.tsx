import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";

interface NotificationLogEntry {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  message: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

export function NotificationLog() {
  const queryClient = useQueryClient();

  const { data: logs, isLoading } = useQuery({
    queryKey: ["notification-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return data as NotificationLogEntry[];
    },
    refetchInterval: 30000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("notification-log-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_log",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notification-log"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Sent</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    switch (eventType) {
      case "sale.paid":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Sale</Badge>;
      case "partner.joined":
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">Partner</Badge>;
      case "hot.sales":
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">Hot</Badge>;
      case "test":
        return <Badge variant="outline">Test</Badge>;
      default:
        return <Badge variant="secondary">{eventType}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Notification Log
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Notification Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          {logs?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <History className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No notifications sent yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs?.map((log) => (
                <div 
                  key={log.id} 
                  className="flex items-center justify-between py-2 px-3 border-b last:border-0 hover:bg-muted/50 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getStatusIcon(log.status)}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {getEventTypeBadge(log.event_type)}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate max-w-[200px] mt-1">
                        {log.message?.substring(0, 50) || "No message"}...
                      </p>
                      {log.error && (
                        <p className="text-xs text-red-500 truncate max-w-[200px]">
                          {log.error}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(log.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
