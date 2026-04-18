import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePartnerStats(partnerId: string | undefined) {
  return useQuery({
    queryKey: ["partner-stats", partnerId],
    queryFn: async () => {
      const [
        invitesResult,
        registrationsResult,
        commissionsResult,
      ] = await Promise.all([
        // Total invites sent
        supabase
          .from("partner_invites")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partnerId!)
          .neq("status", "draft"),

        // Total registrations (converted invites)
        supabase
          .from("partner_invites")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partnerId!)
          .in("status", ["registered", "converted"]),

        // Commissions breakdown
        supabase
          .from("partner_commissions")
          .select("status, amount_eur")
          .eq("partner_id", partnerId!),
      ]);

      // Get delivered count from attributions + orders
      const { count: deliveredCount } = await supabase
        .from("partner_commissions")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId!)
        .eq("trigger_event", "device_delivered");

      // Calculate commission totals by status
      const commissions = commissionsResult.data || [];
      const pendingCommission = commissions
        .filter((c) => c.status === "pending_release")
        .reduce((sum, c) => sum + Number(c.amount_eur), 0);
      const approvedCommission = commissions
        .filter((c) => c.status === "approved")
        .reduce((sum, c) => sum + Number(c.amount_eur), 0);
      const paidCommission = commissions
        .filter((c) => c.status === "paid")
        .reduce((sum, c) => sum + Number(c.amount_eur), 0);

      return {
        totalInvitesSent: invitesResult.count || 0,
        totalRegistrations: registrationsResult.count || 0,
        totalDelivered: deliveredCount || 0,
        pendingCommission,
        approvedCommission,
        paidCommission,
      };
    },
    enabled: !!partnerId,
    staleTime: 2 * 60 * 1000, // 2 minutes - stats can be slightly stale
  });
}
