import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import type { SubscriptionStatus } from "@/lib/membershipCondition";

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

/**
 * THE GENERATED ROW, not a hand-written subset.
 *
 * This was an interface listing EIGHT of the sixteen columns `medical_information` holds — and
 * it was the third hand-maintained copy of that table's shape, after `types.ts` (which was
 * missing ten of them until #188) and `MedicalInfoPage`'s markup.
 *
 * The query already said `select("*")`, so the data was always arriving; the TYPE was what threw
 * it away. A member's mobility, hearing, sight, where their medication is kept, their medical
 * centre and both insurance fields were on the wire and unreachable in one step.
 */
export type MedicalInfo = Tables<"medical_information">;

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
  /**
   * The enum, not `string`.
   *
   * It was `string`, which let the Membership page treat "no ACTIVE subscription" and "no
   * subscription" as the same thing without the compiler having an opinion. `membershipCondition()`
   * maps every one of the seven values, and it can only do that if this says which seven.
   * Nullable because the column is.
   */
  status: SubscriptionStatus | null;
  start_date: string | null;
  renewal_date: string | null;
  has_pendant: boolean | null;
  payment_method: string | null;
  /** NULL = the member pays for themselves. See PAYER_MODEL.md. */
  payer_id: string | null;
  created_at: string | null;
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

export interface MemberSubscriptions {
  /** The active subscription, or `null`. This is the one that means "somebody is watching". */
  active: SubscriptionInfo | null;
  /**
   * The most recent subscription of ANY status, or `null` when the member has never had one.
   *
   * The distinction `active === null` could not make. See `membershipCondition()`.
   */
  latest: SubscriptionInfo | null;
}

/**
 * Every subscription this member has ever had, reduced to the two the UI asks about.
 *
 * ONE query, not two. `useMemberSubscription()` is derived from this rather than issuing its own
 * `.eq("status","active")` read, so there is no second copy of "what counts as active" to drift
 * — the §16 bar's "no duplicate parallel implementations", applied to a two-line filter.
 *
 * RLS: "Members can view own subscription" is `member_id = get_member_id(auth.uid())` with no
 * status condition, so dropping the `active` filter widens nothing. A member could always read
 * their cancelled subscriptions; the client was choosing not to.
 */
export function useMemberSubscriptions() {
  const { memberId } = useAuth();

  return useQuery({
    queryKey: ["member-subscriptions", memberId],
    queryFn: async (): Promise<MemberSubscriptions> => {
      if (!memberId) throw new Error("No member ID");

      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as SubscriptionInfo[];
      return {
        active: rows.find((r) => r.status === "active") ?? null,
        latest: rows[0] ?? null,
      };
    },
    enabled: !!memberId,
  });
}

/**
 * The active subscription only — unchanged in meaning for every existing caller.
 *
 * `DevicePage` asks `subscription?.has_pendant`, and a cancelled member must not answer yes to
 * that, which is why this stayed a separate accessor rather than becoming "the latest one".
 */
export function useMemberSubscription() {
  const query = useMemberSubscriptions();
  return { ...query, data: query.data === undefined ? undefined : query.data.active };
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
