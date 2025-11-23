import { useForm } from "react-hook-form";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Policy = Tables<"policies">;
type PolicyInsert = TablesInsert<"policies">;

interface PolicyFormProps {
  editingPolicy: Policy | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PolicyForm = ({ editingPolicy, onSuccess, onCancel }: PolicyFormProps) => {
  const queryClient = useQueryClient();
  
  // Fetch user's company_id
  const { data: companyId } = useQuery({
    queryKey: ["userCompanyId"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      return profile?.company_id;
    },
  });

  const { register, handleSubmit, setValue, watch, reset } = useForm<PolicyInsert>({
    defaultValues: editingPolicy || {
      client_name: "",
      client_status: "existing",
      line: "Medical",
      line_detail: "",
      end_date: "",
      count: null,
      insurer_name: "",
      channel_type: "direct",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      notes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: PolicyInsert) => {
      if (!companyId) throw new Error("Company ID not found");

      const policyData = { ...data, company_id: companyId };

      if (editingPolicy) {
        const { error } = await supabase
          .from("policies")
          .update(policyData)
          .eq("id", editingPolicy.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("policies").insert(policyData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      toast({ title: editingPolicy ? "Policy updated" : "Policy created" });
      reset();
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error saving policy", variant: "destructive" });
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="client_name">Client Name</Label>
          <Input id="client_name" {...register("client_name", { required: true })} />
        </div>

        <div>
          <Label htmlFor="client_status">Client Status</Label>
          <Select
            value={watch("client_status")}
            onValueChange={(value) => setValue("client_status", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="existing">Existing</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="line">Line</Label>
          <Select
            value={watch("line")}
            onValueChange={(value) => setValue("line", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Medical">Medical</SelectItem>
              <SelectItem value="Motor">Motor</SelectItem>
              <SelectItem value="General">General</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="line_detail">Line Detail (optional)</Label>
          <Input id="line_detail" {...register("line_detail")} />
        </div>

        <div>
          <Label htmlFor="end_date">End Date</Label>
          <Input id="end_date" type="date" {...register("end_date", { required: true })} />
        </div>

        <div>
          <Label htmlFor="count">Count (optional)</Label>
          <Input
            id="count"
            type="number"
            {...register("count", { valueAsNumber: true })}
          />
        </div>

        <div>
          <Label htmlFor="insurer_name">Insurer Name</Label>
          <Input id="insurer_name" {...register("insurer_name", { required: true })} />
        </div>

        <div>
          <Label htmlFor="channel_type">Channel</Label>
          <Select
            value={watch("channel_type")}
            onValueChange={(value) => setValue("channel_type", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="broker">Broker</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="contact_name">Contact Name</Label>
          <Input id="contact_name" {...register("contact_name", { required: true })} />
        </div>

        <div>
          <Label htmlFor="contact_email">Contact Email</Label>
          <Input id="contact_email" type="email" {...register("contact_email", { required: true })} />
        </div>

        <div>
          <Label htmlFor="contact_phone">Contact Phone</Label>
          <Input id="contact_phone" {...register("contact_phone", { required: true })} />
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" {...register("notes")} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : editingPolicy ? "Update Policy" : "Create Policy"}
        </Button>
        {editingPolicy && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};
