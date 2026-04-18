import fs from "fs";
import path from "path";

interface CompositionProps {
  headline: string;
  bullets: string[];
  ctaText: string;
  contactLine: string;
  duration: number;
  language: string;
}

interface CaptionResult {
  vttPath: string;
  srtPath: string | null;
}

interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

export async function generateCaptions(
  props: CompositionProps,
  duration: number
): Promise<CaptionResult> {
  const segments = buildCaptionSegments(props, duration);
  
  // Create temp directory for captions
  const tempDir = `/tmp/captions/${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  const vttPath = path.join(tempDir, "captions.vtt");
  const srtPath = path.join(tempDir, "captions.srt");

  // Generate VTT
  const vttContent = generateVTT(segments);
  fs.writeFileSync(vttPath, vttContent, "utf-8");

  // Generate SRT
  const srtContent = generateSRT(segments);
  fs.writeFileSync(srtPath, srtContent, "utf-8");

  return { vttPath, srtPath };
}

function buildCaptionSegments(props: CompositionProps, duration: number): CaptionSegment[] {
  const segments: CaptionSegment[] = [];
  const { headline, bullets, ctaText, contactLine } = props;

  // Calculate timing based on content and duration
  const totalContent = [headline, ...bullets, ctaText, contactLine].filter(Boolean).length;
  const segmentDuration = duration / Math.max(totalContent, 1);

  let currentTime = 0;

  // Headline (first segment, slightly longer)
  if (headline) {
    const headlineDuration = Math.min(segmentDuration * 1.5, duration * 0.2);
    segments.push({
      start: currentTime,
      end: currentTime + headlineDuration,
      text: headline,
    });
    currentTime += headlineDuration;
  }

  // Bullets (main content)
  const bulletDuration = (duration - currentTime - (ctaText ? 3 : 0)) / Math.max(bullets.length, 1);
  for (const bullet of bullets) {
    if (bullet && bullet.trim()) {
      segments.push({
        start: currentTime,
        end: currentTime + bulletDuration,
        text: bullet.trim(),
      });
      currentTime += bulletDuration;
    }
  }

  // CTA (last 2-3 seconds)
  if (ctaText) {
    const ctaDuration = Math.min(3, duration - currentTime);
    if (ctaDuration > 0) {
      let ctaFull = ctaText;
      if (contactLine) {
        ctaFull += ` - ${contactLine}`;
      }
      segments.push({
        start: currentTime,
        end: currentTime + ctaDuration,
        text: ctaFull,
      });
    }
  }

  return segments;
}

function formatVTTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

function formatSRTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

function generateVTT(segments: CaptionSegment[]): string {
  let vtt = "WEBVTT\n\n";
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    vtt += `${i + 1}\n`;
    vtt += `${formatVTTTime(seg.start)} --> ${formatVTTTime(seg.end)}\n`;
    vtt += `${seg.text}\n\n`;
  }

  return vtt;
}

function generateSRT(segments: CaptionSegment[]): string {
  let srt = "";
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    srt += `${i + 1}\n`;
    srt += `${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}\n`;
    srt += `${seg.text}\n\n`;
  }

  return srt;
}
