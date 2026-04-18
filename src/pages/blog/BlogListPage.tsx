import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { LanguageSelector } from "@/components/LanguageSelector";
import { HeaderChatButton } from "@/components/chat/HeaderChatButton";
import { PublicMobileNav } from "@/components/layout/PublicMobileNav";
import { BlogCard } from "@/components/blog/BlogCard";
import { SEOHead } from "@/components/seo/SEOHead";
import { useBlogPosts } from "@/hooks/useBlogPosts";
import { Skeleton } from "@/components/ui/skeleton";

export default function BlogListPage() {
  const { t } = useTranslation();
  const { data: posts, isLoading } = useBlogPosts();

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="ICE Alarm Blog - Safety, Care & Updates"
        description="Read the latest articles about personal safety, elderly care, and emergency response from ICE Alarm España."
        canonicalUrl="https://icealarm.es/blog"
        ogType="website"
      />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm font-medium hover:text-primary transition-colors">
              {t("navigation.home")}
            </Link>
            <Link to="/pendant" className="text-sm font-medium hover:text-primary transition-colors">
              {t("navigation.pendant")}
            </Link>
            <Link to="/blog" className="text-sm font-medium text-primary">
              {t("blog.title")}
            </Link>
            <Link to="/contact" className="text-sm font-medium hover:text-primary transition-colors">
              {t("navigation.contact")}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <PublicMobileNav
              navItems={[
                { to: "/", label: t("navigation.home") },
                { to: "/pendant", label: t("navigation.pendant") },
                { to: "/blog", label: t("blog.title") },
                { to: "/contact", label: t("navigation.contact") },
              ]}
              loginLabel={t("auth.memberLogin", { defaultValue: "Sign In" })}
              ctaLabel={t("landing.startProtection", { defaultValue: "Get Started" })}
            />
            <div className="hidden md:flex items-center gap-2">
              <HeaderChatButton />
              <Button variant="ghost" asChild>
                <Link to="/login">{t("auth.memberLogin", { defaultValue: "Sign In" })}</Link>
              </Button>
              <Button asChild>
                <Link to="/join">{t("landing.startProtection", { defaultValue: "Get Started" })}</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Back Link */}
          <Link
            to="/"
            className="inline-flex items-center text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("auth.backToHome", { defaultValue: "Go Back" })}
          </Link>

          {/* Page Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{t("blog.title")}</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("blog.subtitle", "Stay informed with our latest updates about personal safety, elderly care, and emergency response.")}
            </p>
          </div>

          {/* Blog Posts Grid */}
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="aspect-video w-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">{t("blog.noPostsYet")}</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto text-center text-sm text-sidebar-foreground/60">
          <p>© {new Date().getFullYear()} ICE Alarm España. {t("landing.allRightsReserved")}</p>
        </div>
      </footer>
    </div>
  );
}
