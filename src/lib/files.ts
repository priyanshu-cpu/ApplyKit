export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export type FileKind = ImageMime | "application/pdf";
export const imageFormats: Record<ImageMime, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};
export const limits = {
  imageBytes: 32 * 1024 ** 2,
  pdfBytes: 64 * 1024 ** 2,
  batchBytes: 150 * 1024 ** 2,
  pixels: 24_000_000,
  side: 8192,
  files: 25,
  pdfPages: 500,
} as const;
export const extension = (mime: FileKind) =>
  ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  })[mime];
export const cleanName = (name: string) =>
  name
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\\/:*?"<>|]/g,
      "_",
    )
    .trim()
    .slice(0, 130) || "document";
export const stem = (name: string) =>
  cleanName(name).replace(/\.[^.]+$/, "") || "document";
export const kb = (bytes: number) => bytes / 1024;
export function sizeLabel(bytes: number) {
  return bytes < 1024
    ? bytes + " B"
    : bytes < 1024 ** 2
      ? Number(kb(bytes).toFixed(2)) + " KB"
      : Number((bytes / 1024 ** 2).toFixed(2)) + " MB";
}
export function detectHeader(bytes: Uint8Array): FileKind | undefined {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 8 &&
    v.getUint32(0) === 0x89504e47 &&
    v.getUint32(4) === 0x0d0a1a0a
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    v.getUint32(0) === 0x52494646 &&
    v.getUint32(8) === 0x57454250
  )
    return "image/webp";
  if (
    bytes.length >= 5 &&
    new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-")
  )
    return "application/pdf";
}
export async function validateFile(file: File, kind: "image" | "pdf" | "both") {
  const mime = detectHeader(
    new Uint8Array(await file.slice(0, 1024).arrayBuffer()),
  );
  if (
    !mime ||
    (kind === "image" && mime === "application/pdf") ||
    (kind === "pdf" && mime !== "application/pdf")
  )
    throw Error(
      "Choose a supported " +
        (kind === "pdf"
          ? "PDF"
          : kind === "image"
            ? "JPG, PNG or WebP image"
            : "image or PDF") +
        ".",
    );
  const max = mime === "application/pdf" ? limits.pdfBytes : limits.imageBytes;
  if (file.size > max)
    throw Error("This file exceeds the " + sizeLabel(max) + " limit.");
  return mime;
}
export type Output = { name: string; blob: Blob };
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The operation could not be completed.";
export function download({ name, blob }: Output) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = cleanName(name);
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  setTimeout(() => anchor.remove(), 1_000);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export async function zipFiles(outputs: Output[]): Promise<Blob> {
  if (!outputs.length) throw Error("Add a file before creating a ZIP.");
  if (
    outputs.reduce((sum, file) => sum + file.blob.size, 0) > limits.batchBytes
  )
    throw Error(
      "The ZIP exceeds the 150 MB batch limit. Download the files individually.",
    );
  const { zip } = await import("fflate");
  const used = new Set<string>();
  const names = outputs.map(({ name }) => {
    const sanitized = cleanName(name);
    let unique = sanitized;
    for (let count = 2; used.has(unique.toLowerCase()); count++)
      unique = count + "-" + sanitized;
    used.add(unique.toLowerCase());
    return unique;
  });
  const values = await Promise.all(
    outputs.map(
      async (output) => new Uint8Array(await output.blob.arrayBuffer()),
    ),
  );
  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(
      Object.fromEntries(names.map((name, index) => [name, values[index]])),
      { level: 0 },
      (error, data) => (error ? reject(error) : resolve(data)),
    ),
  );
  return new Blob([new Uint8Array(zipped)], { type: "application/zip" });
}
