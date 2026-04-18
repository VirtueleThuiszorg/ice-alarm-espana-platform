import { useState, useCallback } from "react";
import { useSocialPostImages } from "./useSocialPostImages";
import { useToast } from "./use-toast";
import i18n from "@/i18n";

interface ImageTextData {
  headline: string;
  subheadline: string;
  cta?: string;
}

interface GenerateImageOptions {
  imageText: ImageTextData;
  width?: number;
  height?: number;
}

// ICE Alarm España brand colors (from design system)
const BRAND_COLORS = {
  primary: "#E74C3C",       // Coral Red
  primaryDark: "#C0392B",   // Darker Coral
  white: "#FFFFFF",
  dark: "#2D3748",
  lightGray: "#F7FAFC",
  accent: "#FFF5F5",        // Soft coral background
};

export function useBrandedImageGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const { uploadImage, isUploading } = useSocialPostImages();
  const { toast } = useToast();

  const generateImage = useCallback(async (options: GenerateImageOptions): Promise<string | null> => {
    const { imageText, width = 1200, height = 630 } = options; // Facebook recommended size

    setIsGenerating(true);

    try {
      // Create canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not get canvas context");
      }

      // === BACKGROUND ===
      // Create gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, width, height);
      bgGradient.addColorStop(0, BRAND_COLORS.accent);
      bgGradient.addColorStop(0.5, BRAND_COLORS.white);
      bgGradient.addColorStop(1, BRAND_COLORS.lightGray);
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // === DECORATIVE ELEMENTS ===
      // Top-left corner accent
      ctx.fillStyle = BRAND_COLORS.primary;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(200, 0);
      ctx.lineTo(0, 200);
      ctx.closePath();
      ctx.fill();

      // Bottom-right corner accent
      ctx.beginPath();
      ctx.moveTo(width, height);
      ctx.lineTo(width - 200, height);
      ctx.lineTo(width, height - 200);
      ctx.closePath();
      ctx.fill();

      // === LOGO AREA ===
      // Draw heart icon (brand logo representation)
      ctx.save();
      ctx.translate(80, 70);

      // Heart background circle
      ctx.fillStyle = `${BRAND_COLORS.primary}20`;
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, Math.PI * 2);
      ctx.fill();

      // Heart icon (simplified path)
      ctx.fillStyle = BRAND_COLORS.primary;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-15, -8, -25, 8, 0, 25);
      ctx.bezierCurveTo(25, 8, 15, -8, 0, 8);
      ctx.fill();

      ctx.restore();

      // Brand name next to logo
      ctx.fillStyle = BRAND_COLORS.dark;
      ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
      ctx.fillText("ICE Alarm", 130, 65);
      ctx.fillStyle = BRAND_COLORS.primary;
      ctx.font = "600 18px system-ui, -apple-system, sans-serif";
      ctx.fillText("España", 130, 90);

      // === MAIN CONTENT AREA ===
      const contentPadding = 80;
      const contentY = 180;
      const maxTextWidth = width - (contentPadding * 2);

      // Headline
      ctx.fillStyle = BRAND_COLORS.dark;
      ctx.font = "bold 56px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";

      // Word wrap headline
      const headlineLines = wrapText(ctx, imageText.headline, maxTextWidth);
      let currentY = contentY;
      headlineLines.forEach((line) => {
        ctx.fillText(line, width / 2, currentY);
        currentY += 66;
      });

      // Subheadline
      currentY += 20;
      ctx.fillStyle = BRAND_COLORS.dark;
      ctx.globalAlpha = 0.7;
      ctx.font = "400 28px system-ui, -apple-system, sans-serif";

      const subheadlineLines = wrapText(ctx, imageText.subheadline, maxTextWidth);
      subheadlineLines.forEach((line) => {
        ctx.fillText(line, width / 2, currentY);
        currentY += 36;
      });
      ctx.globalAlpha = 1;

      // === CTA BUTTON ===
      if (imageText.cta) {
        const ctaText = imageText.cta;
        ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
        const ctaWidth = ctx.measureText(ctaText).width + 60;
        const ctaHeight = 56;
        const ctaX = (width - ctaWidth) / 2;
        const ctaY = height - 120;

        // Button background with rounded corners
        ctx.fillStyle = BRAND_COLORS.primary;
        roundRect(ctx, ctaX, ctaY, ctaWidth, ctaHeight, 28);
        ctx.fill();

        // Button text
        ctx.fillStyle = BRAND_COLORS.white;
        ctx.textAlign = "center";
        ctx.fillText(ctaText, width / 2, ctaY + 38);
      }

      // === FOOTER INFO ===
      ctx.textAlign = "center";
      ctx.font = "500 18px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = BRAND_COLORS.dark;
      ctx.globalAlpha = 0.6;
      ctx.fillText("🌐 www.icealarmespana.es  |  📞 +34 900 123 456  |  💬 DM us", width / 2, height - 35);
      ctx.globalAlpha = 1;

      // === EXPORT TO BLOB ===
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png", 1.0);
      });

      if (!blob) {
        throw new Error("Failed to create image blob");
      }

      // Create a File object from the blob
      const file = new File([blob], `social-post-${Date.now()}.png`, { type: "image/png" });

      // Upload to Supabase
      const imageUrl = await uploadImage(file);

      if (imageUrl) {
        toast({
          title: i18n.t("ai.brandedImageGenerated"),
          description: i18n.t("ai.brandedImageGeneratedDesc"),
        });
      }

      return imageUrl;
    } catch (error: any) {
      console.error("Image generation error:", error);
      toast({
        title: i18n.t("ai.brandedImageFailed"),
        description: error.message || i18n.t("ai.generationFailed"),
        variant: "destructive",
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [uploadImage, toast]);

  return {
    generateImage,
    isGenerating: isGenerating || isUploading,
  };
}

// Helper function to wrap text
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Helper function to draw rounded rectangles
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
