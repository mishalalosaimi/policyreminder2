import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Organization {
  id: string;
  name: string;
  max_seats: number;
  subscription_status: string | null;
  created_at: string;
}

export const useOrganization = () => {
  return useQuery({
    queryKey: ["organization"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .single();

      if (error) throw error;
      return data as Organization;
    },
  });
};

export const useOrganizationId = () => {
  return useQuery({
    queryKey: ["organizationId"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      return data?.organization_id;
    },
  });
};
