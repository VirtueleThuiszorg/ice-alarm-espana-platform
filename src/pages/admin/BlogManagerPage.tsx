import { useState, useMemo, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Save,
  Send,
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Globe,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import {
  useAdminBlogPosts,
  useBlogEditor,
  BlogPostAdmin,
  BlogPostFormData,
} from "@/hooks/useBlogEditor";

type TabFilter = "all" | "published" | "draft";

interface EditorState {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  image_url: string;
  language: string;
  seo_title: string;
  seo_description: string;
  tags: string;
  published: boolean;
}

const EMPTY_EDITOR: EditorState = {
  title: "",
  slug: "",
  content: "",
  excerpt: "",
  image_url: "",
  language: "en",
  seo_title: "",
  seo_description: "",
  tags: "",
  published: false,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BlogManagerPage() {
  const [tabFilter, setTabFilter] = useState<TabFilter>("all");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const { data: posts = [], isLoading } = useAdminBlogPosts(tabFilter);
  const {
    createPost,
    updatePost,
    deletePost,
    publishPost,
    unpublishPost,
    isCreating,
    isUpdating,
    isDeleting,
    isPublishing,
    isUnpublishing,
  } = useBlogEditor();

  const isSaving = isCreating || isUpdating;
  const isBusy = isSaving || isDeleting || isPublishing || isUnpublishing;

  // Counts for tab badges
  const allCount = posts.length;
  const publishedCount = useMemo(
    () => posts.filter((p) => p.published).length,
    [posts]
  );
  const draftCount = useMemo(
    () => posts.filter((p) => !p.published).length,
    [posts]
  );

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManuallyEdited && editor.title) {
      setEditor((prev) => ({ ...prev, slug: slugify(prev.title) }));
    }
  }, [editor.title, slugManuallyEdited]);

  const handleNewPost = useCallback(() => {
    setEditingPostId(null);
    setEditor(EMPTY_EDITOR);
    setSlugManuallyEdited(false);
    setIsEditorOpen(true);
  }, []);

  const handleEditPost = useCallback((post: BlogPostAdmin) => {
    setEditingPostId(post.id);
    setEditor({
      title: post.title || "",
      slug: post.slug || "",
      content: post.content || "",
      excerpt: post.excerpt || "",
      image_url: post.image_url || "",
      language: post.language || "en",
      seo_title: post.seo_title || "",
      seo_description: post.seo_description || "",
      tags: "", // tags not in current schema, but included in UI for future use
      published: post.published ?? false,
    });
    setSlugManuallyEdited(true);
    setIsEditorOpen(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setIsEditorOpen(false);
    setEditingPostId(null);
    setEditor(EMPTY_EDITOR);
    setSlugManuallyEdited(false);
  }, []);

  const handleSaveDraft = async () => {
    if (!editor.title.trim() || !editor.slug.trim()) return;

    const data: BlogPostFormData = {
      title: editor.title.trim(),
      slug: editor.slug.trim(),
      content: editor.content,
      excerpt: editor.excerpt || null,
      image_url: editor.image_url || null,
      language: editor.language || "en",
      published: false,
      seo_title: editor.seo_title || null,
      seo_description: editor.seo_description || null,
    };

    if (editingPostId) {
      await updatePost({ id: editingPostId, data });
    } else {
      const newPost = await createPost(data);
      setEditingPostId(newPost.id);
    }
  };

  const handlePublish = async () => {
    if (!editor.title.trim() || !editor.slug.trim()) return;

    if (editingPostId) {
      // Save first, then publish
      await updatePost({
        id: editingPostId,
        data: {
          title: editor.title.trim(),
          slug: editor.slug.trim(),
          content: editor.content,
          excerpt: editor.excerpt || null,
          image_url: editor.image_url || null,
          language: editor.language || "en",
          seo_title: editor.seo_title || null,
          seo_description: editor.seo_description || null,
        },
      });
      await publishPost(editingPostId);
      setEditor((prev) => ({ ...prev, published: true }));
    } else {
      // Create as published
      const data: BlogPostFormData = {
        title: editor.title.trim(),
        slug: editor.slug.trim(),
        content: editor.content,
        excerpt: editor.excerpt || null,
        image_url: editor.image_url || null,
        language: editor.language || "en",
        published: true,
        seo_title: editor.seo_title || null,
        seo_description: editor.seo_description || null,
      };
      const newPost = await createPost(data);
      setEditingPostId(newPost.id);
      setEditor((prev) => ({ ...prev, published: true }));
    }
  };

  const handleTogglePublish = async (post: BlogPostAdmin) => {
    if (post.published) {
      await unpublishPost(post.id);
    } else {
      await publishPost(post.id);
    }
  };

  const handleDeletePost = async (post: BlogPostAdmin) => {
    if (!confirm(`Delete "${post.title}"? This action cannot be undone.`)) return;
    await deletePost(post.id);
    if (editingPostId === post.id) {
      handleCloseEditor();
    }
  };

  const updateField = <K extends keyof EditorState>(field: K, value: EditorState[K]) => {
    setEditor((prev) => ({ ...prev, [field]: value }));
  };

  // ---- EDITOR VIEW ----
  if (isEditorOpen) {
    return (
      <div className="space-y-6">
        {/* Editor Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleCloseEditor}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {editingPostId ? "Edit Post" : "New Post"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {editingPostId ? "Update your blog post" : "Create a new blog post"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                editor.published
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-muted text-muted-foreground"
              }
            >
              {editor.published ? "Published" : "Draft"}
            </Badge>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isBusy || !editor.title.trim()}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Draft
            </Button>
            <Button
              onClick={handlePublish}
              disabled={isBusy || !editor.title.trim() || !editor.content.trim()}
              className="gap-2"
            >
              {isPublishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Publish
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main Content Area - Left 2/3 */}
          <div className="xl:col-span-2 space-y-6">
            {/* Title & Slug */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="post-title">Title</Label>
                  <Input
                    id="post-title"
                    value={editor.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    placeholder="Enter post title..."
                    className="text-lg font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="post-slug">
                    Slug
                    <span className="text-muted-foreground font-normal ml-2 text-xs">
                      /blog/{editor.slug || "..."}
                    </span>
                  </Label>
                  <Input
                    id="post-slug"
                    value={editor.slug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      updateField("slug", slugify(e.target.value));
                    }}
                    placeholder="post-slug"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Content Editor with Markdown Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Content
                </CardTitle>
                <CardDescription>
                  Write in Markdown. Preview is shown on the right.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="post-content" className="text-xs text-muted-foreground uppercase tracking-wide">
                      Markdown
                    </Label>
                    <Textarea
                      id="post-content"
                      value={editor.content}
                      onChange={(e) => updateField("content", e.target.value)}
                      placeholder="Write your post content in Markdown..."
                      className="min-h-[400px] font-mono text-sm resize-y"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Preview
                    </Label>
                    <div className="min-h-[400px] rounded-md border bg-background p-4 overflow-y-auto prose prose-sm max-w-none dark:prose-invert">
                      {editor.content ? (
                        <ReactMarkdown>{editor.content}</ReactMarkdown>
                      ) : (
                        <p className="text-muted-foreground italic">
                          Start writing to see the preview...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Excerpt */}
            <Card>
              <CardContent className="pt-6 space-y-2">
                <Label htmlFor="post-excerpt">Excerpt</Label>
                <Textarea
                  id="post-excerpt"
                  value={editor.excerpt}
                  onChange={(e) => updateField("excerpt", e.target.value)}
                  placeholder="Short summary of the post (displayed in post listings)..."
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Right 1/3 */}
          <div className="space-y-6">
            {/* Featured Image */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-4 w-4" />
                  Featured Image
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={editor.image_url}
                  onChange={(e) => updateField("image_url", e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
                {editor.image_url && (
                  <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={editor.image_url}
                      alt="Featured"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Language */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4" />
                  Language
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={editor.language}
                  onValueChange={(v) => updateField("language", v)}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Espanol</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardContent className="pt-6 space-y-2">
                <Label htmlFor="post-tags">Tags</Label>
                <Input
                  id="post-tags"
                  value={editor.tags}
                  onChange={(e) => updateField("tags", e.target.value)}
                  placeholder="health, safety, elderly care"
                />
                <p className="text-xs text-muted-foreground">
                  Comma separated. Tags support coming soon.
                </p>
              </CardContent>
            </Card>

            {/* SEO */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SEO Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="seo-title">Meta Title</Label>
                  <Input
                    id="seo-title"
                    value={editor.seo_title}
                    onChange={(e) => updateField("seo_title", e.target.value)}
                    placeholder={editor.title || "Post title (auto-used if empty)"}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editor.seo_title.length}/60 characters
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seo-description">Meta Description</Label>
                  <Textarea
                    id="seo-description"
                    value={editor.seo_description}
                    onChange={(e) => updateField("seo_description", e.target.value)}
                    placeholder="Brief description for search engines..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editor.seo_description.length}/160 characters
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ---- LIST VIEW ----
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Blog Manager</h1>
          <p className="text-muted-foreground">
            Create, edit, and manage your blog posts
          </p>
        </div>
        <Button onClick={handleNewPost} className="gap-2">
          <Plus className="h-4 w-4" />
          New Post
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={tabFilter}
        onValueChange={(v) => setTabFilter(v as TabFilter)}
      >
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            All Posts
            <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
              {allCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="published" className="gap-2">
            Published
            <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
              {publishedCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="draft" className="gap-2">
            Drafts
            <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
              {draftCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab Content - shared layout, filtered by query */}
        <TabsContent value={tabFilter} className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-1">No posts found</h3>
                <p className="text-muted-foreground mb-4">
                  {tabFilter === "draft"
                    ? "You don't have any draft posts yet."
                    : tabFilter === "published"
                    ? "No published posts yet."
                    : "Get started by creating your first blog post."}
                </p>
                <Button onClick={handleNewPost} className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Post
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onEdit={handleEditPost}
                  onTogglePublish={handleTogglePublish}
                  onDelete={handleDeletePost}
                  isBusy={isBusy}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---- Post Card Component ----

interface PostCardProps {
  post: BlogPostAdmin;
  onEdit: (post: BlogPostAdmin) => void;
  onTogglePublish: (post: BlogPostAdmin) => void;
  onDelete: (post: BlogPostAdmin) => void;
  isBusy: boolean;
}

function PostCard({ post, onEdit, onTogglePublish, onDelete, isBusy }: PostCardProps) {
  const excerptText =
    post.excerpt ||
    (post.content ? post.content.slice(0, 120).replace(/[#*_`>\[\]]/g, "") + "..." : "No content yet");

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow group"
      onClick={() => onEdit(post)}
    >
      {/* Featured image thumbnail */}
      {post.image_url ? (
        <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-muted">
          <img
            src={post.image_url}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="aspect-video w-full rounded-t-lg bg-muted flex items-center justify-center">
          <FileText className="h-10 w-10 text-muted-foreground/40" />
        </div>
      )}

      <CardContent className="pt-4 space-y-3">
        {/* Status & Language badges */}
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              post.published
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-muted text-muted-foreground"
            }
          >
            {post.published ? "Published" : "Draft"}
          </Badge>
          {post.language && (
            <Badge variant="secondary" className="text-xs">
              {post.language.toUpperCase()}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-base leading-tight line-clamp-2">
          {post.title || "Untitled Post"}
        </h3>

        {/* Excerpt */}
        <p className="text-sm text-muted-foreground line-clamp-2">{excerptText}</p>

        {/* Date */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {post.published_at
            ? format(new Date(post.published_at), "MMM d, yyyy")
            : post.created_at
            ? format(new Date(post.created_at), "MMM d, yyyy")
            : "No date"}
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 h-8"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(post);
            }}
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-8"
              disabled={isBusy}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePublish(post);
              }}
            >
              {post.published ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  Publish
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              disabled={isBusy}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(post);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
