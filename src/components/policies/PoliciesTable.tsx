import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Policy = Tables<"policies">;

interface PoliciesTableProps {
  policies: Policy[];
  isLoading: boolean;
  onEdit: (policy: Policy) => void;
  onDelete: (id: string) => void;
}

export const PoliciesTable = ({ policies, isLoading, onEdit, onDelete }: PoliciesTableProps) => {
  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading policies...</div>;
  }

  if (policies.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No policies found</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Line</TableHead>
            <TableHead>Line Detail</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Count</TableHead>
            <TableHead>Insurer</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Contact Person</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((policy) => (
            <TableRow key={policy.id}>
              <TableCell className="font-medium">{policy.client_name}</TableCell>
              <TableCell className="capitalize">{policy.client_status}</TableCell>
              <TableCell>{policy.line}</TableCell>
              <TableCell>{policy.line_detail || "-"}</TableCell>
              <TableCell>{policy.end_date}</TableCell>
              <TableCell>{policy.count || "-"}</TableCell>
              <TableCell>{policy.insurer_name}</TableCell>
              <TableCell className="capitalize">{policy.channel_type}</TableCell>
              <TableCell>
                <div className="text-sm">
                  <div>{policy.contact_name}</div>
                  <div className="text-muted-foreground">{policy.contact_phone}</div>
                  <div className="text-muted-foreground">{policy.contact_email}</div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onEdit(policy)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(policy.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
