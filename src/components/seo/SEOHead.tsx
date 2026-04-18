import { useEffect } from "react";

interface SEOHeadProps {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogType?: "website" | "article";
  ogImage?: string;
  publishedTime?: string;
}

const updateMetaTag = (name: string, content: string, attr: "name" | "property" = "name") => {
  let element = document.querySelector(`meta[${attr}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
};

const updateLinkTag = (rel: string, href: string) => {
  let element = document.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
};

export function SEOHead({
  title,
  description,
  canonicalUrl,
  ogType = "website",
  ogImage,
  publishedTime,
}: SEOHeadProps) {
  useEffect(() => {
    // Update document title
    document.title = title;

    // Update meta description
    updateMetaTag("description", description);

    // Open Graph tags
    updateMetaTag("og:title", title, "property");
    updateMetaTag("og:description", description, "property");
    updateMetaTag("og:type", ogType, "property");

    if (canonicalUrl) {
      updateMetaTag("og:url", canonicalUrl, "property");
      updateLinkTag("canonical", canonicalUrl);
    }

    if (ogImage) {
      updateMetaTag("og:image", ogImage, "property");
    }

    // Article-specific tags
    if (ogType === "article" && publishedTime) {
      updateMetaTag("article:published_time", publishedTime, "property");
    }

    // Twitter Card tags
    updateMetaTag("twitter:card", ogImage ? "summary_large_image" : "summary", "name");
    updateMetaTag("twitter:title", title, "name");
    updateMetaTag("twitter:description", description, "name");
    if (ogImage) {
      updateMetaTag("twitter:image", ogImage, "name");
    }
  }, [title, description, canonicalUrl, ogType, ogImage, publishedTime]);

  return null;
}
