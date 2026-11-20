import {
  GlobalWorkerOptions,
  getDocument,
  AnnotationMode,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { limits, validateFile, type ImageMime } from "../files";
import { canvasOf, encode, release } from "../image/process";
export type { PDFDocumentProxy };
GlobalWorkerOptions.workerSrc = workerUrl;
const assets = "/pdf-assets/";
export async function openPDF(file: File, signal?: AbortSignal) {
  await validateFile(file, "pdf");
  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const task = getDocument({
    data,
    cMapUrl: assets + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: assets + "standard_fonts/",
    wasmUrl: assets + "wasm/",
    iccUrl: assets + "iccs/",
    useWorkerFetch: true,
    enableXfa: false,
    maxImageSize: limits.pixels,
    canvasMaxAreaInBytes: limits.pixels * 4,
  });
  const cancel = () => {
    void task.destroy().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  task.onPassword = () => {
    cancel();
  };
  try {
    const doc = await task.promise;
    if (!doc.numPages || doc.numPages > limits.pdfPages)
      throw Error("Choose a PDF with 1 to 500 pages.");
    return doc;
  } catch (error) {
    cancel();
    if (/password|destroy/i.test(String(error)))
      throw Error(
        "This PDF is password-protected or was closed. Unlock it and try again.",
      );
    if (error instanceof Error && error.message.includes("500 pages"))
      throw error;
    throw Error("This PDF cannot be opened. It may be damaged or unsupported.");
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
export async function renderPage(
  doc: PDFDocumentProxy,
  n: number,
  settings: {
    ppi?: number;
    thumbnail?: boolean;
    mime?: ImageMime;
    rotation?: number;
    signal?: AbortSignal;
  } = {},
) {
  settings.signal?.throwIfAborted();
  const page = await doc.getPage(n);
  settings.signal?.throwIfAborted();
  const rotation = (page.rotate + (settings.rotation ?? 0)) % 360;
  const before = page.getViewport({ scale: 1, rotation });
  const scale = settings.thumbnail
    ? 170 / Math.max(before.width, before.height)
    : (settings.ppi ?? 144) / 72;
  const viewport = page.getViewport({ scale, rotation });
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = canvasOf(
      Math.max(1, Math.ceil(viewport.width)),
      Math.max(1, Math.ceil(viewport.height)),
    );
    const task = page.render({
      canvas,
      viewport,
      annotationMode: AnnotationMode.DISABLE,
      background: "#ffffff",
    });
    const cancel = () => task.cancel();
    settings.signal?.addEventListener("abort", cancel, { once: true });
    try {
      await task.promise;
      settings.signal?.throwIfAborted();
      return await encode(canvas, settings.mime ?? "image/png", 0.93);
    } finally {
      settings.signal?.removeEventListener("abort", cancel);
    }
  } finally {
    if (canvas) release(canvas);
    page.cleanup();
  }
}
export async function readPDFInfo(doc: PDFDocumentProxy, signal?: AbortSignal) {
  const { info } = await doc.getMetadata();
  const data = info as Record<string, unknown>;
  const sizes = [];
  for (let n = 1; n <= doc.numPages; n++) {
    signal?.throwIfAborted();
    const page = await doc.getPage(n),
      viewport = page.getViewport({ scale: 1 });
    sizes.push({ n, width: viewport.width, height: viewport.height });
    page.cleanup();
  }
  const value = (key: string) =>
    typeof data[key] === "string" ? String(data[key]).slice(0, 300) : undefined;
  const date = (key: string) => {
    const raw = value(key);
    const match = raw?.match(/^D:(\d{4})(\d{2})?(\d{2})?/);
    return match ? match.slice(1).filter(Boolean).join("-") : raw;
  };
  return {
    sizes,
    title: value("Title"),
    author: value("Author"),
    created: date("CreationDate"),
    updated: date("ModDate"),
  };
}
