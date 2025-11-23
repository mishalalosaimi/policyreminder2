import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

const Settings = () => {
  const queryClient = useQueryClient();

  // Fetch user's company_id
  const { data: companyId } = useQuery({
    queryKey: ["userCompanyId"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      return profile?.company_id;
    },
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return data || { id: "", notification_email: "" };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (email: string) => {
      if (!companyId) throw new Error("Company ID not found");

      if (settings?.id) {
        const { error } = await supabase
          .from("settings")
          .update({ notification_email: email, company_id: companyId })
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ notification_email: email, company_id: companyId });
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

  const sendTestEmailMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "check-expiring-policies",
        { body: { testMode: true, companyId } }
      );
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ 
        title: "Test email sent successfully",
        description: "Check the notification email inbox for the reminder."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error sending test email", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <h1 className="text-3xl font-bold mb-8 text-foreground">Settings</h1>

        <div className="space-y-6">
          <div className="bg-card p-6 rounded-lg border shadow-sm">
            <SettingsForm
              settings={settings}
              isLoading={isLoading}
              onSave={(email) => updateMutation.mutate(email)}
            />
          </div>

          <div className="bg-card p-6 rounded-lg border shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-foreground">
              Email Notifications
            </h2>
            <p className="text-muted-foreground mb-4">
              Send a test reminder email to check if your notification settings are working correctly.
            </p>
            <Button
              onClick={() => sendTestEmailMutation.mutate()}
              disabled={sendTestEmailMutation.isPending || !settings?.notification_email}
              className="w-full sm:w-auto"
            >
              <Send className="mr-2 h-4 w-4" />
              {sendTestEmailMutation.isPending ? "Sending..." : "Send Test Email"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
