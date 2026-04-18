-- Allow public read access to published social posts
-- This enables the blog page to show posts via the !inner join
CREATE POLICY "Anyone can read published social posts"
ON social_posts FOR SELECT
USING (status = 'published');