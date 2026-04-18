-- Delete orphan blog posts (social_post_id references non-existent or non-published social post)
DELETE FROM blog_posts
WHERE social_post_id IS NOT NULL 
AND social_post_id NOT IN (
  SELECT id FROM social_posts WHERE status = 'published'
);

-- Delete blog posts with NULL social_post_id (orphans from old flow)
-- Keep any that might be manually created welcome posts by checking if they have no facebook_post_id either
DELETE FROM blog_posts
WHERE social_post_id IS NULL
AND facebook_post_id IS NULL
AND slug != 'welcome-to-ice-alarm';

-- Delete duplicates, keeping only the newest per social_post_id
DELETE FROM blog_posts a
USING blog_posts b
WHERE a.social_post_id = b.social_post_id
AND a.social_post_id IS NOT NULL
AND a.created_at < b.created_at;

-- Add unique partial index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_social_post_unique 
ON blog_posts (social_post_id) 
WHERE social_post_id IS NOT NULL;