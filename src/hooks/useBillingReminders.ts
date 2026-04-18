import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OverdueSubscription {
  id: string;
  member_id: string;
  plan_type: string;
  amount: number;
  renewal_date: string;
  status: string | null;
  billing_frequency: string;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  } | null;
}

interface FailedPayment {
  id: string;
  member_id: string;
  amount: number;
  payment_method: string;
  payment_type: string;
  status: string | null;
  created_at: string | null;
  notes: string | null;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  } | null;
}

interface BillingHealth {
  totalActive: number;
  overdueCount: number;
  failedPaymentCount: number;
  atRiskCount: number;
}

export function useBillingReminders() {
  const [overdueSubscriptions, setOverdueSubscriptions] = useState<OverdueSubscription[]>([]);
  const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([]);
  const [billingHealth, setBillingHealth] = useState<BillingHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const fetchOverdueSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id, member_id, plan_type, amount, renewal_date, status, billing_frequency,
          member:members(id, first_name, last_name, email, phone)
        `)
        .eq("status", "active")
        .lt("renewal_date", now)
        .order("renewal_date", { ascending: true });

      if (error) throw error;

      const mapped: OverdueSubscription[] = (data || []).map((sub: any) => ({
        id: sub.id,
        member_id: sub.member_id,
        plan_type: sub.plan_type,
        amount: sub.amount,
        renewal_date: sub.renewal_date,
        status: sub.status,
        billing_frequency: sub.billing_frequency,
        member: sub.member
          ? {
              id: sub.member.id,
              first_name: sub.member.first_name,
              last_name: sub.member.last_name,
              email: sub.member.email,
              phone: sub.member.phone,
            }
          : null,
      }));

      setOverdueSubscriptions(mapped);
      return mapped;
    } catch (error) {
      console.error("Error fetching overdue subscriptions:", error);
      toast.error("Failed to load overdue subscriptions");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchFailedPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("payments")
        .select(`
          id, member_id, amount, payment_method, payment_type, status, created_at, notes,
          member:members(id, first_name, last_name, email, phone)
        `)
        .eq("status", "failed")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: FailedPayment[] = (data || []).map((payment: any) => ({
        id: payment.id,
        member_id: payment.member_id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        payment_type: payment.payment_type,
        status: payment.status,
        created_at: payment.created_at,
        notes: payment.notes,
        member: payment.member
          ? {
              id: payment.member.id,
              first_name: payment.member.first_name,
              last_name: payment.member.last_name,
              email: payment.member.email,
              phone: payment.member.phone,
            }
          : null,
      }));

      setFailedPayments(mapped);
      return mapped;
    } catch (error) {
      console.error("Error fetching failed payments:", error);
      toast.error("Failed to load failed payments");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendReminder = useCallback(
    async (memberId: string, type: "overdue_subscription" | "failed_payment" | "renewal_warning") => {
      setIsSending(true);
      try {
        // Fetch member details for the email
        const { data: member, error: memberError } = await supabase
          .from("members")
          .select("id, first_name, last_name, email")
          .eq("id", memberId)
          .single();

        if (memberError || !member) {
          throw new Error("Member not found");
        }

        const templateMap: Record<string, string> = {
          overdue_subscription: "billing_overdue",
          failed_payment: "payment_failed",
          renewal_warning: "renewal_reminder",
        };

        const subjectMap: Record<string, string> = {
          overdue_subscription: "Your ICE Alarm Espana subscription is overdue",
          failed_payment: "Payment failed - Action required",
          renewal_warning: "Your ICE Alarm Espana subscription renewal is approaching",
        };

        const { error } = await supabase.functions.invoke("send-email", {
          body: {
            to: member.email,
            subject: subjectMap[type],
            template: templateMap[type],
            data: {
              firstName: member.first_name,
              lastName: member.last_name,
              memberId: member.id,
              reminderType: type,
            },
          },
        });

        if (error) throw error;

        toast.success(
          `Reminder sent to ${member.first_name} ${member.last_name}`
        );
        return true;
      } catch (error) {
        console.error("Error sending reminder:", error);
        toast.error("Failed to send billing reminder");
        return false;
      } finally {
        setIsSending(false);
      }
    },
    []
  );

  const getBillingHealth = useCallback(async (): Promise<BillingHealth> => {
    try {
      const now = new Date().toISOString();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Fetch all counts in parallel
      const [activeResult, overdueResult, failedResult] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .lt("renewal_date", now),
        supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed")
          .gte("created_at", thirtyDaysAgo.toISOString()),
      ]);

      const totalActive = activeResult.count || 0;
      const overdueCount = overdueResult.count || 0;
      const failedPaymentCount = failedResult.count || 0;

      // At-risk: members with both overdue subscription AND failed payment
      // Use the higher of the two as a conservative estimate
      const atRiskCount = Math.min(overdueCount, failedPaymentCount);

      const health: BillingHealth = {
        totalActive,
        overdueCount,
        failedPaymentCount,
        atRiskCount,
      };

      setBillingHealth(health);
      return health;
    } catch (error) {
      console.error("Error fetching billing health:", error);
      toast.error("Failed to load billing health data");
      const fallback: BillingHealth = {
        totalActive: 0,
        overdueCount: 0,
        failedPaymentCount: 0,
        atRiskCount: 0,
      };
      setBillingHealth(fallback);
      return fallback;
    }
  }, []);

  return {
    overdueSubscriptions,
    failedPayments,
    billingHealth,
    isLoading,
    isSending,
    fetchOverdueSubscriptions,
    fetchFailedPayments,
    sendReminder,
    getBillingHealth,
  };
}
