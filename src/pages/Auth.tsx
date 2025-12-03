import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Session } from "@supabase/supabase-js";
import { loginSchema, signupSchema, type LoginFormData, type SignupFormData } from "@/lib/validations/auth";

const Auth = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasPendingInvitation, setHasPendingInvitation] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingOrgName, setPendingOrgName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("login");

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      company_name: "",
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    // Check for pending invitation
    const pendingToken = sessionStorage.getItem("pendingInvitationToken");
    const invitationEmail = sessionStorage.getItem("pendingInvitationEmail");
    const orgName = sessionStorage.getItem("pendingOrganizationName");
    
    setHasPendingInvitation(!!pendingToken);
    setPendingEmail(invitationEmail);
    setPendingOrgName(orgName);

    // Default to signup tab if there's a pending invitation
    if (pendingToken) {
      setActiveTab("signup");
    }

    // Pre-fill email if from invitation
    if (invitationEmail) {
      signupForm.setValue("email", invitationEmail);
      loginForm.setValue("email", invitationEmail);
    }

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        handleRedirectAfterAuth();
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) {
          handleRedirectAfterAuth();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleRedirectAfterAuth = () => {
    const pendingToken = sessionStorage.getItem("pendingInvitationToken");
    if (pendingToken) {
      // Clear all invitation-related session storage
      sessionStorage.removeItem("pendingInvitationToken");
      sessionStorage.removeItem("pendingInvitationEmail");
      sessionStorage.removeItem("pendingOrganizationName");
      navigate(`/accept-invitation?token=${pendingToken}`);
    } else {
      navigate("/");
    }
  };

  const handleLogin = async (data: LoginFormData) => {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast({
            title: "Login failed",
            description: "Invalid email or password. Please try again.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Login failed",
            description: error.message,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Success",
          description: "Logged in successfully!",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            name: data.name,
            // Only pass company_name if not joining via invitation
            ...(hasPendingInvitation ? {} : { company_name: data.company_name }),
          },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast({
            title: "Signup failed",
            description: "This email is already registered. Please try logging in instead.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Signup failed",
            description: error.message,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Success",
          description: "Account created successfully!",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Redirect if already logged in
  if (session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            {hasPendingInvitation 
              ? `Create an account to join ${pendingOrgName || "the team"}` 
              : "Login to your account or create a new one"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="your@email.com"
                    disabled={!!pendingEmail}
                    {...loginForm.register("email")}
                  />
                  {pendingEmail && (
                    <p className="text-xs text-muted-foreground">
                      This email was specified in your invitation
                    </p>
                  )}
                  {loginForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    {...loginForm.register("password")}
                  />
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="John Doe"
                    {...signupForm.register("name")}
                  />
                  {signupForm.formState.errors.name && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.name.message}</p>
                  )}
                </div>
                {!hasPendingInvitation && (
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name</Label>
                    <Input
                      id="company-name"
                      type="text"
                      placeholder="Your Company"
                      {...signupForm.register("company_name")}
                    />
                    {signupForm.formState.errors.company_name && (
                      <p className="text-sm text-destructive">{signupForm.formState.errors.company_name.message}</p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="your@email.com"
                    disabled={!!pendingEmail}
                    {...signupForm.register("email")}
                  />
                  {pendingEmail && (
                    <p className="text-xs text-muted-foreground">
                      This email was specified in your invitation
                    </p>
                  )}
                  {signupForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    {...signupForm.register("password")}
                  />
                  {signupForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.password.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Must be at least 8 characters with uppercase, lowercase, and number
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
