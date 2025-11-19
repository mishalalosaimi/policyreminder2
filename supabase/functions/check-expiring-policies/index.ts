import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.83.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Policy {
  id: string;
  client_name: string;
  client_status: string;
  line: string;
  line_detail: string | null;
  end_date: string;
  count: number | null;
  insurer_name: string;
  channel_type: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate target date (30 days from now)
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + 30);
    const targetDateString = targetDate.toISOString().split('T')[0];

    console.log(`Checking for policies expiring on ${targetDateString}`);

    // Query policies expiring in 30 days
    const { data: policies, error: policiesError } = await supabase
      .from('policies')
      .select('*')
      .eq('end_date', targetDateString);

    if (policiesError) {
      console.error('Error fetching policies:', policiesError);
      throw policiesError;
    }

    console.log(`Found ${policies?.length || 0} policies expiring in 30 days`);

    if (!policies || policies.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No policies expiring in 30 days' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get notification email from settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('notification_email')
      .single();

    if (settingsError || !settings?.notification_email) {
      console.error('Error fetching settings or no notification email configured:', settingsError);
      throw new Error('Notification email not configured');
    }

    // Generate email body
    const emailBody = generateEmailBody(policies as Policy[]);

    // Try to send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.warn('⚠️ RESEND_API_KEY not configured. Email will be logged to console instead of sending.');
      console.log('📧 Email that would have been sent:');
      console.log(`To: ${settings.notification_email}`);
      console.log(`Subject: Policies Expiring in 30 Days`);
      console.log(emailBody);

      return new Response(
        JSON.stringify({ 
          message: 'Email logged to console (RESEND not configured)', 
          policiesCount: policies.length 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev',
        to: settings.notification_email,
        subject: 'Policies Expiring in 30 Days',
        text: emailBody,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Error sending email via Resend:', resendData);
      throw new Error('Failed to send email');
    }

    console.log('✅ Email sent successfully via Resend');

    return new Response(
      JSON.stringify({ 
        message: 'Email sent successfully', 
        policiesCount: policies.length,
        emailId: resendData.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in check-expiring-policies function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function generateEmailBody(policies: Policy[]): string {
  let body = `The following policies expire in 30 days:\n\n`;

  policies.forEach((policy, index) => {
    body += `${index + 1})\n`;
    body += `CLIENT NAME: ${policy.client_name} (${policy.client_status})\n`;
    body += `LINE: ${policy.line}${policy.line_detail ? ' ' + policy.line_detail : ''}\n`;
    body += `END DATE: ${policy.end_date}\n`;
    body += `COUNT: ${policy.count || 'N/A'}\n`;
    body += `CHANNEL: ${policy.insurer_name} – ${policy.channel_type}\n`;
    body += `CONTACT: ${policy.contact_name} (${policy.contact_phone} – ${policy.contact_email})\n\n`;
  });

  return body;
}
