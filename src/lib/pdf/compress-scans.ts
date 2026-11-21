import { PDFDocument } from "pdf-lib";
import { limits } from "../files";
import { renderPage, type PDFDocumentProxy } from "./render";

// Ordered by detail. Keep a floor so very small targets do not produce illegible thumbnails.
const profiles = [
  { ppi: 72, quality: 0.20 },
  { ppi: 72, quality: 0.34 },
  { ppi: 90, quality: 0.48 },
  { ppi: 120, quality: 0.65 },
  { ppi: 150, quality: 0.73 },
  { ppi: 180, quality: 0.80 },
  { ppi: 220, quality: 0.86 },
];

export async function compressScan(
  doc: PDFDocumentProxy, byteCeiling: number, signal: AbortSignal,
  progress: (message: string) => void, targetBytes?: number,
) {
  let best: Blob | undefined;
  let highestDetailFit: Blob | undefined;
  let low = 0;
  let high = targetBytes === undefined ? profiles.findIndex(profile => profile.ppi === 120) : profiles.length - 1;
  // First try the highest requested detail. Search lower settings if it misses.
  let index = high;
  while (low <= high) {
    const profile = profiles[index];
    const ceiling = highestDetailFit && targetBytes !== undefined
      ? targetBytes + 1 : best?.size ?? byteCeiling;
    const candidate = await renderCandidate(doc, profile, ceiling, signal, progress);
    if (candidate && (!best || candidate.size < best.size)) best = candidate;
    if (candidate && targetBytes === undefined) return candidate;
    if (candidate && targetBytes !== undefined && candidate.size <= targetBytes) {
      highestDetailFit = candidate;
      low = index + 1;
    } else {
      high = index - 1;
    }
    index = Math.floor((low + high) / 2);
  }
  return highestDetailFit ?? best;
}

async function renderCandidate(
  doc: PDFDocumentProxy, profile: typeof profiles[number], byteCeiling: number,
  signal: AbortSignal, progress: (message: string) => void,
) {
  const pdf = await PDFDocument.create();
  let imageBytes = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    signal.throwIfAborted();
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const ppi = Math.min(profile.ppi, 72 * (limits.side - 1) / Math.max(width, height),
      72 * Math.sqrt((limits.pixels / 1.01) / (width * height)));
    progress(`Trying ${Math.round(ppi)} PPI at ${Math.round(profile.quality * 100)}% quality · page ${n} of ${doc.numPages}`);
    const blob = await renderPage(doc, n, {
      ppi, mime: "image/jpeg", quality: profile.quality, includeAnnotations: true, signal,
    });
    imageBytes += blob.size;
    if (imageBytes >= byteCeiling) return;
    signal.throwIfAborted();
    const image = await pdf.embedJpg(await blob.arrayBuffer());
    pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  }
  signal.throwIfAborted();
  const result = new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
  return result.size < byteCeiling ? result : undefined;
}
