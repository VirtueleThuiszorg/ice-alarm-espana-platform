import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PublicHeader } from "@/components/layout/PublicHeader";
import {
  Search,
  BookOpen,
  HelpCircle,
  FileText,
  Wrench,
  
  ChevronDown,
  ChevronUp,
  Calendar,
  X,
} from "lucide-react";
import { format } from "date-fns";

type KBCategory = "all" | "user_guide" | "faq" | "general" | "device";

interface KBArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  content: string;
  tags: string[];
  language: string;
  updated_at: string;
}

const CATEGORY_FILTERS: { value: KBCategory; labelKey: string; icon: React.ElementType }[] = [
  { value: "all", labelKey: "help.allCategories", icon: BookOpen },
  { value: "user_guide", labelKey: "help.userGuide", icon: FileText },
  { value: "faq", labelKey: "help.faq", icon: HelpCircle },
  { value: "general", labelKey: "help.general", icon: BookOpen },
  { value: "device", labelKey: "help.device", icon: Wrench },
];

export default function KnowledgeBasePage() {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<KBCategory>("all");
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);

  // Fetch published documentation articles
  const { data: articles, isLoading } = useQuery({
    queryKey: ["knowledge-base", i18n.language],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentation")
        .select("id, title, slug, category, content, tags, language, updated_at")
        .eq("status", "published")
        .in("category", ["user_guide", "faq", "general", "device"] as any)
        .order("importance", { ascending: false });

      if (error) throw error;
      return (data || []) as KBArticle[];
    },
    staleTime: STALE_TIMES.LONG,
  });

  // Filter articles by language, search, and category
  const filteredArticles = useMemo(() => {
    if (!articles) return [];

    let filtered = articles;

    // Language filter: prefer current language, fallback to all
    const currentLang = i18n.language.startsWith("es") ? "es" : "en";
    const langFiltered = filtered.filter((a) => a.language === currentLang);
    if (langFiltered.length > 0) {
      filtered = langFiltered;
    }

    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter((a) => a.category === selectedCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.content.toLowerCase().includes(query) ||
          (a.tags || []).some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [articles, i18n.language, selectedCategory, searchQuery]);

  // Get excerpt from markdown content
  const getExcerpt = (content: string, maxLength: number = 150): string => {
    const plainText = content
      .replace(/#{1,6}\s/g, "")
      .replace(/\*{1,2}(.*?)\*{1,2}/g, "$1")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/[`~]/g, "")
      .replace(/\n+/g, " ")
      .trim();

    if (plainText.length <= maxLength) return plainText;
    return plainText.substring(0, maxLength).trim() + "...";
  };

  const getCategoryBadgeVariant = (category: string) => {
    switch (category) {
      case "user_guide":
        return "default";
      case "faq":
        return "secondary";
      case "device":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getCategoryLabel = (category: string): string => {
    switch (category) {
      case "user_guide":
        return t("help.userGuide", "User Guide");
      case "faq":
        return t("help.faq", "FAQ");
      case "device":
        return t("help.device", "Device");
      case "general":
        return t("help.general", "General");
      default:
        return category;
    }
  };

  const toggleArticle = (articleId: string) => {
    setExpandedArticleId((prev) => (prev === articleId ? null : articleId));
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      {/* Hero / Search Section */}
      <section className="bg-primary/5 border-b pt-16">
        <div className="container mx-auto px-4 py-12 text-center">
          <h2 className="text-3xl font-bold mb-2">
            {t("help.heading", "How can we help you?")}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            {t(
              "help.subheading",
              "Search our knowledge base for guides, FAQs, and helpful information about ICE Alarm services."
            )}
          </p>

          {/* Search Bar */}
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("help.searchPlaceholder", "Search articles...")}
              className="pl-10 pr-10 h-12 text-base rounded-full border-primary/20 focus:border-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORY_FILTERS.map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.value;
            return (
              <Button
                key={cat.value}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => setSelectedCategory(cat.value)}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(cat.labelKey, cat.value === "all" ? "All" : cat.value)}
              </Button>
            );
          })}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/4 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredArticles.length === 0 && (
          <div className="text-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery
                ? t("help.noResults", "No articles found")
                : t("help.noArticles", "No articles available")}
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              {searchQuery
                ? t(
                    "help.tryDifferentSearch",
                    "Try adjusting your search terms or browse by category."
                  )
                : t(
                    "help.articlesComingSoon",
                    "Help articles are being prepared and will be available soon."
                  )}
            </p>
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}
              >
                {t("help.clearFilters", "Clear filters")}
              </Button>
            )}
          </div>
        )}

        {/* Article Cards */}
        {!isLoading && filteredArticles.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredArticles.map((article) => {
              const isExpanded = expandedArticleId === article.id;
              return (
                <Card
                  key={article.id}
                  className={`transition-all cursor-pointer hover:shadow-md ${
                    isExpanded ? "md:col-span-2" : ""
                  }`}
                  onClick={() => toggleArticle(article.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">
                        {article.title}
                      </CardTitle>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={getCategoryBadgeVariant(article.category)}>
                        {getCategoryLabel(article.category)}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(article.updated_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isExpanded ? (
                      <ScrollArea className="max-h-[500px]">
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ReactMarkdown>{article.content}</ReactMarkdown>
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {getExcerpt(article.content)}
                      </p>
                    )}
                    {/* Tags */}
                    {article.tags && article.tags.length > 0 && !isExpanded && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {article.tags.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Results count */}
        {!isLoading && filteredArticles.length > 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            {t("help.showingArticles", "Showing {{count}} article(s)", {
              count: filteredArticles.length,
            })}
          </p>
        )}
      </main>

      {/* Simple Footer */}
      <footer className="border-t bg-muted/30 mt-12">
        <div className="container mx-auto px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t(
              "help.footer",
              "Can't find what you're looking for? Contact us for assistance."
            )}
          </p>
          <Button variant="link" size="sm" asChild className="mt-1">
            <Link to="/contact">{t("help.contactUs", "Contact Support")}</Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}
