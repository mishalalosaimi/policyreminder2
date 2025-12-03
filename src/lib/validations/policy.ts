import { z } from "zod";

// Sanitization helper - removes potentially dangerous characters
const sanitizeString = (str: string) => str.trim().slice(0, 500);

export const policySchema = z.object({
  client_name: z
    .string()
    .trim()
    .min(1, "Client name is required")
    .max(200, "Client name must be less than 200 characters")
    .transform(sanitizeString),
  
  client_status: z.enum(["existing", "prospect"], {
    required_error: "Client status is required",
  }),
  
  line: z.enum(["Medical", "Motor", "General"], {
    required_error: "Line is required",
  }),
  
  line_detail: z
    .string()
    .max(200, "Line detail must be less than 200 characters")
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : null),
  
  end_date: z
    .string()
    .min(1, "End date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  
  count: z
    .number()
    .int("Count must be a whole number")
    .positive("Count must be positive")
    .max(1000000, "Count exceeds maximum value")
    .nullable()
    .optional(),
  
  insurer_name: z
    .string()
    .trim()
    .min(1, "Insurer name is required")
    .max(200, "Insurer name must be less than 200 characters")
    .transform(sanitizeString),
  
  channel_type: z.enum(["direct", "broker"], {
    required_error: "Channel type is required",
  }),
  
  contact_name: z
    .string()
    .trim()
    .min(1, "Contact name is required")
    .max(200, "Contact name must be less than 200 characters")
    .transform(sanitizeString),
  
  contact_email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters")
    .toLowerCase(),
  
  contact_phone: z
    .string()
    .trim()
    .min(1, "Contact phone is required")
    .max(20, "Phone number must be less than 20 characters")
    .regex(/^[\d\s\-\+\(\)]+$/, "Phone number contains invalid characters"),
  
  notes: z
    .string()
    .max(2000, "Notes must be less than 2000 characters")
    .nullable()
    .optional()
    .transform((val) => val ? sanitizeString(val) : null),
  
  company_id: z.string().uuid().optional().nullable(),
  documents: z.array(z.string()).optional().nullable(),
  reminder_lead_days: z.number().int().refine((val) => [14, 30, 45].includes(val), {
    message: "Reminder must be 14, 30, or 45 days"
  }).default(30),
});

export type PolicyFormData = z.infer<typeof policySchema>;
