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

    const { invitationToken } = await req.json();
    const user = userData.user;

    console.log("[ACCEPT] User:", user.id, "accepting token:", invitationToken?.substring(0, 8));

    // Find valid invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("invitations")
      .select("*, organizations(name)")
      .eq("token", invitationToken)
      .eq("email", user.email?.toLowerCase())
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (invError || !invitation) {
      throw new Error("Invalid or expired invitation");
    }

    // Check if user is already in an organization
    const { data: existingMember } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      // Check if their current org has only them as a member (auto-created temp org)
      const { count } = await supabaseAdmin
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", existingMember.organization_id);

      if (count === 1) {
        console.log("[ACCEPT] Transferring user from temp org:", existingMember.organization_id);
        
        // Delete their membership from the old org
        await supabaseAdmin
          .from("organization_members")
          .delete()
          .eq("user_id", user.id);

        // Delete the user_role entry
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", user.id);

        // Delete the empty organization
        await supabaseAdmin
          .from("organizations")
          .delete()
          .eq("id", existingMember.organization_id);

        // Also delete from legacy companies table
        await supabaseAdmin
          .from("companies")
          .delete()
          .eq("id", existingMember.organization_id);

        console.log("[ACCEPT] Deleted temp org:", existingMember.organization_id);
      } else {
        throw new Error("You are already a member of an organization with other users");
      }
    }

    // Add user to new organization
    const { error: memberError } = await supabaseAdmin
      .from("organization_members")
      .insert({
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
      });

    if (memberError) throw memberError;

    // Add role to user_roles
    await supabaseAdmin
      .from("user_roles")
      .upsert({
        user_id: user.id,
        role: invitation.role,
      });

    // Update or create profile to point to the new organization
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existingProfile) {
      // Update existing profile
      await supabaseAdmin
        .from("profiles")
        .update({ company_id: invitation.organization_id })
        .eq("user_id", user.id);
    } else {
      // Create new profile
      await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: user.id,
          company_id: invitation.organization_id,
          name: user.user_metadata?.name || user.email?.split("@")[0] || "User",
          email: user.email || "",
        });
    }

    // Mark invitation as accepted
    await supabaseAdmin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    console.log("[ACCEPT] User joined organization:", invitation.organization_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        organizationId: invitation.organization_id,
        organizationName: invitation.organizations?.name,
        role: invitation.role 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[ACCEPT] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
