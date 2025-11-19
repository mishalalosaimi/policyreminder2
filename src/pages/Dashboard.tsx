import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PoliciesTable } from "@/components/policies/PoliciesTable";
import { SearchFilter } from "@/components/policies/SearchFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Calendar, Activity, Car, Building } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Policy = Tables<"policies">;

const Dashboard = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [lineFilter, setLineFilter] = useState<string>("All");
  const navigate = useNavigate();

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

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this policy?")) {
      const { error } = await supabase.from("policies").delete().eq("id", id);
      if (error) {
        console.error("Error deleting policy:", error);
      }
    }
  };

  const handleEdit = (policy: Policy) => {
    navigate(`/policy/${policy.id}`);
  };

  const filteredPolicies = policies?.filter((policy) => {
    const matchesSearch = policy.client_name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesLine = lineFilter === "All" || policy.line === lineFilter;
    return matchesSearch && matchesLine;
  });

  // Calculate statistics
  const totalPolicies = policies?.length || 0;
  
  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(today.getDate() + 30);
  
  const expiringWithin30Days = policies?.filter((policy) => {
    const endDate = new Date(policy.end_date);
    return endDate <= thirtyDaysFromNow && endDate >= today;
  }).length || 0;

  const medicalPolicies = policies?.filter((p) => p.line === "Medical").length || 0;
  const motorPolicies = policies?.filter((p) => p.line === "Motor").length || 0;
  const generalPolicies = policies?.filter((p) => p.line === "General").length || 0;

  const stats = [
    {
      title: "Total Policies",
      value: totalPolicies,
      icon: FileText,
      color: "text-primary",
    },
    {
      title: "Expiring in 30 Days",
      value: expiringWithin30Days,
      icon: Calendar,
      color: "text-destructive",
    },
    {
      title: "Medical Policies",
      value: medicalPolicies,
      icon: Activity,
      color: "text-blue-600",
    },
    {
      title: "Motor Policies",
      value: motorPolicies,
      icon: Car,
      color: "text-green-600",
    },
    {
      title: "General Policies",
      value: generalPolicies,
      icon: Building,
      color: "text-orange-600",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Policy Reminders</h1>
          <Button onClick={() => navigate("/policy/new")} size="lg">
            <Plus className="mr-2 h-5 w-5" />
            Add New Policy
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Policies Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Policies</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
