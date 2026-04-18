import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ProvisioningStep {
  key: string;
  label: string;
  description: string;
  category: "hardware" | "network" | "contacts" | "testing";
  /** If true, this step can be auto-completed by an SMS command */
  smsCommand?: string;
}

export interface ProvisioningStepState {
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
}

export type ProvisioningChecklist = Record<string, ProvisioningStepState>;

/**
 * The 14-step EV-07B provisioning checklist definition.
 */
export const PROVISIONING_STEPS: ProvisioningStep[] = [
  // Hardware setup (steps 1-5)
  { key: "insert_sim", label: "Insert SIM Card", description: "Insert the activated SIM card into the EV-07B pendant. Ensure correct orientation with contacts facing down.", category: "hardware" },
  { key: "register_sim", label: "Register SIM in App", description: "Enter the SIM phone number and ICCID in the device record. This links the SIM to the pendant for SMS commands.", category: "hardware" },
  { key: "charge_pendant", label: "Charge Pendant", description: "Place pendant on the charging base. LED should show red (charging) then green (fully charged). Allow 2-3 hours for full charge.", category: "hardware" },
  { key: "pair_charging_base", label: "Pair Charging Base", description: "Record the charging base MAC address. This identifies the home location for the pendant.", category: "hardware" },
  { key: "power_on", label: "Power On Device", description: "Long-press the SOS button for 3 seconds to power on. The device will vibrate and LED will flash. Wait 30 seconds for network registration.", category: "hardware" },

  // Network configuration (steps 6-9)
  { key: "status_check", label: "Send Status Check", description: "Send STATUS# SMS to verify the device is reachable. Response confirms battery, signal, and GPS status.", category: "network", smsCommand: "STATUS#" },
  { key: "set_apn", label: "Set APN", description: "Configure the GPRS APN for the SIM carrier. Send APN,<name># to the device.", category: "network", smsCommand: "APN," },
  { key: "set_server", label: "Set Server IP/Port", description: "Configure the check-in server address. Send IP,<address>,<port># to the device.", category: "network", smsCommand: "IP," },
  { key: "set_sos", label: "Set SOS Number (A1)", description: "Set the primary emergency call number. Send A1,<phone># to the device. This is the number called when SOS button is pressed.", category: "contacts", smsCommand: "A1," },

  // System configuration (steps 10-11)
  { key: "set_reporting", label: "Set Reporting Mode", description: "Configure check-in interval. Send MODE,1,300# for 5-minute reporting. MODE,2 for intelligent (motion-based) mode.", category: "network", smsCommand: "MODE," },
  { key: "set_volume", label: "Set Volume Levels", description: "Set speaker and microphone volume. Send VOLUME,5,5# for medium levels (0-8 range).", category: "network", smsCommand: "VOLUME," },

  // Testing (steps 12-14)
  { key: "test_sos", label: "Test SOS Call", description: "Press the SOS button to trigger a test call. Verify the configured SOS number receives the call and two-way audio works.", category: "testing" },
  { key: "test_gps", label: "Test GPS Location", description: "Send LOC# to verify GPS is working. Take the device outdoors if needed. Confirm coordinates are accurate.", category: "testing", smsCommand: "LOC#" },
  { key: "mark_provisioned", label: "Mark as Provisioned", description: "Confirm all steps are complete. Device is ready for deployment to member. Configuration status will be set to 'configured'.", category: "testing" },
];

export const PROVISIONING_CATEGORIES = [
  { key: "hardware", label: "Hardware Setup", steps: [0, 1, 2, 3, 4] },
  { key: "network", label: "Network Configuration", steps: [5, 6, 7, 8, 9, 10] },
  { key: "contacts", label: "Emergency Contacts", steps: [8] },
  { key: "testing", label: "Testing & Verification", steps: [11, 12, 13] },
] as const;

function createEmptyChecklist(): ProvisioningChecklist {
  const checklist: ProvisioningChecklist = {};
  PROVISIONING_STEPS.forEach((step) => {
    checklist[step.key] = {
      completed: false,
      completed_at: null,
      completed_by: null,
      notes: null,
    };
  });
  return checklist;
}

