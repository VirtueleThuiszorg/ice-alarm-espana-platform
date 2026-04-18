import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Search, ChevronDown, ChevronRight, Download,
  ChevronLeft, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO, subDays } from "date-fns";
import { Json } from "@/integrations/supabase/types";

interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: Json | null;
  new_values: Json | null;
  staff_id: string | null;
  created_at: string | null;
  ip_address: string | null;
  staff?: {
    first_name: string;
    last_name: string;
  } | null;
}

const PAGE_SIZE = 25;

function JsonDiff({ label, data }: { label: string; data: Json | null }) {
  if (!data) return <span className="text-muted-foreground italic">No data</span>;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
      <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  // Distinct values for filter dropdowns
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchFilterOptions = useCallback(async () => {
    try {
      const { data: actions } = await supabase
        .from("activity_logs")
        .select("action")
        .limit(500);

      const { data: entities } = await supabase
        .from("activity_logs")
        .select("entity_type")
        .limit(500);

      if (actions) {
        const unique = [...new Set(actions.map((a) => a.action))].sort();
        setActionTypes(unique);
      }
      if (entities) {
        const unique = [...new Set(entities.map((e) => e.entity_type))].sort();
        setEntityTypes(unique);
      }
    } catch (error) {
      console.error("Error fetching filter options:", error);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("activity_logs")
        .select(
          `*, staff:staff!activity_logs_staff_id_fkey(first_name, last_name)`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // Apply date range
      if (dateFrom) {
        query = query.gte("created_at", `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte("created_at", `${dateTo}T23:59:59`);
      }

      // Apply action filter
      if (actionFilter && actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      // Apply entity type filter
      if (entityTypeFilter && entityTypeFilter !== "all") {
        query = query.eq("entity_type", entityTypeFilter);
      }

      // Apply text search across action, entity_type, entity_id
      if (searchQuery.trim()) {
        query = query.or(
          `action.ilike.%${searchQuery}%,entity_type.ilike.%${searchQuery}%,entity_id.ilike.%${searchQuery}%`
        );
      }

      // Pagination
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast.error("Failed to load audit logs");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, dateFrom, dateTo, actionFilter, entityTypeFilter, searchQuery]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, actionFilter, entityTypeFilter, searchQuery]);

  const getActionBadgeColor = (action: string) => {
    if (action.startsWith("create") || action.startsWith("insert")) return "bg-green-600";
    if (action.startsWith("update") || action.startsWith("edit")) return "bg-blue-500";
    if (action.startsWith("delete") || action.startsWith("remove")) return "bg-red-500";
    return "bg-gray-500";
  };

  const exportToCsv = () => {
    if (logs.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Date/Time", "Action", "Entity Type", "Entity ID", "User", "IP Address", "Old Values", "New Values"];
    const rows = logs.map((log) => [
      log.created_at ? format(parseISO(log.created_at), "yyyy-MM-dd HH:mm:ss") : "",
      log.action,
      log.entity_type,
      log.entity_id,
      log.staff ? `${log.staff.first_name} ${log.staff.last_name}` : "",
      log.ip_address || "",
      log.old_values ? JSON.stringify(log.old_values) : "",
      log.new_values ? JSON.stringify(log.new_values) : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Audit log exported successfully");
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground">
            {totalCount} entries found
          </p>
        </div>
        <Button onClick={exportToCsv} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative lg:col-span-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From date"
              />
            </div>
            <div>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To date"
              />
            </div>
            <div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actionTypes.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Entity Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entity Types</SelectItem>
                  {entityTypes.map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      {entity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Date/Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No audit log entries found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <>
                    <TableRow
                      key={log.id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedRow(expandedRow === log.id ? null : log.id)
                      }
                    >
                      <TableCell className="w-8">
                        {expandedRow === log.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {log.created_at
                          ? format(parseISO(log.created_at), "MMM d, yyyy HH:mm:ss")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={getActionBadgeColor(log.action)}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.entity_type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-mono max-w-[200px] truncate">
                        {log.entity_id}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.staff
                          ? `${log.staff.first_name} ${log.staff.last_name}`
                          : <span className="text-muted-foreground">System</span>}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {log.ip_address || "-"}
                      </TableCell>
                    </TableRow>
                    {expandedRow === log.id && (
                      <TableRow key={`${log.id}-expanded`}>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                            <JsonDiff label="Old Values" data={log.old_values} />
                            <JsonDiff label="New Values" data={log.new_values} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
            {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
