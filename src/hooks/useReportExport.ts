import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { exportToCsv, type CsvColumnConfig } from "@/lib/csvExporter";

/**
 * Hook that provides CSV export functions for admin reports.
 * Each export function fetches data from Supabase and triggers a CSV download.
 */
export function useReportExport() {
  const [isExporting, setIsExporting] = useState(false);

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  const timestamp = () => {
    const now = new Date();
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  /** Generic wrapper that handles loading state and error toasts. */
  const withExportGuard = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (isExporting) return;
      setIsExporting(true);
      try {
        await fn();
        toast({
          title: "Export complete",
          description: `${label} exported successfully.`,
        });
      } catch (error) {
        console.error(`Export failed (${label}):`, error);
        toast({
          title: "Export failed",
          description: `Could not export ${label}. Please try again.`,
          variant: "destructive",
        });
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting],
  );

  // -------------------------------------------------------------------
  // Export: Members
  // -------------------------------------------------------------------

  const exportMembersCsv = useCallback(async () => {
    await withExportGuard("Members", async () => {
      const { data, error } = await supabase
        .from("members")
        .select(
          "id, first_name, last_name, email, phone, date_of_birth, address_line_1, address_line_2, city, province, postal_code, country, preferred_language, status, nie_dni, created_at",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "No data", description: "There are no members to export." });
        return;
      }

      const columns: CsvColumnConfig<(typeof data)[number]>[] = [
        { key: "id", header: "ID" },
        { key: "first_name", header: "First Name" },
        { key: "last_name", header: "Last Name" },
        { key: "email", header: "Email" },
        { key: "phone", header: "Phone" },
        { key: "nie_dni", header: "NIE/DNI" },
        { key: "date_of_birth", header: "Date of Birth" },
        { key: "address_line_1", header: "Address Line 1" },
        { key: "address_line_2", header: "Address Line 2" },
        { key: "city", header: "City" },
        { key: "province", header: "Province" },
        { key: "postal_code", header: "Postal Code" },
        { key: "country", header: "Country" },
        { key: "preferred_language", header: "Language" },
        { key: "status", header: "Status" },
        {
          key: "created_at",
          header: "Registered",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
      ];

      exportToCsv(data as Record<string, unknown>[], `members-${timestamp()}.csv`, columns as CsvColumnConfig<Record<string, unknown>>[]);
    });
  }, [withExportGuard]);

  // -------------------------------------------------------------------
  // Export: Payments
  // -------------------------------------------------------------------

  const exportPaymentsCsv = useCallback(async () => {
    await withExportGuard("Payments", async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, invoice_number, amount, payment_method, payment_type, status, paid_at, created_at, member_id, order_id, notes",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "No data", description: "There are no payments to export." });
        return;
      }

      const columns: CsvColumnConfig<(typeof data)[number]>[] = [
        { key: "id", header: "ID" },
        { key: "invoice_number", header: "Invoice Number" },
        {
          key: "amount",
          header: "Amount (EUR)",
          formatter: (v) => (typeof v === "number" ? v.toFixed(2) : ""),
        },
        { key: "payment_method", header: "Method" },
        { key: "payment_type", header: "Type" },
        { key: "status", header: "Status" },
        {
          key: "paid_at",
          header: "Paid At",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
        { key: "member_id", header: "Member ID" },
        { key: "order_id", header: "Order ID" },
        { key: "notes", header: "Notes" },
        {
          key: "created_at",
          header: "Created",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
      ];

      exportToCsv(data as Record<string, unknown>[], `payments-${timestamp()}.csv`, columns as CsvColumnConfig<Record<string, unknown>>[]);
    });
  }, [withExportGuard]);

  // -------------------------------------------------------------------
  // Export: Alerts
  // -------------------------------------------------------------------

  const exportAlertsCsv = useCallback(async () => {
    await withExportGuard("Alerts", async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select(
          "id, alert_type, status, member_id, device_id, location_address, received_at, resolved_at, resolution_notes, emergency_services_called, next_of_kin_notified",
        )
        .order("received_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "No data", description: "There are no alerts to export." });
        return;
      }

      const columns: CsvColumnConfig<(typeof data)[number]>[] = [
        { key: "id", header: "ID" },
        { key: "alert_type", header: "Alert Type" },
        { key: "status", header: "Status" },
        { key: "member_id", header: "Member ID" },
        { key: "device_id", header: "Device ID" },
        { key: "location_address", header: "Location" },
        {
          key: "received_at",
          header: "Received",
          formatter: (v) =>
            v ? new Date(v as string).toLocaleString("en-GB") : "",
        },
        {
          key: "resolved_at",
          header: "Resolved",
          formatter: (v) =>
            v ? new Date(v as string).toLocaleString("en-GB") : "",
        },
        { key: "resolution_notes", header: "Resolution Notes" },
        {
          key: "emergency_services_called",
          header: "Emergency Called",
          formatter: (v) => (v === true ? "Yes" : v === false ? "No" : ""),
        },
        {
          key: "next_of_kin_notified",
          header: "Next of Kin Notified",
          formatter: (v) => (v === true ? "Yes" : v === false ? "No" : ""),
        },
      ];

      exportToCsv(data as Record<string, unknown>[], `alerts-${timestamp()}.csv`, columns as CsvColumnConfig<Record<string, unknown>>[]);
    });
  }, [withExportGuard]);

  // -------------------------------------------------------------------
  // Export: Partners
  // -------------------------------------------------------------------

  const exportPartnersCsv = useCallback(async () => {
    await withExportGuard("Partners", async () => {
      const { data, error } = await supabase
        .from("partners")
        .select(
          "id, contact_name, company_name, email, phone, partner_type, status, referral_code, payout_method, payout_iban, billing_model, preferred_language, created_at",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "No data", description: "There are no partners to export." });
        return;
      }

      const columns: CsvColumnConfig<(typeof data)[number]>[] = [
        { key: "id", header: "ID" },
        { key: "contact_name", header: "Contact Name" },
        { key: "company_name", header: "Company Name" },
        { key: "email", header: "Email" },
        { key: "phone", header: "Phone" },
        { key: "partner_type", header: "Type" },
        { key: "status", header: "Status" },
        { key: "referral_code", header: "Referral Code" },
        { key: "payout_method", header: "Payout Method" },
        { key: "payout_iban", header: "IBAN" },
        { key: "billing_model", header: "Billing Model" },
        { key: "preferred_language", header: "Language" },
        {
          key: "created_at",
          header: "Joined",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
      ];

      exportToCsv(data as Record<string, unknown>[], `partners-${timestamp()}.csv`, columns as CsvColumnConfig<Record<string, unknown>>[]);
    });
  }, [withExportGuard]);

  // -------------------------------------------------------------------
  // Export: Commissions
  // -------------------------------------------------------------------

  const exportCommissionsCsv = useCallback(async () => {
    await withExportGuard("Commissions", async () => {
      const { data, error } = await supabase
        .from("partner_commissions")
        .select(
          "id, partner_id, member_id, order_id, amount_eur, status, trigger_event, trigger_at, release_at, approved_at, paid_at, cancel_reason, created_at",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "No data", description: "There are no commissions to export." });
        return;
      }

      const columns: CsvColumnConfig<(typeof data)[number]>[] = [
        { key: "id", header: "ID" },
        { key: "partner_id", header: "Partner ID" },
        { key: "member_id", header: "Member ID" },
        { key: "order_id", header: "Order ID" },
        {
          key: "amount_eur",
          header: "Amount (EUR)",
          formatter: (v) => (typeof v === "number" ? v.toFixed(2) : ""),
        },
        { key: "status", header: "Status" },
        { key: "trigger_event", header: "Trigger Event" },
        {
          key: "trigger_at",
          header: "Triggered",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
        {
          key: "release_at",
          header: "Release Date",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
        {
          key: "approved_at",
          header: "Approved",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
        {
          key: "paid_at",
          header: "Paid",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
        { key: "cancel_reason", header: "Cancel Reason" },
        {
          key: "created_at",
          header: "Created",
          formatter: (v) => (v ? new Date(v as string).toLocaleDateString("en-GB") : ""),
        },
      ];

      exportToCsv(data as Record<string, unknown>[], `commissions-${timestamp()}.csv`, columns as CsvColumnConfig<Record<string, unknown>>[]);
    });
  }, [withExportGuard]);

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  return {
    isExporting,
    exportMembersCsv,
    exportPaymentsCsv,
    exportAlertsCsv,
    exportPartnersCsv,
    exportCommissionsCsv,
  };
}
