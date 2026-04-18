import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";

interface RenderOptions {
  compositionId: string;
  props: Record<string, unknown>;
  outputDir: string;
  format: string;
  duration: number;
  onProgress?: (progress: number) => Promise<void>;
}

interface RenderResult {
  videoPath: string;
  thumbnailPath: string;
}

// Map format string to dimensions
function getFormatDimensions(format: string): { width: number; height: number } {
  switch (format) {
    case "9:16":
      return { width: 1080, height: 1920 }; // Portrait (TikTok/Reels)
    case "1:1":
      return { width: 1080, height: 1080 }; // Square
    case "16:9":
    default:
      return { width: 1920, height: 1080 }; // Landscape
  }
}

export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  const { compositionId, props, outputDir, format, duration, onProgress } = options;

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const videoPath = path.join(outputDir, "output.mp4");
  const thumbnailPath = path.join(outputDir, "thumbnail.jpg");

  // Get dimensions for format
  const { width, height } = getFormatDimensions(format);

  // Calculate duration in frames (30fps)
  const fps = 30;
  const durationInFrames = duration * fps;

  console.log(`Rendering: ${compositionId}, ${format} (${width}x${height}), ${duration}s (${durationInFrames} frames)`);

  // Bundle the Remotion project
  const bundleLocation = await bundle({
    entryPoint: path.resolve(__dirname, "remotion/index.ts"),
    // If pre-bundled, use this instead:
    // bundleDir: path.resolve(__dirname, "../remotion-bundle"),
  });

  // Select the composition
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps: {
      ...props,
      width,
      height,
      durationInFrames,
    },
  });

  // Render the video
  await renderMedia({
    composition: {
      ...composition,
      width,
      height,
      durationInFrames,
    },
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: videoPath,
    inputProps: {
      ...props,
      width,
      height,
      durationInFrames,
    },
    onProgress: async ({ progress }) => {
      if (onProgress) {
        await onProgress(Math.floor(progress * 100));
      }
    },
  });

  // Extract thumbnail from first frame with clear content (frame 30 = 1 second in)
  await extractThumbnail(videoPath, thumbnailPath, 1);

  return { videoPath, thumbnailPath };
}

async function extractThumbnail(videoPath: string, outputPath: string, timeSeconds: number): Promise<void> {
  const ffmpeg = await import("fluent-ffmpeg");
  
  return new Promise((resolve, reject) => {
    ffmpeg.default(videoPath)
      .screenshots({
        timestamps: [timeSeconds],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "1280x720",
      })
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err));
  });
}
