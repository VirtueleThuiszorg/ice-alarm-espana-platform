import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface BulkImeiImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportResult {
  total: number;
  success: number;
  duplicates: number;
  invalid: number;
  errors: string[];
}

function validateImei(imei: string): boolean {
  // IMEI must be exactly 15 digits
  return /^\d{15}$/.test(imei.trim());
}

export function BulkImeiImportModal({ open, onOpenChange }: BulkImeiImportModalProps) {
  const queryClient = useQueryClient();
  const [rawInput, setRawInput] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const parsedImeis = rawInput
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const validImeis = parsedImeis.filter(validateImei);
  const invalidImeis = parsedImeis.filter((i) => !validateImei(i));
  const uniqueImeis = [...new Set(validImeis)];
  const inputDuplicates = validImeis.length - uniqueImeis.length;

  const handleImport = async () => {
    if (uniqueImeis.length === 0) return;
    setIsImporting(true);

    const importResult: ImportResult = {
      total: uniqueImeis.length,
      success: 0,
      duplicates: 0,
      invalid: invalidImeis.length,
      errors: [],
    };

    // Insert in batches of 50
    const batchSize = 50;
    for (let i = 0; i < uniqueImeis.length; i += batchSize) {
      const batch = uniqueImeis.slice(i, i + batchSize);
      const rows = batch.map((imei) => ({
        imei,
        model: "EV-07B",
        status: "in_stock" as const,
        member_id: null,
        management_mode: "manual",
      }));

      const { data, error } = await supabase
        .from("devices")
        .insert(rows as any)
        .select("id");

      if (error) {
        // Handle individual duplicate errors by inserting one at a time
        if (error.message.includes("duplicate")) {
          for (const row of rows) {
            const { error: singleError } = await supabase
              .from("devices")
              .insert(row as any)
              .select("id");

            if (singleError) {
              if (singleError.message.includes("duplicate")) {
                importResult.duplicates++;
              } else {
                importResult.errors.push(`${row.imei}: ${singleError.message}`);
              }
            } else {
              importResult.success++;
            }
          }
        } else {
          importResult.errors.push(`Batch error: ${error.message}`);
        }
      } else {
        importResult.success += data?.length || batch.length;
      }
    }

    setResult(importResult);
    setIsImporting(false);

    if (importResult.success > 0) {
      queryClient.invalidateQueries({ queryKey: ["device-stock"] });
      queryClient.invalidateQueries({ queryKey: ["device-stock-stats"] });
      toast.success(`${importResult.success} device(s) imported successfully`);
    }
  };

  const handleClose = () => {
    setRawInput("");
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk IMEI Import
          </DialogTitle>
          <DialogDescription>
            Paste a list of IMEI numbers to add multiple EV-07B devices to stock at once.
            SIM cards and settings can be configured later during provisioning.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="imei-list">IMEI Numbers</Label>
                <Textarea
                  id="imei-list"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Enter IMEI numbers, one per line or comma-separated:&#10;&#10;123456789012345&#10;123456789012346&#10;123456789012347"
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Each IMEI must be exactly 15 digits. Separate with newlines, commas, or semicolons.
                </p>
              </div>

              {/* Validation summary */}
              {parsedImeis.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">{uniqueImeis.length} valid</Badge>
                  {invalidImeis.length > 0 && (
                    <Badge variant="destructive">{invalidImeis.length} invalid</Badge>
                  )}
                  {inputDuplicates > 0 && (
                    <Badge variant="secondary">{inputDuplicates} duplicates in input</Badge>
                  )}
                </div>
              )}

              {/* Show invalid IMEIs */}
              {invalidImeis.length > 0 && (
                <div className="text-sm">
                  <p className="text-destructive font-medium mb-1">Invalid IMEIs:</p>
                  <div className="bg-destructive/10 rounded p-2 font-mono text-xs max-h-24 overflow-y-auto">
                    {invalidImeis.map((imei, i) => (
                      <div key={i}>{imei}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={uniqueImeis.length === 0 || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import {uniqueImeis.length} Device(s)
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Import Results */}
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">{result.success} Imported</p>
                    <p className="text-xs text-muted-foreground">Successfully added</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="text-sm font-medium">{result.duplicates} Skipped</p>
                    <p className="text-xs text-muted-foreground">Already in database</p>
                  </div>
                </div>
              </div>

              {result.invalid > 0 && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm font-medium">{result.invalid} Invalid</p>
                    <p className="text-xs text-muted-foreground">Not valid 15-digit IMEIs</p>
                  </div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="text-sm">
                  <p className="text-destructive font-medium mb-1">Errors:</p>
                  <div className="bg-destructive/10 rounded p-2 text-xs max-h-24 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
