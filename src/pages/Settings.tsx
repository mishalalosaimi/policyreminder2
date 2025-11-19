import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .single();

      if (error) {
        // If no settings exist, return default
        if (error.code === "PGRST116") {
          return { id: "", notification_email: "" };
        }
        throw error;
      }
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (email: string) => {
      if (settings?.id) {
        const { error } = await supabase
          .from("settings")
          .update({ notification_email: email })
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ notification_email: email });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Error saving settings", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <h1 className="text-3xl font-bold mb-8 text-foreground">Settings</h1>

        <div className="bg-card p-6 rounded-lg border shadow-sm">
          <SettingsForm
            settings={settings}
            isLoading={isLoading}
            onSave={(email) => updateMutation.mutate(email)}
          />
        </div>
      </div>
    </div>
  );
};

export default Settings;
