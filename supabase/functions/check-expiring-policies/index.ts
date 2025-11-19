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

    // Get SMTP configuration
    const smtpHost = Deno.env.get('SMTP_HOST');
    const smtpPort = Deno.env.get('SMTP_PORT');
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    const fromEmail = Deno.env.get('FROM_EMAIL');

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) {
      console.warn('⚠️ SMTP not configured. Email will be logged to console instead of sending.');
      console.log('📧 Email that would have been sent:');
      console.log(`To: ${settings.notification_email}`);
      console.log(`Subject: Policies Expiring in 30 Days`);
      console.log(emailBody);

      return new Response(
        JSON.stringify({ 
          message: 'Email logged to console (SMTP not configured)', 
          policiesCount: policies.length 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Send email via raw SMTP over TCP
    try {
      await sendEmailRawSMTP({
        from: fromEmail,
        to: settings.notification_email,
        subject: 'Policies Expiring in 30 Days',
        html: emailBody,
        smtpHost,
        smtpPort: parseInt(smtpPort),
        smtpUser,
        smtpPass,
      });

      console.log('✅ Email sent successfully via SMTP');

      return new Response(
        JSON.stringify({ 
          message: 'Email sent successfully', 
          policiesCount: policies.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } catch (emailError) {
      console.error('Error sending email via SMTP:', emailError);
      throw new Error(`Failed to send email: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`);
    }

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
  const policiesHtml = policies.map((policy) => `
    <div style="border: 1px solid #e2e2e2; padding: 16px; border-radius: 8px; margin-bottom: 16px; background: #fafafa;">
      <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 16px; color: #222;">
        ${policy.client_name} — ${policy.line}
      </h3>

      <p style="margin: 4px 0;"><strong>Status:</strong> ${policy.client_status}</p>
      <p style="margin: 4px 0;"><strong>End Date:</strong> ${policy.end_date}</p>
      <p style="margin: 4px 0;"><strong>Count:</strong> ${policy.count || 'N/A'}</p>
      <p style="margin: 4px 0;"><strong>Insurer:</strong> ${policy.insurer_name} – ${policy.channel_type}</p>
      <p style="margin: 4px 0;">
        <strong>Contact:</strong> ${policy.contact_name} 
        (${policy.contact_phone} – 
        <a href="mailto:${policy.contact_email}">${policy.contact_email}</a>)
      </p>
    </div>
  `).join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; color: #333;">

      <p style="font-size: 15px;">Dear Broker,</p>

      <p style="font-size: 15px;">
        The following insurance policies are <strong>expiring in 30 days</strong>:
      </p>

      ${policiesHtml}

      <p style="margin-top: 24px;">Best regards,<br>
      <strong>Policy Minder</strong></p>

    </div>
  `;
}

async function sendEmailRawSMTP(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}) {
  const { from, to, subject, html, smtpHost, smtpPort, smtpUser, smtpPass } = options;

  let conn;
  try {
    // Connect to SMTP server
    conn = await Deno.connect({
      hostname: smtpHost,
      port: smtpPort,
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(4096);

    // Helper function to read response
    const readResponse = async () => {
      const n = await conn!.read(buffer);
      if (!n) throw new Error('Connection closed');
      const response = decoder.decode(buffer.subarray(0, n));
      console.log('SMTP Response:', response);
      return response;
    };

    // Helper function to send command
    const sendCommand = async (command: string) => {
      console.log('SMTP Command:', command.trim());
      await conn!.write(encoder.encode(command + '\r\n'));
      return await readResponse();
    };

    // SMTP conversation
    await readResponse(); // Server greeting
    await sendCommand(`EHLO ${smtpHost}`);
    
    // Start TLS if port 587
    if (smtpPort === 587) {
      await sendCommand('STARTTLS');
      // Upgrade connection to TLS
      conn = await Deno.startTls(conn, { hostname: smtpHost });
      await sendCommand(`EHLO ${smtpHost}`);
    }
    
    // Authenticate
    await sendCommand('AUTH LOGIN');
    await sendCommand(btoa(smtpUser));
    await sendCommand(btoa(smtpPass));
    
    // Send email
    await sendCommand(`MAIL FROM:<${from}>`);
    await sendCommand(`RCPT TO:<${to}>`);
    await sendCommand('DATA');
    
    // Email content
    const emailContent = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
      '.',
    ].join('\r\n');
    
    await sendCommand(emailContent);
    await sendCommand('QUIT');
    
  } catch (error) {
    console.error('Raw SMTP error:', error);
    throw error;
  } finally {
    if (conn) {
      try {
        conn.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}
