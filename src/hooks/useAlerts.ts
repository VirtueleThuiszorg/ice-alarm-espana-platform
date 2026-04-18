import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Tables } from "@/integrations/supabase/types";
import { useBrowserNotifications } from "./useBrowserNotifications";

type Alert = Tables<"alerts">;

export interface EnrichedAlert {
  id: string;
  type: "sos_button" | "fall_detected" | "low_battery" | "geo_fence" | "check_in" | "manual" | "device_offline";
  status: "incoming" | "in_progress" | "resolved" | "escalated";
  memberName: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  medicalConditions?: string[];
  receivedAt: Date;
  member?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    photoUrl?: string;
    preferredLanguage: string;
    dateOfBirth: string;
    address: string;
    specialInstructions?: string;
  };
  medicalInfo?: {
    conditions: string[];
    medications: string[];
    allergies: string[];
    bloodType?: string | null;
    doctorName?: string | null;
    doctorPhone?: string | null;
    hospitalPreference?: string | null;
  };
  device?: {
    id: string;
    status: string;
    batteryLevel?: number;
    lastCheckin?: Date;
    imei: string;
  };
  emergencyContacts?: {
    id: string;
    name: string;
    relationship: string;
    phone: string;
    email?: string;
    speaksSpanish: boolean;
    priorityOrder: number;
  }[];
  subscription?: {
    planType: string;
    hasPendant: boolean | null;
  };
  previousAlerts?: {
    id: string;
    type: "sos_button" | "fall_detected" | "low_battery" | "geo_fence" | "check_in" | "manual" | "device_offline";
    receivedAt: Date;
    resolvedAt?: Date;
  }[];
}

// Audio notification
const playAlertSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    // Audio API not supported in this browser
  }
};

