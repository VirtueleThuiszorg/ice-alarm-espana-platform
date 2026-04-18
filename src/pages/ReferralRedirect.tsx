import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TIMEOUTS } from "@/config/constants";
import { Loader2 } from "lucide-react";

/**
 * Tracked link handler for partner referrals
 * Route: /r/:partnerCode/:postSlug
 * 
 * 1. Resolves partner by code
 * 2. Resolves post by matching the link
 * 3. Records click
 * 4. Sets referral cookie
 * 5. Redirects to canonical URL
 */
export default function ReferralRedirect() {
  const { partnerCode, postSlug } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleRedirect = async () => {
      if (!partnerCode) {
        setError("Invalid referral link");
        setTimeout(() => navigate("/"), TIMEOUTS.REDIRECT_DELAY);
        return;
      }

      // Simple referral link: /r/CODE (no post slug)
      if (!postSlug) {
        try {
          const { data: partner } = await supabase
            .from("partners")
            .select("id, referral_code")
            .eq("referral_code", partnerCode)
            .eq("status", "active")
            .maybeSingle();

          if (partner) {
            setReferralCookie(partner.id, null, partnerCode);
            navigate("/");
            return;
          }

          setError("Referral link not found");
          setTimeout(() => navigate("/"), TIMEOUTS.REDIRECT_DELAY);
        } catch (err) {
          console.error("Referral redirect error:", err);
          setError("Error processing referral");
          setTimeout(() => navigate("/"), TIMEOUTS.REDIRECT_DELAY);
        }
        return;
      }

      try {
        // Find the partner_post_link by tracked_path
        const trackedPath = `/r/${partnerCode}/${postSlug}`;
        
        const { data: link, error: linkError } = await supabase
          .from("partner_post_links")
          .select(`
            id,
            post_id,
            partner_id,
            tracked_url,
            post:social_posts(primary_url, topic)
          `)
          .eq("tracked_path", trackedPath)
          .eq("status", "active")
          .maybeSingle();

        if (linkError) {
          console.error("Error fetching link:", linkError);
          throw new Error("Error processing referral");
        }

        if (!link) {
          // Try to find partner and redirect to homepage with partner code
          const { data: partner } = await supabase
            .from("partners")
            .select("id, referral_code")
            .eq("referral_code", partnerCode)
            .eq("status", "active")
            .maybeSingle();

          if (partner) {
            // Set referral cookie for partner without specific post
            setReferralCookie(partner.id, null, partnerCode);
            navigate("/");
            return;
          }

          setError("Referral link not found");
          setTimeout(() => navigate("/"), TIMEOUTS.REDIRECT_DELAY);
          return;
        }

        // Increment click count using edge function (bypasses RLS)
        try {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-referral-click`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ link_id: link.id }),
          });
        } catch (e) {
          console.error("Failed to track click:", e);
        }

        // Set referral cookie
        setReferralCookie(link.partner_id, link.post_id, partnerCode);

        // Determine redirect URL
        let redirectUrl = "/";

        // Check if post has primary_url
        if (link.post?.primary_url) {
          redirectUrl = link.post.primary_url;
        } else {
          // Try to find a blog post for this social post
          const { data: blogPost } = await supabase
            .from("blog_posts")
            .select("slug")
            .eq("social_post_id", link.post_id)
            .maybeSingle();

          if (blogPost?.slug) {
            redirectUrl = `/blog/${blogPost.slug}`;
          }
        }

        // Perform redirect
        if (redirectUrl.startsWith("http")) {
          window.location.href = redirectUrl;
        } else {
          navigate(redirectUrl);
        }
      } catch (err) {
        console.error("Referral redirect error:", err);
        setError("Error processing referral");
        setTimeout(() => navigate("/"), TIMEOUTS.REDIRECT_DELAY);
      }
    };

    handleRedirect();
  }, [partnerCode, postSlug, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {error ? (
          <div className="text-destructive">
            <p>{error}</p>
            <p className="text-sm text-muted-foreground">Redirecting to homepage...</p>
          </div>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Redirecting...</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Set referral cookie/localStorage for attribution
 */
function setReferralCookie(partnerId: string, postId: string | null, partnerCode: string) {
  const referralData = {
    ref_partner_id: partnerId,
    ref_post_id: postId,
    ref_partner_code: partnerCode,
    ref_timestamp: Date.now(),
    ref_expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };

  // Store in localStorage (more reliable than cookies for SPAs)
  localStorage.setItem("partner_referral", JSON.stringify(referralData));

  // Also set a cookie for edge function access
  const expires = new Date(referralData.ref_expires).toUTCString();
  document.cookie = `ref_partner_code=${partnerCode}; expires=${expires}; path=/; SameSite=Lax`;
  document.cookie = `ref_partner_id=${partnerId}; expires=${expires}; path=/; SameSite=Lax`;
  if (postId) {
    document.cookie = `ref_post_id=${postId}; expires=${expires}; path=/; SameSite=Lax`;
  }
}