export function useDeviceProvisioning(deviceId: string) {
  const queryClient = useQueryClient();
  const [checklist, setChecklist] = useState<ProvisioningChecklist>(createEmptyChecklist());

  /** Load existing checklist from device record */
  const loadChecklist = useCallback(async () => {
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("id", deviceId)
      .single();

    if (!error && (data as any)?.provisioning_checklist) {
      const existing = (data as any).provisioning_checklist as ProvisioningChecklist;
      // Merge with default to ensure all steps exist
      const merged = createEmptyChecklist();
      Object.keys(existing).forEach((key) => {
        if (merged[key]) {
          merged[key] = existing[key];
        }
      });
      setChecklist(merged);
    }
  }, [deviceId]);

  useEffect(() => {
    if (deviceId) loadChecklist();
  }, [deviceId, loadChecklist]);

  /** Complete a provisioning step */
  const completeStep = useMutation({
    mutationFn: async ({ stepKey, notes }: { stepKey: string; notes?: string }) => {
      const updated = { ...checklist };
      updated[stepKey] = {
        completed: true,
        completed_at: new Date().toISOString(),
        completed_by: (await supabase.auth.getUser()).data.user?.id || null,
        notes: notes || null,
      };

      // Check if this is the final step
      const allCompleted = PROVISIONING_STEPS.every((s) => updated[s.key]?.completed);

      const updateData: Record<string, any> = {
        provisioning_checklist: updated,
      };

      // If final step is marked complete, update configuration_status
      if (stepKey === "mark_provisioned" || allCompleted) {
        updateData.configuration_status = "configured";
      }

      const { error } = await supabase
        .from("devices")
        .update(updateData as any)
        .eq("id", deviceId);

      if (error) throw error;
      return updated;
    },
    onSuccess: (updated) => {
      setChecklist(updated);
      queryClient.invalidateQueries({ queryKey: ["admin-device-detail", deviceId] });
      toast.success("Step completed");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update checklist: ${error.message}`);
    },
  });

  /** Uncomplete a provisioning step (undo) */
  const uncompleteStep = useMutation({
    mutationFn: async ({ stepKey }: { stepKey: string }) => {
      const updated = { ...checklist };
      updated[stepKey] = {
        completed: false,
        completed_at: null,
        completed_by: null,
        notes: null,
      };

      const { error } = await supabase
        .from("devices")
        .update({
          provisioning_checklist: updated,
          configuration_status: "pending",
        } as any)
        .eq("id", deviceId);

      if (error) throw error;
      return updated;
    },
    onSuccess: (updated) => {
      setChecklist(updated);
      queryClient.invalidateQueries({ queryKey: ["admin-device-detail", deviceId] });
      toast.success("Step unmarked");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update checklist: ${error.message}`);
    },
  });

  /** Reset entire checklist */
  const resetChecklist = useMutation({
    mutationFn: async () => {
      const empty = createEmptyChecklist();
      const { error } = await supabase
        .from("devices")
        .update({
          provisioning_checklist: empty,
          configuration_status: "pending",
        } as any)
        .eq("id", deviceId);

      if (error) throw error;
      return empty;
    },
    onSuccess: (empty) => {
      setChecklist(empty);
      queryClient.invalidateQueries({ queryKey: ["admin-device-detail", deviceId] });
      toast.success("Checklist reset");
    },
  });

  // Compute progress
  const completedCount = PROVISIONING_STEPS.filter((s) => checklist[s.key]?.completed).length;
  const totalCount = PROVISIONING_STEPS.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const isFullyProvisioned = completedCount === totalCount;

  return {
    checklist,
    loadChecklist,
    completeStep,
    uncompleteStep,
    resetChecklist,
    completedCount,
    totalCount,
    progressPercent,
    isFullyProvisioned,
    PROVISIONING_STEPS,
  };
}
