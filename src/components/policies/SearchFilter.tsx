import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface SearchFilterProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  lineFilter: string;
  onLineFilterChange: (value: string) => void;
}

export const SearchFilter = ({
  searchTerm,
  onSearchChange,
  lineFilter,
  onLineFilterChange,
}: SearchFilterProps) => {
  return (
    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor="search">Search by Client Name</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            type="text"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="line-filter">Filter by Line</Label>
        <Select value={lineFilter} onValueChange={onLineFilterChange}>
          <SelectTrigger id="line-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All</SelectItem>
            <SelectItem value="Medical">Medical</SelectItem>
            <SelectItem value="Motor">Motor</SelectItem>
            <SelectItem value="General">General</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
