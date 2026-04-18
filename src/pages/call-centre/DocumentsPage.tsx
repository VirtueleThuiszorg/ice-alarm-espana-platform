import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentation, DocumentCategory } from "@/hooks/useDocumentation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  BookOpen, 
  FileText, 
  AlertTriangle, 
  Smartphone, 
  Users, 
  Briefcase,
  Star,
  ChevronDown,
  ChevronUp,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const categoryIcons: Record<DocumentCategory, React.ElementType> = {
  general: FileText,
  member_guide: Users,
  staff: BookOpen,
  device: Smartphone,
  emergency: AlertTriangle,
  partner: Briefcase,
};

const categoryLabelKeys: Record<DocumentCategory, { key: string; fallback: string }> = {
  general: { key: "staffDocuments.categories.general", fallback: "General" },
  member_guide: { key: "staffDocuments.categories.memberGuide", fallback: "Member Guides" },
  staff: { key: "staffDocuments.categories.staff", fallback: "Staff Instructions" },
  device: { key: "staffDocuments.categories.device", fallback: "Device Guides" },
  emergency: { key: "staffDocuments.categories.emergency", fallback: "Emergency Protocols" },
  partner: { key: "staffDocuments.categories.partner", fallback: "Partner Info" },
};

export default function DocumentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const { data: documents, isLoading } = useDocumentation({
    visibility: 'staff',
    status: 'published',
    search: search || undefined,
    category: selectedCategory !== "all" ? selectedCategory as DocumentCategory : undefined,
  });

  const categories = ["all", "emergency", "device", "staff", "general", "member_guide", "partner"];

  const toggleExpand = (docId: string) => {
    setExpandedDoc(expandedDoc === docId ? null : docId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          {t("staffDocuments.title", "Staff Documents")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("staffDocuments.subtitle", "Access company procedures, protocols, and guides")}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("staffDocuments.searchPlaceholder", "Search documents...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all" className="text-xs">
            {t("common.all", "All")}
          </TabsTrigger>
          {categories.slice(1).map((cat) => {
            const Icon = categoryIcons[cat as DocumentCategory];
            return (
              <TabsTrigger key={cat} value={cat} className="text-xs flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {t(categoryLabelKeys[cat as DocumentCategory].key, categoryLabelKeys[cat as DocumentCategory].fallback)}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("common.loading", "Loading...")}
            </div>
          ) : documents && documents.length > 0 ? (
            <div className="space-y-3">
              {documents.map((doc) => {
                const CategoryIcon = categoryIcons[doc.category];
                const isExpanded = expandedDoc === doc.id;
                
                return (
                  <Card 
                    key={doc.id} 
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-md",
                      isExpanded && "ring-2 ring-primary/20"
                    )}
                    onClick={() => toggleExpand(doc.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <CategoryIcon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base font-semibold line-clamp-1">
                              {doc.title}
                            </CardTitle>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {t(categoryLabelKeys[doc.category].key, categoryLabelKeys[doc.category].fallback)}
                              </Badge>
                              <Badge 
                                variant="secondary" 
                                className="text-xs uppercase"
                              >
                                {doc.language}
                              </Badge>
                              {doc.importance >= 8 && (
                                <Badge className="text-xs bg-amber-500/20 text-amber-700 border-amber-300">
                                  <Star className="h-3 w-3 mr-1 fill-current" />
                                  {t("staffDocuments.important", "Important")}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <div className="text-xs flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(doc.updated_at), "MMM d, yyyy")}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent className="pt-2 border-t">
                        <div 
                          className="prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: doc.content.replace(/\n/g, '<br/>') }}
                        />
                        {doc.tags && doc.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-4 pt-3 border-t">
                            {doc.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-foreground mb-1">
                  {t("staffDocuments.noDocuments", "No documents available")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("staffDocuments.noDocumentsDesc", "Documents will appear here when published by administrators.")}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
