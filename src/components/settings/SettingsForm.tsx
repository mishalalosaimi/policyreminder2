import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SettingsFormProps {
  settings: { id: string; notification_email: string } | undefined;
  isLoading: boolean;
  onSave: (email: string) => void;
}

export const SettingsForm = ({ settings, isLoading, onSave }: SettingsFormProps) => {
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (settings?.notification_email) {
      setEmail(settings.notification_email);
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(email);
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="notification_email">Notification Email</Label>
        <Input
          id="notification_email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your-email@example.com"
          required
        />
        <p className="text-sm text-muted-foreground mt-2">
          This email will receive reminders for policies expiring in 30 days
        </p>
      </div>

      <Button type="submit">Save Settings</Button>
    </form>
  );
};
