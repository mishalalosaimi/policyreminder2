-- Create policies table
CREATE TABLE IF NOT EXISTS public.policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_status TEXT NOT NULL CHECK (client_status IN ('existing', 'prospect')),
  line TEXT NOT NULL CHECK (line IN ('Medical', 'Motor', 'General')),
  line_detail TEXT,
  end_date DATE NOT NULL,
  count INTEGER,
  insurer_name TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('direct', 'broker')),
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settings table (single row)
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_email TEXT NOT NULL
);

-- Insert default settings row
INSERT INTO public.settings (notification_email) VALUES ('admin@example.com');

-- Create index on end_date for faster cron queries
CREATE INDEX idx_policies_end_date ON public.policies(end_date);

-- Enable Row Level Security (but allow all operations since this is single-user)
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (single-user app, no auth)
CREATE POLICY "Allow all operations on policies" ON public.policies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);