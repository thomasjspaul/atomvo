// Resize a phone photo before upload. Cohere vision at detail:"low" downsamples
// aggressively, and R2 keeps every photo 30 days, so there's no point sending 2-5 MB.
export async function downscaleImage(
  file: File,
  maxEdge = 1280,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file; // give up quietly, upload the original
    }
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale === 1 && file.size < 900_000) {
    bitmap.close?.();
    return file;
  }

  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", quality),
  );
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}
