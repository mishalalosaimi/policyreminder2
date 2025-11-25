import { z } from "zod";

export const settingsSchema = z.object({
  notification_email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters")
    .toLowerCase(),
});

export type SettingsFormData = z.infer<typeof settingsSchema>;
