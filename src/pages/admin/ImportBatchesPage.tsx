import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, CheckCircle2, XCircle, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";

interface ImportBatch {
  id: string;
  created_at: string;
  filename: string;
  source: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  skipped_rows: number;
  notes: string | null;
}

interface ImportRow {
  id: string;
  row_index: number;
  import_status: string;
  import_target: string | null;
  parsed_first_name: string | null;
  parsed_last_name: string | null;
  parsed_email_primary: string | null;
  error_message: string | null;
  imported_member_id: string | null;
  imported_crm_contact_id: string | null;
}

export default function ImportBatchesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchRows, setBatchRows] = useState<Record<string, ImportRow[]>>({});
  const [loadingRows, setLoadingRows] = useState<string | null>(null);

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from("crm_import_batches")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBatches(data || []);
    } catch (error) {
      console.error("Error fetching batches:", error);
      toast.error("Failed to load import batches");
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchRows = async (batchId: string) => {
    if (batchRows[batchId]) {
      // Already loaded
      return;
    }

    setLoadingRows(batchId);
    try {
      const { data, error } = await supabase
        .from("crm_import_rows")
        .select("*")
        .eq("batch_id", batchId)
        .order("row_index", { ascending: true })
        .limit(100);

      if (error) throw error;
      setBatchRows((prev) => ({ ...prev, [batchId]: data || [] }));
    } catch (error) {
      console.error("Error fetching batch rows:", error);
      toast.error("Failed to load batch rows");
    } finally {
      setLoadingRows(null);
    }
  };

  const toggleBatch = async (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
    } else {
      setExpandedBatch(batchId);
      await fetchBatchRows(batchId);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-600">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "importing":
        return <Badge variant="secondary">Importing</Badge>;
      case "parsed":
        return <Badge variant="outline">Parsed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRowStatusIcon = (status: string) => {
    switch (status) {
      case "imported":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "skipped":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/crm-import")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
         <div>
           <h1 className="text-2xl font-bold">{t("adminImportBatches.title", "Import Batches")}</h1>
           <p className="text-muted-foreground">{t("adminImportBatches.subtitle", "Review past CRM imports and their results")}</p>
         </div>
      </div>

      {/* Batches List */}
      {batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No import batches found</p>
            <Button variant="link" onClick={() => navigate("/admin/crm-import")}>
              Start a new import
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => (
            <Card key={batch.id}>
              <Collapsible open={expandedBatch === batch.id} onOpenChange={() => toggleBatch(batch.id)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <FileText className="h-8 w-8 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{batch.filename}</CardTitle>
                          <CardDescription>
                            {format(new Date(batch.created_at), "PPp")} · {batch.source}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getStatusBadge(batch.status)}
                        <div className="flex gap-3 text-sm">
                          <span className="text-green-600">{batch.imported_rows} imported</span>
                          <span className="text-destructive">{batch.failed_rows} failed</span>
                          <span className="text-muted-foreground">{batch.skipped_rows} skipped</span>
                        </div>
                        {expandedBatch === batch.id ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {loadingRows === batch.id ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : batchRows[batch.id] && batchRows[batch.id].length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">Row</TableHead>
                            <TableHead className="w-12">Status</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Result</TableHead>
                            <TableHead>Error</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {batchRows[batch.id].map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="font-mono text-xs">{row.row_index + 1}</TableCell>
                              <TableCell>{getRowStatusIcon(row.import_status)}</TableCell>
                              <TableCell>
                                {[row.parsed_first_name, row.parsed_last_name]
                                  .filter(Boolean)
                                  .join(" ") || "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {row.parsed_email_primary || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {row.import_target || "?"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {row.imported_member_id && (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto p-0"
                                    onClick={() => navigate(`/admin/members/${row.imported_member_id}`)}
                                  >
                                    View Member
                                  </Button>
                                )}
                                {row.imported_crm_contact_id && (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto p-0"
                                    onClick={() =>
                                      navigate(`/admin/crm-contacts/${row.imported_crm_contact_id}`)
                                    }
                                  >
                                    View Contact
                                  </Button>
                                )}
                                {!row.imported_member_id && !row.imported_crm_contact_id && "-"}
                              </TableCell>
                              <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                                {row.error_message || "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No rows found</p>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
