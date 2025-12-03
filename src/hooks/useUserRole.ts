import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "broker";

export interface UserRoleData {
  role: AppRole;
  isAdmin: boolean;
  isBroker: boolean;
}

export const useUserRole = () => {
  return useQuery({
    queryKey: ["userRole"],
    queryFn: async (): Promise<UserRoleData> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      
      const role = data?.role as AppRole;
      return {
        role,
        isAdmin: role === "admin",
        isBroker: role === "broker",
      };
    },
  });
};