export function useAlerts() {
  const [alerts, setAlerts] = useState<EnrichedAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const alertsRef = useRef<EnrichedAlert[]>([]);
  const { showAlertNotification, requestPermission, permission } = useBrowserNotifications();

  // Request notification permission on mount
  useEffect(() => {
    if (permission === "default") {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const fetchAlertDetails = async (alertId: string): Promise<EnrichedAlert | null> => {
    try {
      const { data: alert, error } = await supabase
        .from("alerts")
        .select(`
          *,
          member:members (
            id,
            first_name,
            last_name,
            phone,
            email,
            photo_url,
            preferred_language,
            date_of_birth,
            address_line_1,
            address_line_2,
            city,
            province,
            special_instructions
          ),
          device:devices (
            id,
            status,
            battery_level,
            last_checkin_at,
            imei
          )
        `)
        .eq("id", alertId)
        .single();

      if (error || !alert) return null;

      // Fetch additional data
      const [medicalData, contactsData, subscriptionData, previousAlertsData] = await Promise.all([
        supabase.from("medical_information").select("*").eq("member_id", alert.member_id).single(),
        supabase.from("emergency_contacts").select("*").eq("member_id", alert.member_id).order("priority_order"),
        supabase.from("subscriptions").select("*").eq("member_id", alert.member_id).eq("status", "active").single(),
        supabase.from("alerts").select("id, alert_type, received_at, resolved_at").eq("member_id", alert.member_id).neq("id", alertId).order("received_at", { ascending: false }).limit(5),
      ]);

      const member = alert.member as any;
      const device = alert.device as any;
      const medical = medicalData.data;
      const contacts = contactsData.data || [];
      const subscription = subscriptionData.data;
      const previousAlerts = previousAlertsData.data || [];

      return {
        id: alert.id,
        type: alert.alert_type as EnrichedAlert["type"],
        status: alert.status as EnrichedAlert["status"],
        memberName: member ? `${member.first_name} ${member.last_name}` : "Unknown",
        location: alert.location_address || undefined,
        locationLat: alert.location_lat ? Number(alert.location_lat) : undefined,
        locationLng: alert.location_lng ? Number(alert.location_lng) : undefined,
        medicalConditions: medical?.medical_conditions || [],
        receivedAt: new Date(alert.received_at || new Date()),
        member: member ? {
          id: member.id,
          firstName: member.first_name,
          lastName: member.last_name,
          phone: member.phone,
          email: member.email,
          photoUrl: member.photo_url,
          preferredLanguage: member.preferred_language,
          dateOfBirth: member.date_of_birth,
          address: `${member.address_line_1}${member.address_line_2 ? ', ' + member.address_line_2 : ''}, ${member.city}, ${member.province}`,
          specialInstructions: member.special_instructions,
        } : undefined,
        medicalInfo: medical ? {
          conditions: medical.medical_conditions || [],
          medications: medical.medications || [],
          allergies: medical.allergies || [],
          bloodType: medical.blood_type,
          doctorName: medical.doctor_name,
          doctorPhone: medical.doctor_phone,
          hospitalPreference: medical.hospital_preference,
        } : undefined,
        device: device ? {
          id: device.id,
          status: device.status,
          batteryLevel: device.battery_level,
          lastCheckin: device.last_checkin_at ? new Date(device.last_checkin_at) : undefined,
          imei: device.imei,
        } : undefined,
        emergencyContacts: contacts.map((c: any) => ({
          id: c.id,
          name: c.contact_name,
          relationship: c.relationship,
          phone: c.phone,
          email: c.email,
          speaksSpanish: c.speaks_spanish,
          priorityOrder: c.priority_order,
        })),
        subscription: subscription ? {
          planType: subscription.plan_type,
          hasPendant: subscription.has_pendant,
        } : undefined,
        previousAlerts: previousAlerts.map((a: any) => ({
          id: a.id,
          type: a.alert_type,
          receivedAt: new Date(a.received_at),
          resolvedAt: a.resolved_at ? new Date(a.resolved_at) : undefined,
        })),
      };
    } catch (error) {
      console.error("Error fetching alert details:", error);
      return null;
    }
  };

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select(`
          *,
          member:members (
            id,
            first_name,
            last_name,
            phone
          )
        `)
        .in("status", ["incoming", "in_progress", "escalated"])
        .order("received_at", { ascending: false });

      if (error) throw error;

      const enrichedAlerts: EnrichedAlert[] = (data || []).map((alert: any) => {
        const member = alert.member;
        return {
          id: alert.id,
          type: alert.alert_type,
          status: alert.status,
          memberName: member ? `${member.first_name} ${member.last_name}` : "Unknown",
          location: alert.location_address,
          locationLat: alert.location_lat ? Number(alert.location_lat) : undefined,
          locationLng: alert.location_lng ? Number(alert.location_lng) : undefined,
          receivedAt: new Date(alert.received_at || new Date()),
        };
      });

      setAlerts(enrichedAlerts);
      alertsRef.current = enrichedAlerts;
    } catch (error) {
      console.error("Error fetching alerts:", error);
      toast({ title: "Error", description: "Failed to load alerts", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const claimAlert = async (alertId: string) => {
    try {
      const { data: staffData } = await supabase.auth.getUser();
      const { data: staff } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", staffData.user?.id ?? "")
        .single();

      const { error } = await supabase
        .from("alerts")
        .update({
          status: "in_progress",
          claimed_by: staff?.id,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, status: "in_progress" as const } : alert
      ));

      return await fetchAlertDetails(alertId);
    } catch (error) {
      console.error("Error claiming alert:", error);
      toast({ title: "Error", description: "Failed to claim alert", variant: "destructive" });
      return null;
    }
  };

  const resolveAlert = async (alertId: string, notes: string) => {
    try {
      const { error } = await supabase
        .from("alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolution_notes: notes,
        })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      toast({ title: "Alert resolved", description: "The alert has been marked as resolved" });
    } catch (error) {
      console.error("Error resolving alert:", error);
      toast({ title: "Error", description: "Failed to resolve alert", variant: "destructive" });
    }
  };

  const escalateAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("alerts")
        .update({ status: "escalated" })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, status: "escalated" as const } : alert
      ));

      toast({ title: "Alert escalated", description: "Admin has been notified" });
    } catch (error) {
      console.error("Error escalating alert:", error);
      toast({ title: "Error", description: "Failed to escalate alert", variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Set up realtime subscription
    const channel = supabase
      .channel("alerts-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
        },
        async (payload: RealtimePostgresChangesPayload<Alert>) => {
          if (payload.eventType === "INSERT") {
            const newAlert = payload.new;
            
            // Play sound and show notifications for new incoming alerts
            if (newAlert.status === "incoming") {
              playAlertSound();
              toast({
                title: "New Alert!",
                description: `${newAlert.alert_type.replace("_", " ").toUpperCase()} received`,
                variant: "destructive",
              });
            }

            // Fetch member details for the new alert and browser notification
            const { data: memberDataForAlert } = await supabase
              .from("members")
              .select("first_name, last_name")
              .eq("id", newAlert.member_id)
              .single();

            // Show browser notification
            if (memberDataForAlert) {
              showAlertNotification(
                newAlert.alert_type,
                `${memberDataForAlert.first_name} ${memberDataForAlert.last_name}`
              );
            }

            const enrichedAlert: EnrichedAlert = {
              id: newAlert.id,
              type: newAlert.alert_type as EnrichedAlert["type"],
              status: newAlert.status as EnrichedAlert["status"],
              memberName: memberDataForAlert ? `${memberDataForAlert.first_name} ${memberDataForAlert.last_name}` : "Unknown",
              location: newAlert.location_address || undefined,
              locationLat: newAlert.location_lat ? Number(newAlert.location_lat) : undefined,
              locationLng: newAlert.location_lng ? Number(newAlert.location_lng) : undefined,
              receivedAt: new Date(newAlert.received_at || new Date()),
            };

            setAlerts(prev => [enrichedAlert, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updatedAlert = payload.new;
            
            if (updatedAlert.status === "resolved") {
              setAlerts(prev => prev.filter(a => a.id !== updatedAlert.id));
            } else {
              setAlerts(prev => prev.map(alert => 
                alert.id === updatedAlert.id 
                  ? { ...alert, status: updatedAlert.status as EnrichedAlert["status"] }
                  : alert
              ));
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            setAlerts(prev => prev.filter(a => a.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    alerts,
    isLoading,
    claimAlert,
    resolveAlert,
    escalateAlert,
    fetchAlertDetails,
    refetch: fetchAlerts,
  };
}
