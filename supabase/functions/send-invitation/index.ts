import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      throw new Error("Not authenticated");
    }

    const { email, role = "broker" } = await req.json();
    const userId = userData.user.id;

    console.log("[INVITATION] Admin:", userId, "inviting:", email);

    // Get user's organization and verify admin status
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .single();

    if (memberError || !membership) {
      throw new Error("User not in any organization");
    }

    if (membership.role !== "admin") {
      throw new Error("Only admins can send invitations");
    }

    // Check seat limit
    const { count: memberCount } = await supabaseAdmin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id);

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("max_seats, name")
      .eq("id", membership.organization_id)
      .single();

    if (orgError || !org) {
      throw new Error("Organization not found");
    }

    if ((memberCount || 0) >= org.max_seats) {
      throw new Error(`Seat limit reached (${org.max_seats} users)`);
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("email", email.toLowerCase())
      .single();

    if (existingUser) {
      // Check if already a member
      const { data: existingMember } = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("user_id", existingUser.user_id)
        .eq("organization_id", membership.organization_id)
        .single();

      if (existingMember) {
        throw new Error("This user is already a member of your organization");
      }
    }

    // Create invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("invitations")
      .insert({
        organization_id: membership.organization_id,
        email: email.toLowerCase(),
        role,
        invited_by: userId,
      })
      .select()
      .single();

    if (invError) {
      if (invError.code === "23505") {
        throw new Error("This email has already been invited");
      }
      throw invError;
    }

    // Send email via SendGrid (if configured)
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("From_Email");
    
    if (sendgridKey && fromEmail) {
      const origin = req.headers.get("origin") || "https://policyminders.com";
      const inviteUrl = `${origin}/accept-invitation?token=${invitation.token}`;

      try {
        await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sendgridKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: fromEmail, name: "PolicyMinders" },
            subject: `You've been invited to join ${org.name} on PolicyMinders`,
            content: [{
              type: "text/html",
              value: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>You've been invited!</h2>
                  <p>${userData.user.email} has invited you to join <strong>${org.name}</strong> on PolicyMinders.</p>
                  <p>Click the link below to accept your invitation:</p>
                  <p><a href="${inviteUrl}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Accept Invitation</a></p>
                  <p style="color: #666; font-size: 12px; margin-top: 20px;">This invitation expires in 7 days.</p>
                </div>
              `,
            }],
            tracking_settings: {
              click_tracking: {
                enable: false,
                enable_text: false
              }
            }
          }),
        });
        console.log("[INVITATION] Email sent to:", email);
      } catch (emailError) {
        console.error("[INVITATION] Failed to send email:", emailError);
        // Don't fail the request, invitation is still created
      }
    }

    return new Response(
      JSON.stringify({ success: true, invitation }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[INVITATION] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
