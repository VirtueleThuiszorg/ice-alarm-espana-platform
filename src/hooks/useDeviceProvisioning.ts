import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { describeStatePosition, markOrderProgrammed } from "@/lib/allocatePendant";
import { FULFILMENT_LABEL } from "@/lib/fulfilmentState";

export interface ProvisioningStep {
  key: string;
  label: string;
  description: string;
  category: "hardware" | "network" | "contacts" | "testing";
  /** If true, this step can be auto-completed by an SMS command */
  smsCommand?: string;
}

/**
 * A type alias, not an interface, on purpose. `provisioning_checklist` is a
 * jsonb column, so this shape has to satisfy the generated `Json` type — and
 * an interface never does: TypeScript gives implicit index signatures to type
 * aliases but not to interfaces, so an interface fails Json's recursive
 * constraint no matter how JSON-shaped its fields are.
 */
export type ProvisioningStepState = {
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
};

export type ProvisioningChecklist = Record<string, ProvisioningStepState>;

// `provisioning_checklist` is now in the generated types as a Json column
// (it was missing until the 2026-09-02 types sync). These local aliases narrow
// that Json to the shape this hook actually reads and writes.
type DeviceWithChecklist = { provisioning_checklist?: ProvisioningChecklist | null };
type DeviceProvisioningUpdate = TablesUpdate<"devices"> & {
  provisioning_checklist?: ProvisioningChecklist;
};

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

    if (!error && (data as DeviceWithChecklist | null)?.provisioning_checklist) {
      const existing = (data as DeviceWithChecklist).provisioning_checklist as ProvisioningChecklist;
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

      const updateData: DeviceProvisioningUpdate = {
        provisioning_checklist: updated,
      };

      // If final step is marked complete, update configuration_status
      if (stepKey === "mark_provisioned" || allCompleted) {
        updateData.configuration_status = "configured";
      }

      const { error } = await supabase
        .from("devices")
        .update(updateData)
        .eq("id", deviceId);

      if (error) throw error;

      /*
        COMPLETING THE CHECKLIST *IS* THE `programmed` TRANSITION.

        The brief is explicit that this is not a separate button, and there is a reason beyond
        tidiness: a button would let staff assert a pendant is configured without configuring
        it. The only evidence that a pendant is programmed is that somebody worked through the
        fourteen steps, so the last step is where the state moves.

        Attempted only from `allocated`. `paid → programmed` is a skip the trigger refuses, and
        walking the order up two rungs to get around that would assert an allocation nothing
        here has checked. The outcome is returned rather than thrown: the fourteen steps are
        saved either way, and losing the checklist because the order was in an unexpected state
        would be losing the work to protect the bookkeeping.
      */
      const transition = allCompleted ? await markOrderProgrammed(deviceId) : null;

      return { updated, transition };
    },
    onSuccess: ({ updated, transition }) => {
      setChecklist(updated);
      queryClient.invalidateQueries({ queryKey: ["admin-device-detail", deviceId] });
      queryClient.invalidateQueries({ queryKey: ["member-fulfilment"] });
      toast.success("Step completed");

      if (!transition) return;
      if (transition.kind === "moved") {
        toast.success("Provisioning complete — the order is now programmed");
      } else if (transition.kind === "no_pendant_order") {
        toast.warning(
          "Provisioning complete, but this pendant is not on any order — so nothing records that it is programmed, and monitoring readiness cannot be reached for its member.",
        );
      } else if (transition.kind === "linked_no_transition") {
        const label = FULFILMENT_LABEL[transition.state];
        toast.info(
          `Provisioning complete. The order still reads "${label.fallback}" — ${describeStatePosition(transition.state, "programmed")}.`,
        );
      } else {
        toast.error(
          `Provisioning complete, but the order could not be moved to programmed: ${transition.message}`,
        );
      }
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
        } as DeviceProvisioningUpdate)
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
        } as DeviceProvisioningUpdate)
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
