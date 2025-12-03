import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch invitation by token
    const { data: invitation, error: invError } = await supabase
      .from("invitations")
      .select("email, role, organization_id, expires_at, accepted_at")
      .eq("token", token)
      .single();

    if (invError || !invitation) {
      console.log("Invitation not found for token:", token);
      return new Response(
        JSON.stringify({ error: "Invalid invitation token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This invitation has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already accepted
    if (invitation.accepted_at) {
      return new Response(
        JSON.stringify({ error: "This invitation has already been accepted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch organization name
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", invitation.organization_id)
      .single();

    if (orgError) {
      console.error("Error fetching organization:", orgError);
    }

    console.log("Returning invitation info for:", invitation.email);

    return new Response(
      JSON.stringify({
        email: invitation.email,
        role: invitation.role,
        organizationName: org?.name || "Unknown Organization",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in get-invitation-info:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
