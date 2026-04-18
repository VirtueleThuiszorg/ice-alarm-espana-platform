import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import i18next from "i18next";

export interface DeviceStock {
  id: string;
  imei: string;
  serial_number: string | null;
  sim_iccid: string | null;
  sim_phone_number: string | null;
  model: string;
  status: string;
  member_id: string | null;
  is_online: boolean;
  last_checkin_at: string | null;
  created_at: string;
  // Joined member data
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

export interface NewDeviceInput {
  imei: string;
  serial_number?: string;
  sim_iccid?: string;
  sim_phone_number?: string;
}

export type DeviceStatusFilter = "all" | "in_stock" | "allocated" | "live" | "with_staff" | "faulty" | "reserved";

export function useDeviceStock(statusFilter: DeviceStatusFilter = "all") {
  return useQuery({
    queryKey: ["device-stock", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("devices")
        .select(`
          id,
          imei,
          serial_number,
          sim_iccid,
          sim_phone_number,
          model,
          status,
          member_id,
          is_online,
          last_checkin_at,
          created_at,
          members:member_id (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq("model", "EV-07B")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform the response to flatten member data
      return (data || []).map((device: any) => ({
        ...device,
        member: device.members || null,
      })) as DeviceStock[];
    },
  });
}

export function useAddDeviceStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewDeviceInput) => {
      const { data, error } = await supabase
        .from("devices")
        .insert({
          imei: input.imei,
          serial_number: input.serial_number || null,
          sim_iccid: input.sim_iccid || null,
          sim_phone_number: input.sim_phone_number || "",
          model: "EV-07B",
          device_type: "pendant",
          status: "in_stock",
          member_id: null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-stock"] });
      toast.success(i18next.t("adminEV07B.stock.addedSuccess"));
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error(i18next.t("adminEV07B.stock.duplicateImei"));
      } else {
        toast.error(i18next.t("adminEV07B.stock.addFailed", { message: error.message }));
      }
    },
  });
}

export function useUpdateDeviceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from("devices")
        .update({ status: status as any })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-stock"] });
      toast.success(i18next.t("adminEV07B.stock.statusUpdated"));
    },
    onError: (error: Error) => {
      toast.error(i18next.t("adminEV07B.stock.updateFailed", { message: error.message }));
    },
  });
}

export function useDeviceStockStats() {
  return useQuery({
    queryKey: ["device-stock-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("status")
        .eq("model", "EV-07B");

      if (error) throw error;

      const stats: Record<string, number> = {
        total: data.length,
        in_stock: 0,
        reserved: 0,
        allocated: 0,
        with_staff: 0,
        live: 0,
        faulty: 0,
      };

      data.forEach((device) => {
        const status = device.status;
        if (status && status in stats) {
          stats[status]++;
        }
      });

      return stats;
    },
  });
}
