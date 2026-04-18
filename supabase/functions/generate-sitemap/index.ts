import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";



const BASE_URL = "https://icealarm.es";

interface SitemapPage {
  path: string;
  priority: number;
  changefreq: string;
  lastmod?: string;
}

const staticPages: SitemapPage[] = [
  { path: "/", priority: 1.0, changefreq: "weekly" },
  { path: "/pendant", priority: 0.9, changefreq: "monthly" },
  { path: "/blog", priority: 0.8, changefreq: "daily" },
  { path: "/contact", priority: 0.6, changefreq: "monthly" },
  { path: "/terms", priority: 0.3, changefreq: "yearly" },
  { path: "/privacy", priority: 0.3, changefreq: "yearly" },
  { path: "/join", priority: 0.8, changefreq: "monthly" },
];

function generateSitemapXml(pages: SitemapPage[]): string {
  const urlEntries = pages
    .map((page) => {
      let entry = `  <url>\n    <loc>${BASE_URL}${page.path}</loc>\n`;
      entry += `    <priority>${page.priority.toFixed(1)}</priority>\n`;
      entry += `    <changefreq>${page.changefreq}</changefreq>\n`;
      if (page.lastmod) {
        entry += `    <lastmod>${page.lastmod.split("T")[0]}</lastmod>\n`;
      }
      entry += `  </url>`;
      return entry;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch published blog posts
    const { data: posts, error } = await adminClient
      .from("blog_posts")
      .select("slug, updated_at")
      .eq("published", true);

    if (error) {
      console.error("Error fetching blog posts:", error);
    }

    // Combine static pages with blog posts
    const allPages: SitemapPage[] = [
      ...staticPages,
      ...(posts || []).map((post) => ({
        path: `/blog/${post.slug}`,
        priority: 0.7,
        changefreq: "monthly",
        lastmod: post.updated_at,
      })),
    ];

    const xml = generateSitemapXml(allPages);

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response("Error generating sitemap", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
