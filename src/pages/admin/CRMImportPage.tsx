import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, AlertCircle, CheckCircle2, Users, UserX, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { parseCSV, parseCSVRow, getImportStats, type ParsedCRMRow } from "@/lib/crmImport";

type ImportMode = 'members_only' | 'members_and_contacts';

export default function CRMImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedCRMRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMode, setImportMode] = useState<ImportMode>('members_and_contacts');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [importComplete, setImportComplete] = useState(false);
  const [importResults, setImportResults] = useState<{
    imported: number;
    failed: number;
    skipped: number;
  } | null>(null);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      processFile(droppedFile);
    } else {
      toast.error("Please upload a CSV file");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  }, []);

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setImportComplete(false);
    setImportResults(null);
    
    try {
      const text = await selectedFile.text();
      const rows = parseCSV(text);
      
      const parsed = rows.map(parseCSVRow);
      setParsedRows(parsed);
      
      // Create batch record
      const { data: batch, error } = await supabase
        .from('crm_import_batches')
        .insert({
          filename: selectedFile.name,
          total_rows: rows.length,
          status: 'parsed',
        })
        .select()
        .single();
      
      if (error) throw error;
      setBatchId(batch.id);
      
      toast.success(`Loaded ${rows.length} rows from CSV`);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error("Failed to process CSV file");
    }
  };

  const startImport = async () => {
    if (!batchId || parsedRows.length === 0) return;
    
    setImporting(true);
    setImportProgress(0);
    
    let imported = 0;
    let failed = 0;
    let skipped = 0;
    
    try {
      // Update batch status
      await supabase
        .from('crm_import_batches')
        .update({ status: 'importing' })
        .eq('id', batchId);
      
      // Insert raw rows first
      const rawRowsToInsert = parsedRows.map((row, index) => ({
        batch_id: batchId,
        row_index: index,
        raw: row.raw,
        dedupe_key: row.dedupeKey,
        parsed_first_name: row.firstName,
        parsed_last_name: row.lastName,
        parsed_full_name: row.fullName,
        parsed_email_primary: row.emailPrimary,
        parsed_phone_primary: row.phonePrimary,
        parsed_status: row.status,
        parsed_stage: row.stage,
        parsed_referral_source: row.referralSource,
        parsed_city: row.city,
        parsed_postal_code: row.postalCode,
        parsed_country: row.country,
        parsed_membership_type: row.membershipType,
        parsed_device_imei: row.deviceImei,
        parsed_notes: row.notes,
        import_target: row.importTarget,
        import_status: 'pending' as const,
      }));
      
      // Insert in chunks
      const chunkSize = 100;
      for (let i = 0; i < rawRowsToInsert.length; i += chunkSize) {
        const chunk = rawRowsToInsert.slice(i, i + chunkSize);
        await supabase.from('crm_import_rows').insert(chunk);
        setImportProgress(Math.min(20, (i / rawRowsToInsert.length) * 20));
      }
      
      // Process each row for actual import
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const progress = 20 + ((i / parsedRows.length) * 80);
        setImportProgress(progress);
        
        try {
          if (row.importTarget === 'skip') {
            skipped++;
            await updateImportRow(batchId, i, 'skipped', null, null, 'Empty or invalid row');
            continue;
          }
          
          if (row.importTarget === 'member' || (importMode === 'members_only' && row.canBeMember)) {
            // Try to create member
            if (row.canBeMember) {
              const memberId = await createMember(row);
              if (memberId) {
                await updateImportRow(batchId, i, 'imported', memberId, null, null);
                imported++;
              } else {
                throw new Error('Failed to create member');
              }
            } else if (importMode === 'members_only') {
              skipped++;
              await updateImportRow(batchId, i, 'skipped', null, null, 'Missing required fields for member');
            } else {
              // Fall back to CRM contact
              const contactId = await createCrmContact(row);
              await updateImportRow(batchId, i, 'imported', null, contactId, null);
              imported++;
            }
          } else if (row.importTarget === 'crm_contact' && importMode === 'members_and_contacts') {
            // Create CRM contact
            const contactId = await createCrmContact(row);
            await updateImportRow(batchId, i, 'imported', null, contactId, null);
            imported++;
          } else {
            skipped++;
            await updateImportRow(batchId, i, 'skipped', null, null, 'Import mode excludes this row');
          }
        } catch (error) {
          console.error(`Error importing row ${i}:`, error);
          failed++;
          await updateImportRow(batchId, i, 'failed', null, null, error instanceof Error ? error.message : 'Unknown error');
        }
      }
      
      // Update batch with final counts
      await supabase
        .from('crm_import_batches')
        .update({
          status: 'completed',
          imported_rows: imported,
          failed_rows: failed,
          skipped_rows: skipped,
        })
        .eq('id', batchId);
      
      setImportResults({ imported, failed, skipped });
      setImportComplete(true);
      toast.success(`Import complete: ${imported} imported, ${failed} failed, ${skipped} skipped`);
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error("Import failed");
      
      await supabase
        .from('crm_import_batches')
        .update({ status: 'failed' })
        .eq('id', batchId);
    } finally {
      setImporting(false);
      setImportProgress(100);
    }
  };

  const updateImportRow = async (
    batchId: string,
    rowIndex: number,
    status: 'imported' | 'failed' | 'skipped',
    memberId: string | null,
    contactId: string | null,
    errorMessage: string | null
  ) => {
    await supabase
      .from('crm_import_rows')
      .update({
        import_status: status,
        imported_member_id: memberId,
        imported_crm_contact_id: contactId,
        error_message: errorMessage,
      })
      .eq('batch_id', batchId)
      .eq('row_index', rowIndex);
  };

  const createMember = async (row: ParsedCRMRow): Promise<string | null> => {
    // Parse date of birth
    let dob: string | null = null;
    if (row.dateOfBirth) {
      const parsed = new Date(row.dateOfBirth);
      if (!isNaN(parsed.getTime())) {
        dob = parsed.toISOString().split('T')[0];
      }
    }
    
    if (!dob) return null;

    // Create member
    const { data: member, error } = await supabase
      .from('members')
      .insert({
        first_name: row.firstName,
        last_name: row.lastName,
        email: row.emailPrimary || `imported-${Date.now()}@placeholder.local`,
        phone: row.phonePrimary || 'N/A',
        date_of_birth: dob,
        address_line_1: row.addressLine1 || 'N/A',
        address_line_2: row.addressLine2 || null,
        city: row.city || 'N/A',
        province: row.province || 'N/A',
        postal_code: row.postalCode || 'N/A',
        country: row.country || 'Spain',
        special_instructions: row.notes || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;
    if (!member) return null;

    // Create CRM profile
    await supabase.from('crm_profiles').insert({
      member_id: member.id,
      stage: row.stage || null,
      status: row.status || null,
      referral_source: row.referralSource || null,
    });

    // Create extra contact methods
    for (const email of row.extraEmails) {
      await supabase.from('member_contact_methods').insert({
        member_id: member.id,
        type: 'email',
        label: email.label,
        value: email.value,
      });
    }
    for (const phone of row.extraPhones) {
      await supabase.from('member_contact_methods').insert({
        member_id: member.id,
        type: 'phone',
        label: phone.label,
        value: phone.value,
      });
    }

    // Create member note if notes exist
    if (row.notes) {
      await supabase.from('member_notes').insert({
        member_id: member.id,
        content: row.notes,
        note_type: 'general',
      });
    }

    // Create medical info if any
    if (row.medicalConditions || row.medications || row.allergies || row.bloodType) {
      await supabase.from('medical_information').insert({
        member_id: member.id,
        medical_conditions: row.medicalConditions ? [row.medicalConditions] : [],
        medications: row.medications ? [row.medications] : [],
        allergies: row.allergies ? [row.allergies] : [],
        blood_type: row.bloodType || null,
        doctor_name: row.doctorName || null,
        doctor_phone: row.doctorPhone || null,
        hospital_preference: row.hospitalPreference || null,
      });
    }

    // Create emergency contacts
    const emergencyContacts = [row.emergencyContact1, row.emergencyContact2, row.emergencyContact3].filter(Boolean);
    for (let i = 0; i < emergencyContacts.length; i++) {
      const ec = emergencyContacts[i];
      if (ec) {
        await supabase.from('emergency_contacts').insert({
          member_id: member.id,
          contact_name: ec.name,
          phone: ec.phone || 'N/A',
          relationship: ec.relationship,
          priority_order: i + 1,
          is_primary: i === 0,
        });
      }
    }

    // Create device if IMEI exists
    if (row.deviceImei) {
      await supabase.from('devices').insert([{
        imei: row.deviceImei,
        sim_phone_number: 'TBD',
        member_id: member.id,
        status: 'active' as const,
      }]);
    }

    return member.id;
  };

  const createCrmContact = async (row: ParsedCRMRow): Promise<string> => {
    const { data, error } = await supabase
      .from('crm_contacts')
      .insert({
        first_name: row.firstName || null,
        last_name: row.lastName || null,
        full_name: row.fullName || null,
        email_primary: row.emailPrimary || null,
        phone_primary: row.phonePrimary || null,
        status: row.status || null,
        stage: row.stage || null,
        referral_source: row.referralSource || null,
        address_line_1: row.addressLine1 || null,
        address_line_2: row.addressLine2 || null,
        city: row.city || null,
        province: row.province || null,
        postal_code: row.postalCode || null,
        country: row.country || null,
        notes: row.notes || null,
        source: 'karmacrm',
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  };

  const stats = parsedRows.length > 0 ? getImportStats(parsedRows) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
         <div>
           <h1 className="text-2xl font-bold">{t("adminCRMImport.title", "CRM Import")}</h1>
           <p className="text-muted-foreground">{t("adminCRMImport.subtitle", "Import contacts from KarmaCRM CSV exports")}</p>
         </div>
      </div>

      {/* Upload Area */}
      {!file && (
        <Card>
          <CardContent className="pt-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer"
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Drop CSV file here</h3>
              <p className="text-muted-foreground mb-4">or click to browse</p>
              <input
                id="file-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button variant="outline">Select File</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Info & Stats */}
      {file && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">File</p>
                  <p className="font-medium truncate max-w-[150px]">{file.name}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Can be Members</p>
                  <p className="text-2xl font-bold">{stats.members}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-yellow-600" />
                <div>
                  <p className="text-sm text-muted-foreground">CRM Contacts Only</p>
                  <p className="text-2xl font-bold">{stats.crmContacts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <UserX className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Will Skip</p>
                  <p className="text-2xl font-bold">{stats.skipped}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Import Mode Selection */}
      {file && stats && !importing && !importComplete && (
        <Card>
          <CardHeader>
            <CardTitle>Import Mode</CardTitle>
            <CardDescription>Choose how to handle incomplete records</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
              <div className="flex items-start space-x-3 p-4 border rounded-lg">
                <RadioGroupItem value="members_and_contacts" id="mode-both" />
                <div>
                  <Label htmlFor="mode-both" className="font-medium cursor-pointer">
                    Import Members + Create CRM Contacts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Complete records become members. Incomplete records are stored as CRM contacts for later follow-up.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-4 border rounded-lg mt-2">
                <RadioGroupItem value="members_only" id="mode-members" />
                <div>
                  <Label htmlFor="mode-members" className="font-medium cursor-pointer">
                    Import Complete Members Only
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Only import rows that have all required member fields. Skip incomplete records.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      {importing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Importing...</span>
              </div>
              <Progress value={importProgress} />
              <p className="text-sm text-muted-foreground">{Math.round(importProgress)}% complete</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importComplete && importResults && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <h3 className="text-lg font-medium text-green-800">Import Complete</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-green-600">{importResults.imported}</p>
                <p className="text-sm text-muted-foreground">Imported</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-red-600">{importResults.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-muted-foreground">{importResults.skipped}</p>
                <p className="text-sm text-muted-foreground">Skipped</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => navigate('/admin/members')}>View Members</Button>
              <Button variant="outline" onClick={() => {
                setFile(null);
                setParsedRows([]);
                setBatchId(null);
                setImportComplete(false);
                setImportResults(null);
              }}>Import Another File</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Table */}
      {parsedRows.length > 0 && !importing && !importComplete && (
        <Card>
          <CardHeader>
            <CardTitle>Preview (First 25 Rows)</CardTitle>
            <CardDescription>Review the parsed data before importing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Membership</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 25).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant={
                          row.importTarget === 'member' ? 'default' :
                          row.importTarget === 'crm_contact' ? 'secondary' :
                          'outline'
                        }>
                          {row.importTarget}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{row.fullName || '-'}</TableCell>
                      <TableCell>{row.emailPrimary || '-'}</TableCell>
                      <TableCell>{row.phonePrimary || '-'}</TableCell>
                      <TableCell>{row.status || '-'}</TableCell>
                      <TableCell>{row.stage || '-'}</TableCell>
                      <TableCell>{row.city || '-'}</TableCell>
                      <TableCell>{row.membershipType || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedRows.length > 25 && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Showing 25 of {parsedRows.length} rows
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import Button */}
      {file && stats && !importing && !importComplete && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => {
            setFile(null);
            setParsedRows([]);
            setBatchId(null);
          }}>
            Cancel
          </Button>
          <Button onClick={startImport} disabled={stats.members + stats.crmContacts === 0}>
            Start Import
          </Button>
        </div>
      )}
    </div>
  );
}
