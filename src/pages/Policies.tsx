import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PolicyForm } from "@/components/policies/PolicyForm";
import { PoliciesTable } from "@/components/policies/PoliciesTable";
import { SearchFilter } from "@/components/policies/SearchFilter";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Policy = Tables<"policies">;

const Policies = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [lineFilter, setLineFilter] = useState<string>("All");
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const queryClient = useQueryClient();

  const { data: policies, isLoading } = useQuery({
    queryKey: ["policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policies")
        .select("*")
        .order("end_date", { ascending: true });

      if (error) throw error;
      return data as Policy[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast({ title: "Policy deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error deleting policy", variant: "destructive" });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this policy?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (policy: Policy) => {
    setEditingPolicy(policy);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFormSuccess = () => {
    setEditingPolicy(null);
  };

  const filteredPolicies = policies?.filter((policy) => {
    const matchesSearch = policy.client_name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesLine = lineFilter === "All" || policy.line === lineFilter;
    return matchesSearch && matchesLine;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <h1 className="text-3xl font-bold mb-8 text-foreground">Policy Management</h1>

        <div className="mb-8 bg-card p-6 rounded-lg border shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            {editingPolicy ? "Edit Policy" : "Add New Policy"}
          </h2>
          <PolicyForm
            editingPolicy={editingPolicy}
            onSuccess={handleFormSuccess}
            onCancel={() => setEditingPolicy(null)}
          />
        </div>

        <div className="bg-card p-6 rounded-lg border shadow-sm">
          <SearchFilter
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            lineFilter={lineFilter}
            onLineFilterChange={setLineFilter}
          />

          <PoliciesTable
            policies={filteredPolicies || []}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
};

export default Policies;
