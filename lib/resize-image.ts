const MAX_EDGE = 512;
const MIME = "image/webp";
const QUALITY = 0.85;

export type ResizedImage = { blob: Blob; extension: string; type: string };

/**
 * Crop to a centred square, scale down to 512px, re-encode as WebP.
 *
 * Phone photos are several megabytes and 4000px wide, for something rendered
 * at 42 pixels. Doing this in the browser means the big file never leaves the
 * device, uploads finish quickly on campus wifi, and every stored avatar is a
 * predictable square well under the bucket's 2MB limit.
 */
export async function resizeToAvatar(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const edge = Math.min(bitmap.width, bitmap.height);
    const target = Math.min(edge, MAX_EDGE);

    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't process that image.");

    context.drawImage(
      bitmap,
      (bitmap.width - edge) / 2,
      (bitmap.height - edge) / 2,
      edge,
      edge,
      0,
      0,
      target,
      target
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, MIME, QUALITY)
    );
    if (!blob) throw new Error("Your browser couldn't process that image.");

    // Safari used to ignore the WebP request and hand back a PNG; go with
    // whatever actually came out rather than mislabelling the upload.
    const type = blob.type || MIME;
    return { blob, type, extension: type === "image/png" ? "png" : "webp" };
  } finally {
    bitmap.close();
  }
}
