-- =============================================
-- SOCIAL POSTS TABLE
-- =============================================
CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  platform text NOT NULL DEFAULT 'facebook',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'failed')),
  language text NOT NULL DEFAULT 'both' CHECK (language IN ('en', 'es', 'both')),
  goal text,
  target_audience text,
  topic text,
  post_text text,
  image_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  facebook_post_id text,
  error_message text
);

-- =============================================
-- SOCIAL POST RESEARCH TABLE
-- =============================================
CREATE TABLE public.social_post_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  post_id uuid REFERENCES public.social_posts(id) ON DELETE CASCADE NOT NULL,
  sources jsonb DEFAULT '[]'::jsonb,
  key_points text,
  compliance_notes text
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_social_posts_status ON public.social_posts(status);
CREATE INDEX idx_social_posts_platform ON public.social_posts(platform);
CREATE INDEX idx_social_posts_created_at ON public.social_posts(created_at);
CREATE INDEX idx_social_post_research_post_id ON public.social_post_research(post_id);

-- =============================================
-- AUTO-UPDATE TRIGGER FOR updated_at
-- =============================================
CREATE TRIGGER update_social_posts_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ENABLE RLS
-- =============================================
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_research ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES FOR social_posts
-- =============================================
CREATE POLICY "Staff can view all social posts"
  ON public.social_posts FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create social posts"
  ON public.social_posts FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update social posts"
  ON public.social_posts FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can delete social posts"
  ON public.social_posts FOR DELETE
  USING (is_admin(auth.uid()));

-- =============================================
-- RLS POLICIES FOR social_post_research
-- =============================================
CREATE POLICY "Staff can view all social post research"
  ON public.social_post_research FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create social post research"
  ON public.social_post_research FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update social post research"
  ON public.social_post_research FOR UPDATE
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can delete social post research"
  ON public.social_post_research FOR DELETE
  USING (is_admin(auth.uid()));

-- =============================================
-- STORAGE BUCKET FOR POST IMAGES
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-post-images', 'social-post-images', true);

-- Storage policies for staff access
CREATE POLICY "Staff can view social post images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-post-images' AND is_staff(auth.uid()));

CREATE POLICY "Staff can upload social post images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'social-post-images' AND is_staff(auth.uid()));

CREATE POLICY "Staff can update social post images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'social-post-images' AND is_staff(auth.uid()));

CREATE POLICY "Staff can delete social post images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'social-post-images' AND is_staff(auth.uid()));

-- Public read access for published images
CREATE POLICY "Public can view social post images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-post-images');