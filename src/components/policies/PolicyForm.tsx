import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useState } from "react";
import { FileText, X, Upload } from "lucide-react";
import { policySchema, type PolicyFormData } from "@/lib/validations/policy";

type Policy = Tables<"policies">;
type PolicyInsert = TablesInsert<"policies">;

interface PolicyFormProps {
  editingPolicy: Policy | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PolicyForm = ({ editingPolicy, onSuccess, onCancel }: PolicyFormProps) => {
  const queryClient = useQueryClient();
  const [uploadedDocuments, setUploadedDocuments] = useState<string[]>(editingPolicy?.documents || []);
  const [uploading, setUploading] = useState(false);
  
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

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema),
    defaultValues: editingPolicy ? {
      client_name: editingPolicy.client_name,
      client_status: editingPolicy.client_status as "existing" | "prospect",
      line: editingPolicy.line as "Medical" | "Motor" | "General",
      line_detail: editingPolicy.line_detail || null,
      end_date: editingPolicy.end_date,
      count: editingPolicy.count,
      insurer_name: editingPolicy.insurer_name,
      channel_type: editingPolicy.channel_type as "direct" | "broker",
      contact_name: editingPolicy.contact_name,
      contact_email: editingPolicy.contact_email,
      contact_phone: editingPolicy.contact_phone,
      notes: editingPolicy.notes || null,
    } : {
      client_name: "",
      client_status: "existing",
      line: "Medical",
      line_detail: null,
      end_date: "",
      count: null,
      insurer_name: "",
      channel_type: "direct",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      notes: null,
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newDocumentUrls: string[] = [];

    try {
      const policyId = editingPolicy?.id || crypto.randomUUID();

      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${policyId}/${fileName}`;

        const { error: uploadError, data } = await supabase.storage
          .from('policy-documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('policy-documents')
          .getPublicUrl(filePath);

        newDocumentUrls.push(filePath);
      }

      setUploadedDocuments([...uploadedDocuments, ...newDocumentUrls]);
      toast({ title: `${files.length} document(s) uploaded successfully` });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "Error uploading documents", variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRemoveDocument = async (documentPath: string) => {
    try {
      const { error } = await supabase.storage
        .from('policy-documents')
        .remove([documentPath]);

      if (error) throw error;

      setUploadedDocuments(uploadedDocuments.filter(doc => doc !== documentPath));
      toast({ title: "Document removed" });
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: "Error removing document", variant: "destructive" });
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: PolicyFormData) => {
      if (!companyId) throw new Error("Company ID not found");

      const policyData = { 
        client_name: data.client_name,
        client_status: data.client_status,
        line: data.line,
        line_detail: data.line_detail || null,
        end_date: data.end_date,
        count: data.count ?? null,
        insurer_name: data.insurer_name,
        channel_type: data.channel_type,
        contact_name: data.contact_name,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone,
        notes: data.notes || null,
        company_id: companyId,
        documents: uploadedDocuments.length > 0 ? uploadedDocuments : null
      } as TablesInsert<"policies">;

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
      setUploadedDocuments([]);
      onSuccess();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error saving policy", 
        description: error.message || "Please check your input and try again",
        variant: "destructive" 
      });
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="client_name">Client Name</Label>
          <Input id="client_name" {...register("client_name")} />
          {errors.client_name && (
            <p className="text-sm text-destructive mt-1">{errors.client_name.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="client_status">Client Status</Label>
          <Select
            value={watch("client_status")}
            onValueChange={(value) => setValue("client_status", value as "existing" | "prospect")}
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
            onValueChange={(value) => setValue("line", value as "Medical" | "Motor" | "General")}
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
          {errors.line_detail && (
            <p className="text-sm text-destructive mt-1">{errors.line_detail.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="end_date">End Date</Label>
          <Input id="end_date" type="date" {...register("end_date")} />
          {errors.end_date && (
            <p className="text-sm text-destructive mt-1">{errors.end_date.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="count">Count (optional)</Label>
          <Input
            id="count"
            type="number"
            {...register("count", { valueAsNumber: true })}
          />
          {errors.count && (
            <p className="text-sm text-destructive mt-1">{errors.count.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="insurer_name">Insurer Name</Label>
          <Input id="insurer_name" {...register("insurer_name")} />
          {errors.insurer_name && (
            <p className="text-sm text-destructive mt-1">{errors.insurer_name.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="channel_type">Channel</Label>
          <Select
            value={watch("channel_type")}
            onValueChange={(value) => setValue("channel_type", value as "direct" | "broker")}
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
          <Input id="contact_name" {...register("contact_name")} />
          {errors.contact_name && (
            <p className="text-sm text-destructive mt-1">{errors.contact_name.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="contact_email">Contact Email</Label>
          <Input id="contact_email" type="email" {...register("contact_email")} />
          {errors.contact_email && (
            <p className="text-sm text-destructive mt-1">{errors.contact_email.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="contact_phone">Contact Phone</Label>
          <Input id="contact_phone" {...register("contact_phone")} />
          {errors.contact_phone && (
            <p className="text-sm text-destructive mt-1">{errors.contact_phone.message}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" {...register("notes")} />
        {errors.notes && (
          <p className="text-sm text-destructive mt-1">{errors.notes.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="documents">Documents (optional)</Label>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              id="documents"
              type="file"
              multiple
              onChange={handleFileUpload}
              disabled={uploading}
              className="flex-1"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            />
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-4 w-4 animate-pulse" />
                Uploading...
              </div>
            )}
          </div>
          
          {uploadedDocuments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {uploadedDocuments.length} document(s) uploaded
              </p>
              <div className="space-y-1">
                {uploadedDocuments.map((doc, index) => (
                  <div
                    key={doc}
                    className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span className="text-sm truncate">
                        {doc.split('/').pop()}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveDocument(doc)}
                      className="h-8 w-8 flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
