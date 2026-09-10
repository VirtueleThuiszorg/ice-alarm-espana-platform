import {
  AVATAR_QUALITY_LADDER,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_EDGE,
  UPLOAD_AVATAR_TYPES,
  fitWithin,
  nextAvatarEdge,
  type UploadAvatarType,
} from "@/lib/memberAvatar";

/**
 * THE BROWSER HALF OF RESIZING — `drawImage` and `toBlob`, and nothing that decides anything.
 *
 * Every decision (how big, which format, when to stop compressing, where to give up) lives in
 * `memberAvatar.ts` as a pure function with a test on it. What is left here cannot be unit
 * tested at all, because jsdom implements neither canvas nor `createImageBitmap` — so it is kept
 * as small and as dumb as possible, and the e2e spec is what exercises it for real.
 *
 * WHY WEBP FIRST. A photograph of a face at 512px is roughly a third smaller as WebP than as
 * JPEG at matched quality, which is the difference between one encode and three. Safari has
 * supported WebP encoding since 14, and the fallback is not a guess: `canEncodeWebp` asks the
 * canvas what it actually produced rather than sniffing the user agent, because a browser that
 * lies about WebP support hands back a PNG and the bucket then refuses the upload.
 */

export interface ResizedImage {
  blob: Blob;
  type: UploadAvatarType;
  width: number;
  height: number;
  /** The quality the encoder settled on, for the log line when something looks wrong. */
  quality: number;
}

/** Load a File into something `drawImage` accepts, and free it afterwards. */
async function loadBitmap(file: File): Promise<{ bitmap: ImageBitmap; close: () => void }> {
  // `createImageBitmap` decodes off the main thread, which matters on the phones these members
  // use: a 12-megapixel photo decoded synchronously freezes the tab for about a second.
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { bitmap, close: () => bitmap.close?.() };
  }
  // Fallback for anything without it — an <img> and an object URL, revoked either way.
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("The image could not be read"));
      el.src = url;
    });
    return {
      bitmap: image as unknown as ImageBitmap,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resize and re-encode a photograph to something the bucket will accept.
 *
 * Throws with a member-readable message rather than a DOM error: every failure here reaches
 * somebody who was trying to add their own picture, and "IndexSizeError" is not a sentence.
 */
export async function resizeAvatar(file: File): Promise<ResizedImage> {
  const { bitmap, close } = await loadBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot resize images");

    let edge: number | null = MAX_AVATAR_EDGE;

    while (edge !== null) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
      canvas.width = width;
      canvas.height = height;
      /*
        WHITE UNDERNEATH, because a PNG with transparency becomes BLACK when encoded to JPEG —
        and a member who uploads a cut-out portrait would get a photograph of a silhouette.
        Harmless for an opaque source.
      */
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);

      for (const type of UPLOAD_AVATAR_TYPES) {
        for (const quality of AVATAR_QUALITY_LADDER) {
          const blob = await toBlob(canvas, type, quality);
          // A browser that cannot encode this type hands back a different one (usually PNG).
          // Trusting `type` here is what would put a PNG in a bucket that refuses PNGs.
          if (!blob || blob.type !== type) break;
          if (blob.size <= MAX_AVATAR_BYTES) {
            return { blob, type, width, height, quality };
          }
        }
      }

      // Bottom of the ladder in both formats and still too big: shrink rather than degrade.
      edge = nextAvatarEdge(edge);
    }

    throw new Error("That picture could not be made small enough — please try another");
  } finally {
    close();
  }
}
