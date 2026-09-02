import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PartnerPostLink {
  id: string;
  created_at: string;
  post_id: string;
  partner_id: string;
  tracked_code: string;
  tracked_path: string;
  tracked_url: string;
  clicks: number;
  signups: number;
  purchases: number;
  revenue: number;
  commission: number;
  status: string;
  partner?: {
    id: string;
    contact_name: string;
    company_name: string | null;
    referral_code: string;
  };
  post?: {
    id: string;
    topic: string | null;
    post_text: string | null;
    image_url: string | null;
    status: string;
    language: string;
    goal: string | null;
    content_channels: string[];
    primary_url: string | null;
  };
}

// Hook for admin to view all partner links for a post
export function usePartnerPostLinksForPost(postId: string | null) {
  return useQuery({
    queryKey: ["partner-post-links", "post", postId],
    queryFn: async () => {
      if (!postId) return [];
      const { data, error } = await supabase
        .from("partner_post_links")
        .select(`
          *,
          partner:partners(id, contact_name, company_name, referral_code)
        `)
        .eq("post_id", postId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PartnerPostLink[];
    },
    enabled: !!postId,
  });
}

// Hook for partner to view their shared content
export function usePartnerShareableContent(partnerId: string | null) {
  return useQuery({
    queryKey: ["partner-shareable-content", partnerId],
    queryFn: async () => {
      if (!partnerId) return [];
      const { data, error } = await supabase
        .from("partner_post_links")
        .select(`
          *,
          post:social_posts(
            id, topic, post_text, image_url, status, language, goal, 
            content_channels, primary_url, published_at
          )
        `)
        .eq("partner_id", partnerId)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Filter to only posts that are published
      return (data as PartnerPostLink[]).filter(
        link => link.post?.status === "published"
      );
    },
    enabled: !!partnerId,
  });
}

// Hook for admin to manage partner distribution settings
export function usePartnerDistribution() {
  const queryClient = useQueryClient();

  // Generate links for a post (called on publish)
  const generateLinksMutation = useMutation({
    mutationFn: async ({
      postId,
      audience,
      selectedPartnerIds,
    }: {
      postId: string;
      audience: "all" | "selected";
      selectedPartnerIds?: string[];
    }) => {
      // Fetch the post details
      const { data: post, error: postError } = await supabase
        .from("social_posts")
        .select("topic, primary_url")
        .eq("id", postId)
        .single();

      if (postError) throw postError;

      // Get partners based on audience
      let partnersQuery = supabase
        .from("partners")
        .select("id, referral_code")
        .eq("status", "active");

      if (audience === "selected" && selectedPartnerIds?.length) {
        partnersQuery = partnersQuery.in("id", selectedPartnerIds);
      }

      const { data: partners, error: partnersError } = await partnersQuery;
      if (partnersError) throw partnersError;

      if (!partners?.length) {
        throw new Error("No active partners found");
      }

      // Generate slug from topic
      const slug = (post.topic || "post")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 30);

      const siteUrl = "https://icealarm.es";

      // Create links for each partner
      const links = partners.map((partner) => ({
        post_id: postId,
        partner_id: partner.id,
        tracked_code: partner.referral_code,
        tracked_path: `/r/${partner.referral_code}/${slug}`,
        tracked_url: `${siteUrl}/r/${partner.referral_code}/${slug}`,
      }));

      // Insert all links (upsert to handle re-generation)
      const { data, error } = await supabase
        .from("partner_post_links")
        .upsert(links, { 
          onConflict: "post_id,partner_id",
          ignoreDuplicates: false 
        })
        .select();

      if (error) throw error;

      // Update the post with partner_published_at
      await supabase
        .from("social_posts")
        .update({ partner_published_at: new Date().toISOString() })
        .eq("id", postId);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-post-links"] });
      toast.success("Partner links generated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate partner links: ${error.message}`);
    },
  });

  // Disable partner sharing for a post
  const disableSharingMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("partner_post_links")
        .update({ status: "disabled" })
        .eq("post_id", postId);

      if (error) throw error;

      // Update post partner_enabled flag
      await supabase
        .from("social_posts")
        .update({ partner_enabled: false })
        .eq("id", postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-post-links"] });
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Partner sharing disabled");
    },
    onError: (error: Error) => {
      toast.error(`Failed to disable sharing: ${error.message}`);
    },
  });

  // Re-enable partner sharing
  const enableSharingMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("partner_post_links")
        .update({ status: "active" })
        .eq("post_id", postId);

      if (error) throw error;

      await supabase
        .from("social_posts")
        .update({ partner_enabled: true })
        .eq("id", postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-post-links"] });
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Partner sharing enabled");
    },
    onError: (error: Error) => {
      toast.error(`Failed to enable sharing: ${error.message}`);
    },
  });

  return {
    generateLinks: generateLinksMutation.mutateAsync,
    disableSharing: disableSharingMutation.mutateAsync,
    enableSharing: enableSharingMutation.mutateAsync,
    isGenerating: generateLinksMutation.isPending,
    isDisabling: disableSharingMutation.isPending,
    isEnabling: enableSharingMutation.isPending,
  };
}
