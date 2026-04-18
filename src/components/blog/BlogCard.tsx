import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import type { BlogPost } from "@/hooks/useBlogPosts";

interface BlogCardProps {
  post: BlogPost;
}

export function BlogCard({ post }: BlogCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-shadow">
      <Link to={`/blog/${post.slug}`}>
        {post.image_url && (
          <div className="aspect-video overflow-hidden">
            <img
              src={post.image_url}
              alt={post.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
        <CardContent className={post.image_url ? "p-4" : "p-6"}>
          <p className="text-sm text-muted-foreground mb-2">
            {t("blog.postedOn")} {format(new Date(post.published_at), "MMMM d, yyyy")}
          </p>
          <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
            {post.title}
          </h3>
          {post.excerpt && (
            <p className="text-muted-foreground text-sm line-clamp-3">
              {post.excerpt}
            </p>
          )}
          <span className="text-primary text-sm font-medium mt-3 inline-block">
            {t("blog.readMore")} →
          </span>
        </CardContent>
      </Link>
    </Card>
  );
}
