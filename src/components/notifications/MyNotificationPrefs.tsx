import { useQuery } from "@tanstack/react-query";
import { BellRing, Loader2, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  CHANNEL_LABELS,
  EVENT_SPECS,
  NOTIFY_CHANNELS,
  isAlwaysOn,
  prefEnabled,
  routeEnabled,
  type PrefRow,
  type RouteRow,
} from "@/lib/notifyMatrix";

/**
 * WHAT YOU WILL BE TOLD ABOUT — the staff-side view, deliberately READ-ONLY.
 *
 * The brief's rule: only super_admin and admin edit; staff see their own rows read-only. That is
 * not paternalism — it is a life-safety product, and an operator quietly switching off "nobody is
 * on duty" is the failure the switch would cause. So the row is shown, with the reason it cannot
 * be changed here, and who to ask.
 *
 * SHOWING NOTHING WOULD BE WORSE. An operator who cannot see what they are subscribed to cannot
 * tell "I was never told" from "I turned it off", and that ambiguity is exactly what the
 * notification log exists to remove.
 */
export function MyNotificationPrefs() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-notification-prefs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: staff } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!staff) return null;

      const [prefs, routes] = await Promise.all([
        supabase
          .from("staff_notification_prefs")
          .select("staff_id, event_type, channel, enabled")
          .eq("staff_id", staff.id),
        supabase.from("notification_routes").select("event_type, channel, enabled"),
      ]);

      // A held migration means these tables may not exist yet. That is a state, not an error.
      const missing =
        /does not exist/i.test(prefs.error?.message ?? "") ||
        /does not exist/i.test(routes.error?.message ?? "");

      return {
        missing,
        prefs: (prefs.data ?? []) as PrefRow[],
        routes: (routes.data ?? []) as RouteRow[],
        staffId: staff.id,
      };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5" aria-hidden="true" />
          What you will be told about
        </CardTitle>
        <CardDescription>
          {data.missing
            ? "Not set up yet — the notification tables have not been applied to this database."
            : "Read-only. An admin sets these: on a life-safety product, an operator quietly switching off “nobody is on duty” is the failure the switch would cause. Ask an admin to change anything here."}
        </CardDescription>
      </CardHeader>

      {!data.missing && (
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[14rem]">Event</TableHead>
                {NOTIFY_CHANNELS.map((channel) => (
                  <TableHead key={channel} className="text-center">
                    {CHANNEL_LABELS[channel]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {EVENT_SPECS.filter((spec) => spec.event !== "test").map((spec) => (
                <TableRow key={spec.event}>
                  <TableCell className="align-top">
                    <div className="font-medium">{spec.label}</div>
                    <div className="text-xs text-muted-foreground">{spec.detail}</div>
                  </TableCell>
                  {NOTIFY_CHANNELS.map((channel) => {
                    if (isAlwaysOn(spec.event)) {
                      return (
                        <TableCell key={channel} className="text-center">
                          <span
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                            title="Sent regardless. This event says the safety machinery itself has failed."
                          >
                            <Lock className="h-3 w-3" aria-hidden="true" />
                            always
                          </span>
                        </TableCell>
                      );
                    }
                    const mine = prefEnabled(data.prefs, data.staffId, spec.event, channel);
                    const policy = routeEnabled(data.routes, spec.event, channel);
                    return (
                      <TableCell key={channel} className="text-center">
                        {mine && policy ? (
                          <Badge variant="secondary">Yes</Badge>
                        ) : (
                          // Which of the two says no, because "no" alone leaves somebody
                          // wondering whether it is their setting or the company's.
                          <span className="text-xs text-muted-foreground">
                            {!policy ? "not sent to anyone" : "off for you"}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

export default MyNotificationPrefs;
