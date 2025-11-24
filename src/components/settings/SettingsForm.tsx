import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SettingsFormProps {
  email: string;
  setEmail: (email: string) => void;
  hasUnsavedChanges?: boolean;
  isLoading: boolean;
  onSave: (email: string) => void;
}

export const SettingsForm = ({ email, setEmail, hasUnsavedChanges, isLoading, onSave }: SettingsFormProps) => {

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
        <div className="space-y-1 mt-2">
          <p className="text-sm text-muted-foreground">
            This email will receive reminders for policies expiring in 30 days
          </p>
          {hasUnsavedChanges && (
            <p className="text-sm text-orange-500">
              ⚠️ Unsaved changes
            </p>
          )}
        </div>
      </div>

      <Button type="submit">Save Settings</Button>
    </form>
  );
};
