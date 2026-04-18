import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Printer,
  Download,
  FileText,
  FileType,
  Eye,
  Users,
  Bot,
  Shield,
  Calendar,
  Tag,
} from "lucide-react";
import { format } from "date-fns";
import {
  Documentation,
  DocumentCategory,
  VisibilityType,
} from "@/hooks/useDocumentation";
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
  general: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  member_guide: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  staff: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  device: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  emergency: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  partner: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
};

const VISIBILITY_CONFIG: Record<VisibilityType, { icon: React.ReactNode; label: string }> = {
  admin: { icon: <Shield className="h-3 w-3" />, label: "Admin" },
  staff: { icon: <Users className="h-3 w-3" />, label: "Staff" },
  member: { icon: <Eye className="h-3 w-3" />, label: "Member" },
  ai: { icon: <Bot className="h-3 w-3" />, label: "AI" },
};

interface DocumentViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Documentation | null;
}

export function DocumentViewerModal({
  open,
  onOpenChange,
  document: doc,
}: DocumentViewerModalProps) {
  if (!doc) return null;

  const handlePrint = () => {
    printDocument(doc);
  };

  const handleDownloadMd = () => {
    downloadMarkdown(doc);
  };

  const handleDownloadTxt = () => {
    downloadText(doc);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0" hideCloseButton>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">{doc.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Badge className={CATEGORY_COLORS[doc.category]}>
                  {CATEGORY_LABELS[doc.category]}
                </Badge>
                <span className="text-muted-foreground">•</span>
                <Badge variant="outline" className="uppercase text-xs">
                  {doc.language}
                </Badge>
                <span className="text-muted-foreground">•</span>
                <span className="text-xs">v{doc.version}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print / PDF
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadMd}>
                  <FileText className="h-4 w-4 mr-2" />
                  Markdown (.md)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadTxt}>
                  <FileType className="h-4 w-4 mr-2" />
                  Plain Text (.txt)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 px-6 py-6">
          <article className="prose prose-sm sm:prose max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-a:text-primary prose-strong:font-semibold prose-ul:list-disc prose-ol:list-decimal">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {doc.content}
            </ReactMarkdown>
          </article>
        </ScrollArea>

        {/* Footer with metadata */}
        <div className="px-6 py-4 border-t bg-muted/20">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {/* Tags */}
            {doc.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <div className="flex gap-1">
                  {doc.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="h-4 w-px bg-border" />

            {/* Visibility */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">Visible to:</span>
              <div className="flex gap-1">
                {doc.visibility.map((v) => (
                  <Badge
                    key={v}
                    variant="outline"
                    className="gap-1 text-xs capitalize"
                  >
                    {VISIBILITY_CONFIG[v].icon}
                    {VISIBILITY_CONFIG[v].label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Last updated */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="text-xs">
                Updated: {format(new Date(doc.updated_at), "MMM d, yyyy 'at' HH:mm")}
              </span>
            </div>

            {/* Importance */}
            <div className="ml-auto flex items-center gap-1">
              <span className="text-xs font-medium">Importance:</span>
              <Badge
                variant={doc.importance >= 8 ? "destructive" : doc.importance >= 5 ? "default" : "secondary"}
                className="text-xs"
              >
                {doc.importance}/10
              </Badge>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
