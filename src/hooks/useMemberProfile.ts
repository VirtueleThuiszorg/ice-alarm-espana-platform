import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MemberProfile {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  province: string;
  postal_code: string;
  country: string | null;
  nie_dni: string | null;
  preferred_language: "en" | "es";
  special_instructions: string | null;
  photo_url: string | null;
  status: string;
  created_at: string;
}

export interface MedicalInfo {
  id: string;
  member_id: string;
  medical_conditions: string[] | null;
  medications: string[] | null;
  allergies: string[] | null;
  blood_type: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  hospital_preference: string | null;
  additional_notes: string | null;
}

export interface EmergencyContact {
  id: string;
  member_id: string;
  contact_name: string;
  relationship: string;
  phone: string;
  email: string | null;
  is_primary: boolean;
  priority_order: number;
  speaks_spanish: boolean;
  notes: string | null;
}

export interface DeviceInfo {
  id: string;
  member_id: string | null;
  imei: string;
  sim_phone_number: string;
  device_type: string;
  status: string;
  battery_level: number | null;
  last_checkin_at: string | null;
  last_location_lat: number | null;
  last_location_lng: number | null;
  last_location_address: string | null;
  // EV-07B monitoring fields
  is_online: boolean | null;
  offline_since: string | null;
  model: string | null;
}

export interface SubscriptionInfo {
  id: string;
  member_id: string;
  plan_type: string | null;
  billing_frequency: string | null;
  amount: number | null;
  status: string;
  start_date: string | null;
  renewal_date: string | null;
  has_pendant: boolean | null;
  payment_method: string | null;
}

export interface AlertHistory {
  id: string;
  member_id: string;
  alert_type: string;
  status: string;
  received_at: string;
  resolved_at: string | null;
  location_address: string | null;
}

export function useMemberProfile() {
  const { memberId } = useAuth();

  return useQuery({
    queryKey: ["member-profile", memberId],
    queryFn: async () => {
      if (!memberId) throw new Error("No member ID");
      
      const { data, error } = await supabase
        .from("members")
        .select("*")
        .eq("id", memberId)
        .single();

      if (error) throw error;
      return data as MemberProfile;
    },
    enabled: !!memberId,
  });
}

export function useMedicalInfo() {
  const { memberId } = useAuth();

  return useQuery({
    queryKey: ["medical-info", memberId],
    queryFn: async () => {
      if (!memberId) throw new Error("No member ID");
      
      const { data, error } = await supabase
        .from("medical_information")
        .select("*")
        .eq("member_id", memberId)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as MedicalInfo | null;
    },
    enabled: !!memberId,
  });
}

export function useEmergencyContacts() {
  const { memberId } = useAuth();

  return useQuery({
    queryKey: ["emergency-contacts", memberId],
    queryFn: async () => {
      if (!memberId) throw new Error("No member ID");
      
      const { data, error } = await supabase
        .from("emergency_contacts")
        .select("*")
        .eq("member_id", memberId)
        .order("priority_order", { ascending: true });

      if (error) throw error;
      return data as EmergencyContact[];
    },
    enabled: !!memberId,
  });
}

export function useMemberDevice() {
  const { memberId } = useAuth();

  return useQuery({
    queryKey: ["member-device", memberId],
    queryFn: async () => {
      if (!memberId) throw new Error("No member ID");
      
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("member_id", memberId)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as DeviceInfo | null;
    },
    enabled: !!memberId,
  });
}

export function useMemberSubscription() {
  const { memberId } = useAuth();

  return useQuery({
    queryKey: ["member-subscription", memberId],
    queryFn: async () => {
      if (!memberId) throw new Error("No member ID");
      
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("member_id", memberId)
        .eq("status", "active")
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as SubscriptionInfo | null;
    },
    enabled: !!memberId,
  });
}

export function useMemberAlerts() {
  const { memberId } = useAuth();

  return useQuery({
    queryKey: ["member-alerts", memberId],
    queryFn: async () => {
      if (!memberId) throw new Error("No member ID");
      
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("member_id", memberId)
        .order("received_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as AlertHistory[];
    },
    enabled: !!memberId,
  });
}

export function useMemberPayments() {
  const { memberId } = useAuth();

  return useQuery({
    queryKey: ["member-payments", memberId],
    queryFn: async () => {
      if (!memberId) throw new Error("No member ID");
      
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: !!memberId,
  });
}
