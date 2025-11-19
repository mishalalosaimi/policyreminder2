import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PolicyForm } from "@/components/policies/PolicyForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Policy = Tables<"policies">;

const PolicyFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const { data: policy, isLoading } = useQuery({
    queryKey: ["policy", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("policies")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Policy;
    },
    enabled: isEditing,
  });

  const handleSuccess = () => {
    navigate("/");
  };

  const handleCancel = () => {
    navigate("/");
  };

  if (isEditing && isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>
              {isEditing ? "Edit Policy" : "Add New Policy"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PolicyForm
              editingPolicy={policy}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PolicyFormPage;
