import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const AcceptInvitation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [status, setStatus] = useState<"loading" | "success" | "error" | "auth-required">("loading");
  const [message, setMessage] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [invitationEmail, setInvitationEmail] = useState("");

  useEffect(() => {
    const processInvitation = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Invalid invitation link. No token provided.");
        return;
      }

      // First, fetch invitation info (public endpoint)
      try {
        const infoResponse = await supabase.functions.invoke("get-invitation-info", {
          body: { token },
        });

        if (infoResponse.error || infoResponse.data?.error) {
          setStatus("error");
          setMessage(infoResponse.data?.error || infoResponse.error?.message || "Invalid invitation");
          return;
        }

        setInvitationEmail(infoResponse.data.email);
        setOrganizationName(infoResponse.data.organizationName);
      } catch (error: any) {
        setStatus("error");
        setMessage("Failed to fetch invitation details");
        return;
      }

      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setStatus("auth-required");
        setMessage("Please sign in or create an account to accept this invitation.");
        return;
      }

      // User is authenticated - try to accept the invitation
      try {
        const response = await supabase.functions.invoke("accept-invitation", {
          body: { invitationToken: token },
        });

        if (response.error) {
          throw response.error;
        }

        if (response.data?.error) {
          throw new Error(response.data.error);
        }

        setStatus("success");
        setMessage(`You've successfully joined as a ${response.data.role}!`);
        
        toast({
          title: "Welcome!",
          description: `You've joined ${response.data.organizationName}`,
        });

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate("/");
        }, 3000);
      } catch (error: any) {
        setStatus("error");
        setMessage(error.message || "Failed to accept invitation");
      }
    };

    processInvitation();
  }, [token, navigate]);

  const handleSignIn = async () => {
    // Store both the token AND the email for pre-filling
    sessionStorage.setItem("pendingInvitationToken", token || "");
    sessionStorage.setItem("pendingInvitationEmail", invitationEmail);
    sessionStorage.setItem("pendingOrganizationName", organizationName);
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Team Invitation</CardTitle>
          <CardDescription>
            {status === "loading" && "Processing your invitation..."}
            {status === "success" && `Welcome to ${organizationName}!`}
            {status === "error" && "Invitation Error"}
            {status === "auth-required" && `Join ${organizationName || "the team"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === "loading" && (
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          )}
          
          {status === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-center text-muted-foreground">{message}</p>
              <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
            </>
          )}
          
          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-center text-muted-foreground">{message}</p>
              <Button onClick={() => navigate("/")} variant="outline">
                Go to Dashboard
              </Button>
            </>
          )}
          
          {status === "auth-required" && (
            <>
              <p className="text-center text-muted-foreground">{message}</p>
              {invitationEmail && (
                <p className="text-sm text-muted-foreground">
                  Invitation for: <strong>{invitationEmail}</strong>
                </p>
              )}
              <Button onClick={handleSignIn}>
                Sign In / Create Account
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvitation;
