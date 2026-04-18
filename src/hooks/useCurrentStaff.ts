import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { STALE_TIMES } from "@/config/constants";

interface CurrentStaff {
  id: string;
  first_name: string;
  last_name: string;
}

export function useCurrentStaff() {
  const { user } = useAuth();

  return useQuery<CurrentStaff | null>({
    queryKey: ["current-staff", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: STALE_TIMES.LONG,
  });
}
