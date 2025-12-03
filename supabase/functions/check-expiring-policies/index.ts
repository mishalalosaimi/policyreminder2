import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.83.0';

// SendGrid helper function using fetch (more compatible with Deno)
async function sendGridSend(apiKey: string, msg: { to: string; from: { email: string; name: string }; subject: string; text?: string; html?: string }) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: msg.to }] }],
      from: { email: msg.from.email, name: msg.from.name },
      subject: msg.subject,
      content: [
        ...(msg.text ? [{ type: 'text/plain', value: msg.text }] : []),
        ...(msg.html ? [{ type: 'text/html', value: msg.html }] : []),
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SendGrid API error: ${response.status} - ${errorBody}`);
  }

  return response;
}

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

    // Parse request body
    let body: { type?: string; email?: string; testMode?: boolean; companyId?: string | null } = {};
    try {
      body = await req.json();
      console.log('Request body received:', JSON.stringify(body));
    } catch (e) {
      console.log('No request body or invalid JSON, proceeding in normal mode');
    }

    // Handle simple test mode: { "type": "test", "email": "..." }
    if (body.type === 'test' && body.email) {
      console.log('Simple test mode - sending test email to:', body.email);
      
      const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
      const fromEmail = Deno.env.get('From_Email');

      if (!sendgridApiKey || !fromEmail) {
        console.error('SendGrid not configured');
        return new Response(
          JSON.stringify({ success: false, error: 'SendGrid not configured. Please set SENDGRID_API_KEY and From_Email secrets.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      try {
        await sendGridSend(sendgridApiKey, {
          to: body.email,
          from: { email: fromEmail, name: 'PolicyMinders Alerts' },
          subject: 'PolicyMinders test email',
          text: 'This is a test from PolicyMinders via SendGrid.',
          html: '<p>This is a test from PolicyMinders via SendGrid.</p>',
        });

        console.log('✅ Test email sent successfully to:', body.email);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } catch (emailError) {
        console.error('Error sending test email:', emailError);
        const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error';
        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // Legacy test mode for policy reminder preview
    const isTestMode = body.testMode === true;
    const companyId = body.companyId || null;
    console.log('Test mode:', isTestMode);
    console.log('Company ID:', companyId);

    // Calculate target date (30 days from now)
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + 30);
    const targetDateString = targetDate.toISOString().split('T')[0];

    console.log(`Checking for policies expiring on ${targetDateString}`);

    let policies: Policy[] = [];

    if (isTestMode) {
      console.log('Test mode enabled - fetching sample policies for demo email');
      // In test mode, fetch policies from the user's company sorted by soonest expiration
      let sampleQuery = supabase
        .from('policies')
        .select('*')
        .order('end_date', { ascending: true })
        .limit(3);
      
      if (companyId) {
        sampleQuery = sampleQuery.eq('company_id', companyId);
      }
      
      const { data: samplePolicies, error: sampleError } = await sampleQuery;

      if (sampleError) {
        console.error('Error fetching sample policies:', sampleError);
      } else if (samplePolicies && samplePolicies.length > 0) {
        policies = samplePolicies as Policy[];
        console.log(`Using ${policies.length} sample policies for test email`);
      } else {
        // If no policies exist at all, create a mock one
        policies = [{
          id: 'test-id',
          client_name: 'Sample Client',
          client_status: 'existing',
          line: 'Medical',
          line_detail: 'PAR',
          end_date: targetDateString,
          count: 50,
          insurer_name: 'Sample Insurance Co.',
          channel_type: 'broker',
          contact_name: 'John Doe',
          contact_email: 'john.doe@example.com',
          contact_phone: '+966 50 123 4567'
        }];
        console.log('No policies in database - using mock policy for test email');
      }
    } else {
      // Normal mode - query policies expiring in 30 days
      const { data: expiringPolicies, error: policiesError } = await supabase
        .from('policies')
        .select('*')
        .eq('end_date', targetDateString);

      if (policiesError) {
        console.error('Error fetching policies:', policiesError);
        throw policiesError;
      }

      policies = (expiringPolicies || []) as Policy[];
      console.log(`Found ${policies.length} policies expiring in 30 days`);

      if (policies.length === 0) {
        return new Response(
          JSON.stringify({ message: 'No policies expiring in 30 days' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // Get notification email from settings (filter by company if provided)
    let settingsQuery = supabase
      .from('settings')
      .select('notification_email');
    
    if (companyId) {
      settingsQuery = settingsQuery.eq('company_id', companyId);
    }
    
    const { data: settings, error: settingsError } = await settingsQuery
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw new Error('Error fetching notification settings');
    }

    if (!settings?.notification_email) {
      console.error('No notification email configured in settings');
      throw new Error('Notification email not configured');
    }

    console.log('Notification email configured');

    // Generate email body
    const emailBody = generateEmailBody(policies as Policy[]);

    // Get SendGrid configuration
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const fromEmail = Deno.env.get('From_Email');

    if (!sendgridApiKey || !fromEmail) {
      console.warn('⚠️ SendGrid not configured. Email would be sent but configuration is missing.');

      return new Response(
        JSON.stringify({ 
          message: 'Email logged to console (SendGrid not configured)', 
          policiesCount: policies.length 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Send email via SendGrid
    try {
      // Generate subject line with first policy details
      const firstPolicy = policies[0];
      const subject = policies.length === 1
        ? `Upcoming Policy Renewal – ${firstPolicy.client_name} – ${firstPolicy.line}`
        : `Upcoming Policy Renewals – ${policies.length} Policies Expiring Soon`;

      await sendGridSend(sendgridApiKey, {
        to: settings.notification_email,
        from: { email: fromEmail, name: 'PolicyMinders Alerts' },
        subject,
        html: emailBody,
      });

      console.log('✅ Email sent successfully via SendGrid');

      return new Response(
        JSON.stringify({ 
          message: isTestMode ? 'Test email sent successfully' : 'Email sent successfully', 
          policiesCount: policies.length,
          recipientEmail: settings.notification_email
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } catch (emailError) {
      console.error('Error sending email via SendGrid:', emailError);
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

function calculateDaysUntilExpiry(endDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(endDate);
  expiry.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function generateEmailBody(policies: Policy[]): string {
  const policiesHtml = policies.map((policy) => {
    const daysUntilExpiry = calculateDaysUntilExpiry(policy.end_date);
    const policyType = policy.line_detail ? `${policy.line} – ${policy.line_detail}` : policy.line;
    
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
      <tr>
        <td style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">
                <span style="font-size: 18px; font-weight: 600; color: #1e293b;">${policy.client_name}</span>
              </td>
            </tr>
            <tr>
              <td style="padding-top: 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px; width: 140px;">Policy Type:</td>
                    <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 500;">${policyType}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Policy Number:</td>
                    <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 500;">${policy.id.substring(0, 8).toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Insurer:</td>
                    <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 500;">${policy.insurer_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Expiry Date:</td>
                    <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 500;">${formatDate(policy.end_date)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Days Until Expiry:</td>
                    <td style="padding: 6px 0;">
                      <span style="background: ${daysUntilExpiry <= 7 ? '#fef2f2' : '#fef9c3'}; color: ${daysUntilExpiry <= 7 ? '#dc2626' : '#ca8a04'}; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 600;">${daysUntilExpiry} days</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Contact:</td>
                    <td style="padding: 6px 0; color: #1e293b; font-size: 14px;">${policy.contact_name} · ${policy.contact_phone}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Policy Renewal Reminder</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">PolicyMinders</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Policy Renewal Reminder</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #334155;">
                The following ${policies.length === 1 ? 'policy is' : 'policies are'} approaching ${policies.length === 1 ? 'its' : 'their'} renewal date. Please review and take the necessary action.
              </p>
              
              ${policiesHtml}
              
              <!-- Call to Action -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 14px; color: #1e40af; font-weight: 500;">
                      📞 Contact your client to renew ${policies.length === 1 ? 'this policy' : 'these policies'} before ${policies.length === 1 ? 'it expires' : 'they expire'}.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 13px; color: #64748b; text-align: center;">
                This is an automated reminder from <strong>PolicyMinders</strong>.<br>
                © ${new Date().getFullYear()} PolicyMinders. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
