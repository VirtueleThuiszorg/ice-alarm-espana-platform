import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SmsCommandEntry {
  command: string;
  label: string;
  sent_at: string;
  response?: string;
  received_at?: string;
  status: "sent" | "delivered" | "failed" | "timeout";
}

export interface SmsCommandDefinition {
  key: string;
  label: string;
  command: string;
  description: string;
  expectedResponse: string;
  category: "status" | "network" | "sos" | "gps" | "audio" | "led_ble" | "system";
  /** If true, command needs a parameter appended */
  requiresParam?: boolean;
  paramLabel?: string;
  paramPlaceholder?: string;
}

/**
 * Full EV-07B SMS command set, grouped by category.
 */
export const EV07B_COMMANDS: SmsCommandDefinition[] = [
  // Status commands
  { key: "status", label: "Status Check", command: "STATUS#", description: "Get device status summary", expectedResponse: "Status report with battery, signal, GPS, etc.", category: "status" },
  { key: "gprs", label: "GPRS Status", command: "GPRS?#", description: "Check GPRS data connection", expectedResponse: "GPRS connection status", category: "status" },
  { key: "version", label: "Firmware Version", command: "V?#", description: "Query firmware version", expectedResponse: "Firmware version number", category: "status" },
  { key: "address", label: "Address Query", command: "A?#", description: "Get current formatted address", expectedResponse: "Street address from GPS/LBS position", category: "status" },
  { key: "loc", label: "Location", command: "LOC#", description: "Request current GPS coordinates", expectedResponse: "Lat/lng coordinates", category: "status" },
  { key: "battery", label: "Battery Level", command: "BATTERY#", description: "Check battery percentage", expectedResponse: "Battery level percentage", category: "status" },

  // Network commands
  { key: "apn", label: "Set APN", command: "APN,", description: "Configure APN for GPRS connection", expectedResponse: "APN set OK", category: "network", requiresParam: true, paramLabel: "APN Name", paramPlaceholder: "e.g. internet" },
  { key: "ip_port", label: "Set Server IP/Port", command: "IP,", description: "Set check-in server address and port", expectedResponse: "IP set OK", category: "network", requiresParam: true, paramLabel: "IP:Port", paramPlaceholder: "e.g. 203.0.113.10,8080" },
  { key: "agps", label: "Enable AGPS", command: "AGPS1#", description: "Enable assisted GPS for faster fixes", expectedResponse: "AGPS ON", category: "network" },

  // SOS / Contact commands
  { key: "sos_a1", label: "Set SOS Number (A1)", command: "A1,", description: "Set primary SOS contact number", expectedResponse: "A1 set OK", category: "sos", requiresParam: true, paramLabel: "Phone Number", paramPlaceholder: "+34612345678" },
  { key: "sos_a2", label: "Set Contact A2", command: "A2,", description: "Set secondary SOS contact", expectedResponse: "A2 set OK", category: "sos", requiresParam: true, paramLabel: "Phone Number", paramPlaceholder: "+34612345678" },
  { key: "sos_a3", label: "Set Contact A3", command: "A3,", description: "Set tertiary SOS contact", expectedResponse: "A3 set OK", category: "sos", requiresParam: true, paramLabel: "Phone Number", paramPlaceholder: "+34612345678" },
  { key: "sos_b1", label: "Set SMS Alert B1", command: "B1,", description: "Set SMS-only alert contact 1", expectedResponse: "B1 set OK", category: "sos", requiresParam: true, paramLabel: "Phone Number", paramPlaceholder: "+34612345678" },
  { key: "sos_b2", label: "Set SMS Alert B2", command: "B2,", description: "Set SMS-only alert contact 2", expectedResponse: "B2 set OK", category: "sos", requiresParam: true, paramLabel: "Phone Number", paramPlaceholder: "+34612345678" },
  { key: "sos_b3", label: "Set SMS Alert B3", command: "B3,", description: "Set SMS-only alert contact 3", expectedResponse: "B3 set OK", category: "sos", requiresParam: true, paramLabel: "Phone Number", paramPlaceholder: "+34612345678" },

  // GPS commands
  { key: "lbs", label: "Enable LBS", command: "LBS1#", description: "Enable cell-tower location fallback", expectedResponse: "LBS ON", category: "gps" },
  { key: "mode", label: "Set Reporting Mode", command: "MODE,", description: "Set check-in interval/mode (1=time, 2=intelligent)", expectedResponse: "MODE set OK", category: "gps", requiresParam: true, paramLabel: "Mode,Interval", paramPlaceholder: "1,300 (time mode, 5min)" },

  // Audio commands
  { key: "volume", label: "Set Volume", command: "VOLUME,", description: "Set speaker and mic volume (0-8)", expectedResponse: "VOLUME set OK", category: "audio", requiresParam: true, paramLabel: "Speaker,Mic", paramPlaceholder: "5,5" },
  { key: "findme", label: "Find Device", command: "FINDME#", description: "Make the device ring to locate it", expectedResponse: "Device rings for ~30 seconds", category: "audio" },

  // LED / BLE commands
  { key: "led_on", label: "LED On", command: "LED1#", description: "Turn on the indicator LED", expectedResponse: "LED ON", category: "led_ble" },
  { key: "led_off", label: "LED Off", command: "LED0#", description: "Turn off the indicator LED", expectedResponse: "LED OFF", category: "led_ble" },
  { key: "ble", label: "BLE Pairing", command: "BLE#", description: "Enter Bluetooth pairing mode", expectedResponse: "BLE mode activated", category: "led_ble" },
  { key: "prefix", label: "Set Prefix", command: "PREFIX1#", description: "Enable command prefix requirement", expectedResponse: "PREFIX ON", category: "system" },
];

