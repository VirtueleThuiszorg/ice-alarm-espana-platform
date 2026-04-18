import { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

export async function uploadToStorage(
  supabase: SupabaseClient,
  filePath: string,
  fileName: string,
  bucket: string
): Promise<string> {
  // Read file
  const fileBuffer = fs.readFileSync(filePath);
  
  // Determine content type
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".vtt": "text/vtt",
    ".srt": "application/x-subrip",
  };
  const contentType = contentTypes[ext] || "application/octet-stream";

  // Upload to Supabase storage
  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

  return urlData.publicUrl;
}
