/**
 * useTwilioDevice — manages Twilio Voice SDK Device for staff browser calling.
 *
 * Fetches token from twilio-token edge function, creates Device, registers,
 * handles events, auto-refreshes tokens, and cleans up on unmount.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

export type DeviceStatus =
  | "idle"
  | "registering"
  | "registered"
  | "error"
  | "destroyed";

export interface UseTwilioDeviceReturn {
  device: Device | null;
  status: DeviceStatus;
  activeCall: Call | null;
  incomingCall: Call | null;
  connect: (params?: Record<string, string>) => Promise<Call | null>;
  disconnect: () => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  toggleMute: () => void;
  isMuted: boolean;
}

async function fetchToken(staffId: string): Promise<{
  token: string;
  identity: string;
} | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const res = await supabase.functions.invoke("twilio-token", {
    body: { staff_id: staffId },
  });

  if (res.error || !res.data?.token) {
    console.error("[useTwilioDevice] Token fetch failed:", res.error);
    return null;
  }

  return { token: res.data.token, identity: res.data.identity };
}

export function useTwilioDevice(): UseTwilioDeviceReturn {
  const { isStaff } = useAuth();
  const { data: staff } = useCurrentStaff();

  const [status, setStatus] = useState<DeviceStatus>("idle");
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const deviceRef = useRef<Device | null>(null);

  // Initialize Device
  useEffect(() => {
    if (!isStaff || !staff?.id) return;

    let cancelled = false;

    const init = async () => {
      setStatus("registering");

      const tokenData = await fetchToken(staff.id);
      if (!tokenData || cancelled) {
        if (!cancelled) setStatus("error");
        return;
      }

      const device = new Device(tokenData.token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      device.on("registered", () => {
        if (!cancelled) setStatus("registered");
      });

      device.on("error", (err) => {
        console.error("[useTwilioDevice] Device error:", err);
        if (!cancelled) setStatus("error");
      });

      device.on("incoming", (call: Call) => {
        if (!cancelled) setIncomingCall(call);

        call.on("cancel", () => {
          if (!cancelled) setIncomingCall(null);
        });
        call.on("disconnect", () => {
          if (!cancelled) {
            setIncomingCall(null);
            setActiveCall(null);
            setIsMuted(false);
          }
        });
      });

      device.on("tokenWillExpire", async () => {
        console.log("[useTwilioDevice] Refreshing token...");
        const newTokenData = await fetchToken(staff.id);
        if (newTokenData && !cancelled) {
          device.updateToken(newTokenData.token);
        }
      });

      try {
        await device.register();
        if (!cancelled) {
          deviceRef.current = device;
        } else {
          device.unregister();
          device.destroy();
        }
      } catch (err) {
        console.error("[useTwilioDevice] Registration failed:", err);
        if (!cancelled) setStatus("error");
        device.destroy();
      }
    };

    init();

    return () => {
      cancelled = true;
      if (deviceRef.current) {
        deviceRef.current.unregister();
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
      setStatus("destroyed");
      setActiveCall(null);
      setIncomingCall(null);
      setIsMuted(false);
    };
  }, [isStaff, staff?.id]);

  const connect = useCallback(
    async (params?: Record<string, string>): Promise<Call | null> => {
      const device = deviceRef.current;
      if (!device) return null;

      try {
        const call = await device.connect({ params });
        setActiveCall(call);
        setIsMuted(false);

        call.on("disconnect", () => {
          setActiveCall(null);
          setIsMuted(false);
        });
        call.on("cancel", () => {
          setActiveCall(null);
          setIsMuted(false);
        });

        return call;
      } catch (err) {
        console.error("[useTwilioDevice] Connect failed:", err);
        return null;
      }
    },
    [],
  );

  const disconnect = useCallback(() => {
    if (activeCall) {
      activeCall.disconnect();
      setActiveCall(null);
      setIsMuted(false);
    }
  }, [activeCall]);

  const acceptIncoming = useCallback(() => {
    if (incomingCall) {
      incomingCall.accept();
      setActiveCall(incomingCall);
      setIncomingCall(null);
      setIsMuted(false);

      incomingCall.on("disconnect", () => {
        setActiveCall(null);
        setIsMuted(false);
      });
    }
  }, [incomingCall]);

  const rejectIncoming = useCallback(() => {
    if (incomingCall) {
      incomingCall.reject();
      setIncomingCall(null);
    }
  }, [incomingCall]);

  const toggleMute = useCallback(() => {
    const call = activeCall;
    if (!call) return;

    const newMuted = !call.isMuted();
    call.mute(newMuted);
    setIsMuted(newMuted);
  }, [activeCall]);

  return {
    device: deviceRef.current,
    status,
    activeCall,
    incomingCall,
    connect,
    disconnect,
    acceptIncoming,
    rejectIncoming,
    toggleMute,
    isMuted,
  };
}
