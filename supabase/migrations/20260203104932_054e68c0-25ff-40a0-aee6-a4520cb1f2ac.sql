-- Create blog_posts table
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text,
  content text NOT NULL,
  language text DEFAULT 'en',
  published boolean DEFAULT true,
  published_at timestamptz DEFAULT now(),
  facebook_post_id text,
  social_post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL,
  image_url text,
  seo_title text,
  seo_description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX blog_posts_slug_idx ON public.blog_posts (slug);
CREATE INDEX blog_posts_published_at_idx ON public.blog_posts (published_at DESC);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Public read policy - anyone can read published posts
CREATE POLICY "Anyone can read published posts"
  ON public.blog_posts
  FOR SELECT
  USING (published = true);

-- Staff write policy - staff can manage all blog posts
CREATE POLICY "Staff can manage blog posts"
  ON public.blog_posts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff 
      WHERE staff.user_id = auth.uid() 
      AND staff.is_active = true
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();