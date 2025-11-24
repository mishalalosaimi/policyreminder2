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
import { useState } from "react";
import { FileText, X, Upload } from "lucide-react";

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
    mutationFn: async (data: PolicyInsert) => {
      if (!companyId) throw new Error("Company ID not found");

      const policyData = { 
        ...data, 
        company_id: companyId,
        documents: uploadedDocuments.length > 0 ? uploadedDocuments : null
      };

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
