import { useState, useRef } from "react";
import { format } from "date-fns";
import { Upload, Trash2, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useStaffDocuments, useUploadStaffDocument, useDeleteStaffDocument } from "@/hooks/useStaffDocuments";
import type { StaffDocument, StaffDocumentType } from "@/types/staff";

interface StaffDocumentsTabProps {
  staffId: string;
}

const DOCUMENT_TYPE_LABELS: Record<StaffDocumentType, string> = {
  nie_copy: "NIE Copy",
  contract: "Contract",
  cv: "CV / Resume",
  certification: "Certification",
  other: "Other",
};

function getDocTypeBadge(type: StaffDocumentType) {
  switch (type) {
    case "nie_copy":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">NIE Copy</Badge>;
    case "contract":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Contract</Badge>;
    case "cv":
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">CV</Badge>;
    case "certification":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Certification</Badge>;
    default:
      return <Badge variant="outline">Other</Badge>;
  }
}

export function StaffDocumentsTab({ staffId }: StaffDocumentsTabProps) {
  const { data: documents, isLoading } = useStaffDocuments(staffId);
  const uploadDocument = useUploadStaffDocument();
  const deleteDocument = useDeleteStaffDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<StaffDocumentType>("other");
  const [documentToDelete, setDocumentToDelete] = useState<StaffDocument | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadDocument.mutateAsync({
      staffId,
      file,
      documentType: selectedType,
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;
    await deleteDocument.mutateAsync({ document: documentToDelete });
    setDocumentToDelete(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={selectedType}
              onValueChange={(v) => setSelectedType(v as StaffDocumentType)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Document type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadDocument.isPending}
            >
              {uploadDocument.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  Loading documents...
                </TableCell>
              </TableRow>
            ) : documents && documents.length > 0 ? (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {doc.file_name}
                    </div>
                  </TableCell>
                  <TableCell>{getDocTypeBadge(doc.document_type)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(doc.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                      >
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDocumentToDelete(doc)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No documents uploaded yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={!!documentToDelete} onOpenChange={(open) => !open && setDocumentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{documentToDelete?.file_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDocument.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteDocument.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDocument.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
