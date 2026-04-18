import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";

interface MonthlyStats {
  month: string;
  invites_sent: number;
  registrations: number;
}

export function usePartnerMonthlyStats(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner-monthly-stats", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      // Get last 6 months of data from partner_invites
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data: invites, error } = await supabase
        .from("partner_invites")
        .select("created_at, status")
        .eq("partner_id", partnerId)
        .gte("created_at", sixMonthsAgo.toISOString());

      if (error) throw error;

      // Group by month
      const monthMap = new Map<string, { invites_sent: number; registrations: number }>();

      // Initialize last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, { invites_sent: 0, registrations: 0 });
      }

      // Fill in data
      for (const invite of invites || []) {
        const d = new Date(invite.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const entry = monthMap.get(key);
        if (entry) {
          if (invite.status !== "draft") {
            entry.invites_sent++;
          }
          if (invite.status === "registered" || invite.status === "converted") {
            entry.registrations++;
          }
        }
      }

      // Convert to array with formatted month names
      const result: MonthlyStats[] = [];
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      for (const [key, value] of monthMap) {
        const monthIndex = parseInt(key.split("-")[1]) - 1;
        result.push({
          month: monthNames[monthIndex],
          invites_sent: value.invites_sent,
          registrations: value.registrations,
        });
      }

      return result;
    },
    enabled: !!partnerId,
    staleTime: STALE_TIMES.MEDIUM,
  });
}
