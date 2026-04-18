import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { LanguageSelector } from "@/components/LanguageSelector";
import { HeaderChatButton } from "@/components/chat/HeaderChatButton";
import { PublicMobileNav } from "@/components/layout/PublicMobileNav";
import { SEOHead } from "@/components/seo/SEOHead";
import { useBlogPost } from "@/hooks/useBlogPosts";
import { Skeleton } from "@/components/ui/skeleton";

// JSON-LD structured data component
function ArticleSchema({ post, canonicalUrl }: { post: any; canonicalUrl: string }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || post.content?.substring(0, 150),
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: {
      "@type": "Organization",
      name: "ICE Alarm España",
      url: "https://icealarm.es",
    },
    publisher: {
      "@type": "Organization",
      name: "ICE Alarm España",
      url: "https://icealarm.es",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    ...(post.image_url && { image: post.image_url }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: post, isLoading, error } = useBlogPost(slug || "");

  // Generate SEO values
  const seoTitle = post?.seo_title || post?.title || "Blog Post";
  const seoDescription = post?.seo_description || post?.excerpt || post?.content?.substring(0, 150) || "";
  const canonicalUrl = `https://icealarm.es/blog/${slug}`;

  return (
    <div className="min-h-screen bg-background">
      {post && (
        <>
          <SEOHead
            title={`${seoTitle} | ICE Alarm Blog`}
            description={seoDescription}
            canonicalUrl={canonicalUrl}
            ogType="article"
            ogImage={post.image_url || undefined}
            publishedTime={post.published_at}
          />
          <ArticleSchema post={post} canonicalUrl={canonicalUrl} />
        </>
      )}

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
        <div className="container mx-auto max-w-3xl">
          {/* Back Link */}
          <Link
            to="/blog"
            className="inline-flex items-center text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("blog.backToBlog", "Back to Blog")}
          </Link>

          {isLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-10 w-3/4" />
              <div className="flex gap-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="aspect-video w-full" />
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ) : error || !post ? (
            <div className="text-center py-16">
              <h1 className="text-2xl font-bold mb-4">{t("blog.notFound", "Post not found")}</h1>
              <p className="text-muted-foreground mb-6">
                {t("blog.notFoundDesc", "The blog post you're looking for doesn't exist or has been removed.")}
              </p>
              <Button asChild>
                <Link to="/blog">{t("blog.viewAll")}</Link>
              </Button>
            </div>
          ) : (
            <article>
              {/* Title */}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
                {post.title}
              </h1>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-8">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <time dateTime={post.published_at}>
                    {format(new Date(post.published_at), "MMMM d, yyyy")}
                  </time>
                </div>
                {post.language && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span className="uppercase">{post.language}</span>
                  </div>
                )}
              </div>

              {/* Featured Image */}
              {post.image_url && (
                <div className="rounded-lg overflow-hidden mb-8">
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="w-full h-auto"
                  />
                </div>
              )}

              {/* AI Intro (if exists) */}
              {post.ai_intro && (
                <div className="bg-muted/50 border-l-4 border-primary p-6 rounded-r-lg mb-8">
                  <p className="text-lg text-foreground/90 italic leading-relaxed">
                    {post.ai_intro}
                  </p>
                </div>
              )}

              {/* Content */}
              <div className="prose prose-lg max-w-none dark:prose-invert">
                {post.content.split("\n").map((paragraph, index) => {
                  if (!paragraph.trim()) return null;
                  // Render divider line
                  if (paragraph.trim() === "---") {
                    return <hr key={index} className="my-8 border-border" />;
                  }
                  return (
                    <p key={index} className="mb-4">
                      {paragraph}
                    </p>
                  );
                })}
              </div>

              {/* Share / CTA */}
              <div className="mt-12 pt-8 border-t">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-muted-foreground">
                    {t("blog.sharePost", "Found this helpful? Share it with others.")}
                  </p>
                  <Button asChild>
                    <Link to="/join">{t("landing.startProtection", { defaultValue: "Get Started" })}</Link>
                  </Button>
                </div>
              </div>
            </article>
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