export const SMS_COMMAND_CATEGORIES = [
  { key: "status", label: "Status & Info" },
  { key: "network", label: "Network & APN" },
  { key: "sos", label: "SOS & Contacts" },
  { key: "gps", label: "GPS & Location" },
  { key: "audio", label: "Audio & Volume" },
  { key: "led_ble", label: "LED & Bluetooth" },
  { key: "system", label: "System" },
] as const;

interface SendCommandInput {
  deviceId: string;
  simPhoneNumber: string;
  command: string;
  label: string;
}

export function useDeviceSmsCommands(deviceId: string) {
  const queryClient = useQueryClient();
  const [commandLog, setCommandLog] = useState<SmsCommandEntry[]>([]);

  /** Load existing command log from device record */
  const loadCommandLog = useCallback(async () => {
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("id", deviceId)
      .single();

    if (!error && (data as any)?.sms_command_log) {
      setCommandLog((data as any).sms_command_log as SmsCommandEntry[]);
    }
  }, [deviceId]);

  /** Send an SMS command to the device */
  const sendCommand = useMutation({
    mutationFn: async ({ deviceId, simPhoneNumber, command, label }: SendCommandInput) => {
      const entry: SmsCommandEntry = {
        command,
        label,
        sent_at: new Date().toISOString(),
        status: "sent",
      };

      // Try to send via Twilio edge function
      try {
        const { data, error } = await supabase.functions.invoke("twilio-sms", {
          body: {
            to: simPhoneNumber,
            message: command,
            type: "device_command",
          },
        });

        if (error) {
          entry.status = "failed";
          entry.response = error.message;
        } else {
          entry.status = "delivered";
          entry.response = data?.message || "Command sent successfully";
        }
      } catch (err: any) {
        // If edge function fails (e.g. not deployed), log locally in manual mode
        entry.status = "sent";
        entry.response = "SMS queued — send manually if Twilio is not configured";
      }

      // Append to device's sms_command_log
      const { data: device } = await supabase
        .from("devices")
        .select("*")
        .eq("id", deviceId)
        .single();

      const existingLog = ((device as any)?.sms_command_log as SmsCommandEntry[] | null) || [];
      const updatedLog = [...existingLog, entry];

      await supabase
        .from("devices")
        .update({ sms_command_log: updatedLog } as any)
        .eq("id", deviceId);

      return entry;
    },
    onSuccess: (entry) => {
      setCommandLog((prev) => [...prev, entry]);
      queryClient.invalidateQueries({ queryKey: ["admin-device-detail", deviceId] });
      toast.success(`Command "${entry.label}" sent`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to send command: ${error.message}`);
    },
  });

  /** Clear the entire command log */
  const clearLog = useMutation({
    mutationFn: async () => {
      await supabase
        .from("devices")
        .update({ sms_command_log: [] } as any)
        .eq("id", deviceId);
    },
    onSuccess: () => {
      setCommandLog([]);
      toast.success("Command log cleared");
    },
  });

  return {
    commandLog,
    loadCommandLog,
    sendCommand,
    clearLog,
    isSending: sendCommand.isPending,
    EV07B_COMMANDS,
    SMS_COMMAND_CATEGORIES,
  };
}
