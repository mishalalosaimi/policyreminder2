-- Add reminder_lead_days column (default 30 days)
ALTER TABLE public.policies 
ADD COLUMN reminder_lead_days integer NOT NULL DEFAULT 30;

-- Add reminder_sent_at column to track when reminder was sent
ALTER TABLE public.policies 
ADD COLUMN reminder_sent_at timestamp with time zone;

-- Add constraint to ensure valid values
ALTER TABLE public.policies 
ADD CONSTRAINT valid_reminder_lead_days CHECK (reminder_lead_days IN (14, 30, 45));