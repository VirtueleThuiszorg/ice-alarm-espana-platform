import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Users,
  Bot,
  Shield,
  Loader2,
  Printer,
  FileType,
} from "lucide-react";
import { format } from "date-fns";
import {
  useDocumentation,
  useDeleteDocument,
  Documentation,
  DocumentCategory,
  DocumentStatus,
  VisibilityType,
} from "@/hooks/useDocumentation";
import { DocumentEditor } from "./DocumentEditor";
import { DocumentViewerModal } from "./DocumentViewerModal";
import { printDocument, downloadMarkdown, downloadText } from "@/lib/documentPrint";

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  general: "General Procedures",
  member_guide: "Member Guides",
  staff: "Staff Instructions",
  device: "Device Guides",
  emergency: "Emergency Protocols",
  partner: "Partner Information",
};

const CATEGORY_COLORS: Record<DocumentCategory, string> = {
  general: "bg-blue-100 text-blue-800",
  member_guide: "bg-green-100 text-green-800",
  staff: "bg-purple-100 text-purple-800",
  device: "bg-orange-100 text-orange-800",
  emergency: "bg-red-100 text-red-800",
  partner: "bg-teal-100 text-teal-800",
};

const VISIBILITY_ICONS: Record<VisibilityType, React.ReactNode> = {
  admin: <Shield className="h-3 w-3" />,
  staff: <Users className="h-3 w-3" />,
  member: <Eye className="h-3 w-3" />,
  ai: <Bot className="h-3 w-3" />,
};

export function DocumentationSettingsTab() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Documentation | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Documentation | null>(null);

  const { data: documents, isLoading } = useDocumentation({
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
  });

  const deleteMutation = useDeleteDocument();

  const handleView = (doc: Documentation) => {
    setSelectedDoc(doc);
    setViewerOpen(true);
  };

  const handleEdit = (doc: Documentation) => {
    setSelectedDoc(doc);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setSelectedDoc(null);
    setEditorOpen(true);
  };

  const handleDeleteClick = (doc: Documentation) => {
    setDocToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (docToDelete) {
      await deleteMutation.mutateAsync(docToDelete.id);
      setDeleteDialogOpen(false);
      setDocToDelete(null);
    }
  };

  const renderVisibilityBadges = (visibility: VisibilityType[]) => {
    return (
      <div className="flex gap-1">
        {visibility.map((v) => (
          <Badge
            key={v}
            variant="outline"
            className="gap-1 text-xs capitalize"
          >
            {VISIBILITY_ICONS[v]}
            {v}
          </Badge>
        ))}
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documentation Center
              </CardTitle>
              <CardDescription>
                Manage company procedures, guides, and knowledge base
              </CardDescription>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as DocumentCategory | "all")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as DocumentStatus | "all")}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : documents && documents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        {doc.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {doc.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {doc.tags.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{doc.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={CATEGORY_COLORS[doc.category]}>
                        {CATEGORY_LABELS[doc.category]}
                      </Badge>
                    </TableCell>
                    <TableCell>{renderVisibilityBadges(doc.visibility)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {doc.language}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={doc.status === "published" ? "default" : "secondary"}
                      >
                        {doc.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(doc.updated_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleView(doc)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(doc)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => printDocument(doc)}>
                            <Printer className="h-4 w-4 mr-2" />
                            Print / PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => downloadMarkdown(doc)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Download (.md)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => downloadText(doc)}>
                            <FileType className="h-4 w-4 mr-2" />
                            Download (.txt)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteClick(doc)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No documents found</p>
              <p className="text-sm">Create your first document to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        document={selectedDoc}
      />

      {/* Document Editor Dialog */}
      <DocumentEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        document={selectedDoc}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{docToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
