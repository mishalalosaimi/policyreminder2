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
  reminder_lead_days: number;
  reminder_sent_at: string | null;
  company_id: string | null;
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
    let body: { type?: string; email?: string; testMode?: boolean; companyId?: string | null; policyId?: string } = {};
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
        // Fetch sample policies to show in test email
        const { data: samplePolicies } = await supabase
          .from('policies')
          .select('*')
          .order('end_date', { ascending: true })
          .limit(3);

        const testPolicies: Policy[] = samplePolicies && samplePolicies.length > 0
          ? samplePolicies as Policy[]
          : [{
              id: 'test-sample-id',
              client_name: 'Sample Client',
              client_status: 'existing',
              line: 'Medical',
              line_detail: null,
              end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              count: 50,
              insurer_name: 'Sample Insurance Co.',
              channel_type: 'direct',
              contact_name: 'John Doe',
              contact_email: 'john.doe@example.com',
              contact_phone: '+966 50 123 4567',
              reminder_lead_days: 30,
              reminder_sent_at: null,
              company_id: null
            }];

        const testHtml = generateEmailBody(testPolicies, true);
        
        await sendGridSend(sendgridApiKey, {
          to: body.email,
          from: { email: fromEmail, name: 'PolicyMinders Alerts' },
          subject: 'PolicyMinders – Test Email',
          html: testHtml,
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

    // Handle manual reminder for specific policy: { "type": "manual", "policyId": "..." }
    if (body.type === 'manual' && body.policyId) {
      console.log('Manual reminder mode - sending for policy:', body.policyId);
      
      const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
      const fromEmail = Deno.env.get('From_Email');

      if (!sendgridApiKey || !fromEmail) {
        console.error('SendGrid not configured');
        return new Response(
          JSON.stringify({ success: false, error: 'SendGrid not configured.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      try {
        // Fetch the specific policy
        const { data: policyData, error: policyError } = await supabase
          .from('policies')
          .select('*')
          .eq('id', body.policyId)
          .single();

        if (policyError || !policyData) {
          return new Response(
            JSON.stringify({ success: false, error: 'Policy not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }

        const policy = policyData as Policy;

        // Get notification email from settings
        let settingsQuery = supabase.from('settings').select('notification_email');
        if (policy.company_id) {
          settingsQuery = settingsQuery.eq('company_id', policy.company_id);
        }
        const { data: settings } = await settingsQuery.limit(1).maybeSingle();

        if (!settings?.notification_email) {
          return new Response(
            JSON.stringify({ success: false, error: 'Notification email not configured' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }

        const emailHtml = generateEmailBody([policy], false);
        const policyType = policy.line_detail ? `${policy.line} – ${policy.line_detail}` : policy.line;
        
        await sendGridSend(sendgridApiKey, {
          to: settings.notification_email,
          from: { email: fromEmail, name: 'PolicyMinders Alerts' },
          subject: `Policy Expiry Reminder – ${policy.client_name} – ${policyType}`,
          html: emailHtml,
        });

        console.log('✅ Manual reminder sent for policy:', policy.client_name);
        return new Response(
          JSON.stringify({ success: true, recipientEmail: settings.notification_email }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } catch (emailError) {
        console.error('Error sending manual reminder:', emailError);
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
          contact_phone: '+966 50 123 4567',
          reminder_lead_days: 30,
          reminder_sent_at: null,
          company_id: null
        }];
        console.log('No policies in database - using mock policy for test email');
      }
    } else {
    // Normal mode - query all policies and filter by their individual reminder_lead_days
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayString = today.toISOString().split('T')[0];

      // Fetch all policies that haven't been reminded today
      const { data: allPolicies, error: policiesError } = await supabase
        .from('policies')
        .select('*');

      if (policiesError) {
        console.error('Error fetching policies:', policiesError);
        throw policiesError;
      }

      // Filter policies where days until expiry matches their reminder_lead_days
      // and reminder hasn't been sent today
      policies = ((allPolicies || []) as Policy[]).filter((policy) => {
        const daysUntilExpiry = calculateDaysUntilExpiry(policy.end_date);
        const reminderLeadDays = policy.reminder_lead_days || 30;
        
        // Check if already reminded today
        if (policy.reminder_sent_at) {
          const sentDate = policy.reminder_sent_at.split('T')[0];
          if (sentDate === todayString) {
            return false;
          }
        }
        
        return daysUntilExpiry === reminderLeadDays;
      });

      console.log(`Found ${policies.length} policies matching their reminder timing`);

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

    // Email body will be generated in the send call

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
        ? `Policy Expiry Reminder – ${firstPolicy.client_name} – ${firstPolicy.line}`
        : `Policy Expiry Reminder – ${policies.length} Policies Expiring Soon`;

      await sendGridSend(sendgridApiKey, {
        to: settings.notification_email,
        from: { email: fromEmail, name: 'PolicyMinders Alerts' },
        subject,
        html: generateEmailBody(policies as Policy[], false),
      });

      console.log('✅ Email sent successfully via SendGrid');

      // Update reminder_sent_at for all policies that were included in the email
      if (!isTestMode && policies.length > 0) {
        const policyIds = policies.map(p => p.id);
        const { error: updateError } = await supabase
          .from('policies')
          .update({ reminder_sent_at: new Date().toISOString() })
          .in('id', policyIds);

        if (updateError) {
          console.error('Error updating reminder_sent_at:', updateError);
        } else {
          console.log(`Updated reminder_sent_at for ${policyIds.length} policies`);
        }
      }

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

function generateEmailBody(policies: Policy[], isTestMode: boolean = false): string {
  const policiesHtml = policies.map((policy) => {
    const daysUntilExpiry = calculateDaysUntilExpiry(policy.end_date);
    const policyType = policy.line_detail ? `${policy.line} – ${policy.line_detail}` : policy.line;
    
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
      <tr>
        <td style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
          <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #1e293b;">${policy.client_name} — ${policyType}</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-size: 14px; width: 100px;"><strong>Status:</strong></td>
              <td style="padding: 4px 0; color: #1e293b; font-size: 14px;">${policy.client_status}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-size: 14px;"><strong>End Date:</strong></td>
              <td style="padding: 4px 0; color: #1e293b; font-size: 14px;">${policy.end_date}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-size: 14px;"><strong>Count:</strong></td>
              <td style="padding: 4px 0; color: #1e293b; font-size: 14px;">${policy.count || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-size: 14px;"><strong>Insurer:</strong></td>
              <td style="padding: 4px 0; color: #1e293b; font-size: 14px;">${policy.insurer_name} – ${policy.channel_type}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-size: 14px;"><strong>Contact:</strong></td>
              <td style="padding: 4px 0; color: #1e293b; font-size: 14px;">${policy.contact_name} (${policy.contact_phone} – <a href="mailto:${policy.contact_email}" style="color: #3b82f6;">${policy.contact_email}</a>)</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
  }).join('');

  const headerTitle = isTestMode ? 'Test Email' : 'Renewal Reminder';
  const introText = isTestMode 
    ? 'This is a <strong>test email</strong> showing how your policy reminders will look. The following are sample policies from your database:'
    : 'Dear Broker,<br><br>The following insurance policies are <strong>expiring in 30 days</strong>:';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isTestMode ? 'PolicyMinders Test Email' : 'Policy Expiry Reminder'}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">PolicyMinders</h1>
              <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.95); font-size: 15px; font-weight: 500;">${headerTitle}</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.7; color: #334155;">
                ${introText}
              </p>
              
              ${policiesHtml}
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 28px 40px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.6;">
                This reminder was sent automatically by PolicyMinders.<br>
                For support, contact your system admin.
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
