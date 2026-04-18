import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface GdprExportData {
  exportDate: string;
  member: Record<string, unknown> | null;
  medicalInformation: Record<string, unknown> | null;
  emergencyContacts: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}

export function useGdprExport() {
  const { user, memberId } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  const exportData = async () => {
    if (!user || !memberId) {
      toast.error("You must be logged in to export your data.");
      return;
    }

    setIsExporting(true);

    try {
      // Fetch all member-related data in parallel
      const [
        memberResult,
        medicalResult,
        contactsResult,
        alertsResult,
        subscriptionsResult,
        paymentsResult,
      ] = await Promise.all([
        supabase
          .from("members")
          .select("*")
          .eq("id", memberId)
          .maybeSingle(),
        supabase
          .from("medical_information")
          .select("*")
          .eq("member_id", memberId)
          .maybeSingle(),
        supabase
          .from("emergency_contacts")
          .select("*")
          .eq("member_id", memberId),
        supabase
          .from("alerts")
          .select("*")
          .eq("member_id", memberId)
          .order("received_at", { ascending: false }),
        supabase
          .from("subscriptions")
          .select("*")
          .eq("member_id", memberId),
        supabase
          .from("payments")
          .select("*")
          .eq("member_id", memberId)
          .order("created_at", { ascending: false }),
      ]);

      // Check for critical errors
      if (memberResult.error) {
        throw new Error(`Failed to fetch member data: ${memberResult.error.message}`);
      }

      const exportPayload: GdprExportData = {
        exportDate: new Date().toISOString(),
        member: memberResult.data,
        medicalInformation: medicalResult.data ?? null,
        emergencyContacts: contactsResult.data ?? [],
        alerts: alertsResult.data ?? [],
        subscriptions: subscriptionsResult.data ?? [],
        payments: paymentsResult.data ?? [],
      };

      // Strip internal IDs that are not meaningful to the user
      // but keep member_id references for context
      const sanitizedPayload = JSON.stringify(exportPayload, null, 2);

      // Create and trigger download
      const blob = new Blob([sanitizedPayload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ice-alarm-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Your data export has been downloaded.");
    } catch (error) {
      console.error("GDPR data export failed:", error);
      toast.error("Failed to export your data. Please try again or contact support.");
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportData,
    isExporting,
    isAvailable: !!user && !!memberId,
  };
}
