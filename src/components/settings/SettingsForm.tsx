import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsSchema, type SettingsFormData } from "@/lib/validations/settings";

interface SettingsFormProps {
  email: string;
  setEmail: (email: string) => void;
  hasUnsavedChanges?: boolean;
  isLoading: boolean;
  onSave: (email: string) => void;
}

export const SettingsForm = ({ email, setEmail, hasUnsavedChanges, isLoading, onSave }: SettingsFormProps) => {
  const { register, handleSubmit, formState: { errors } } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      notification_email: email,
    },
    values: {
      notification_email: email,
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    onSave(data.notification_email);
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="notification_email">Notification Email</Label>
        <Input
          id="notification_email"
          type="email"
          {...register("notification_email")}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your-email@example.com"
        />
        {errors.notification_email && (
          <p className="text-sm text-destructive mt-1">{errors.notification_email.message}</p>
        )}
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
