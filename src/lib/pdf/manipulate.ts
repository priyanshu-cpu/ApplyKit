import {
  clip,
  degrees,
  endPath,
  PDFDocument,
  PDFName,
  PDFRawStream,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from "pdf-lib";
import { limits, stem, validateFile, type Output } from "../files";
import { zlibSync } from "fflate";
import { fitRect } from "../image/geometry";
import { drawImage, encode, openImage, release } from "../image/process";

async function load(file: File) {
  await validateFile(file, "pdf");
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(await file.arrayBuffer(), {
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
  } catch (error) {
    throw Error(
      /encrypt|password/i.test(String(error))
        ? "This PDF is password-protected. Unlock it and try again."
        : "This PDF is corrupt or uses features the editor cannot read.",
    );
  }
  if (!pdf.getPageCount() || pdf.getPageCount() > limits.pdfPages)
    throw Error("Choose a PDF with 1 to 500 pages.");
  return pdf;
}
async function sanitizedCopy(
  source: PDFDocument,
  pages: number[],
  rotation: Record<number, number> = {},
) {
  const pdf = await PDFDocument.create();
  await copyInto(pdf, source, pages, rotation);
  return pdf;
}
async function copyInto(
  target: PDFDocument,
  source: PDFDocument,
  pages: number[],
  rotation: Record<number, number> = {},
) {
  const copied = await target.copyPages(
    source,
    pages.map((n) => n - 1),
  );
  for (const [index, page] of copied.entries()) {
    // Remove page-level actions and annotations in generated files.
    page.node.delete(page.node.context.obj("AA"));
    page.node.delete(page.node.context.obj("Annots"));
    if (rotation[pages[index]])
      page.setRotation(
        degrees((page.getRotation().angle + rotation[pages[index]]) % 360),
      );
    target.addPage(page);
  }
}
const output = async (pdf: PDFDocument, name: string): Promise<Output> => ({
  blob: new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  }),
  name,
});
export async function compactPDF(file: File) {
  const pdf = await load(file);
  const filter = PDFName.of("Filter");
  for (const [ref, stream] of pdf.context.enumerateIndirectObjects()) {
    if (!(stream instanceof PDFRawStream) || stream.dict.has(filter) ||
        stream.dict.has(PDFName.of("F")) || stream.contents.length < 128) continue;
    const compressed = zlibSync(stream.contents);
    if (compressed.length + 24 >= stream.contents.length) continue;
    const dict = stream.dict.clone();
    dict.set(filter, PDFName.of("FlateDecode"));
    pdf.context.assign(ref, PDFRawStream.of(dict, compressed));
  }
  return output(pdf, stem(file.name) + "-compressed.pdf");
}

export async function mergePDFs(
  files: File[],
  signal?: AbortSignal,
  progress?: (n: number) => void,
) {
  if (files.length < 2) throw Error("Select at least two PDFs to merge.");
  const pdf = await PDFDocument.create();
  for (const [index, file] of files.entries()) {
    signal?.throwIfAborted();
    const source = await load(file);
    const total = source.getPageCount();
    if (pdf.getPageCount() + total > limits.pdfPages)
      throw Error("The merged output exceeds 500 pages.");
    await copyInto(
      pdf,
      source,
      Array.from({ length: total }, (_, i) => i + 1),
    );
    progress?.(index + 1);
  }
  const merged = await output(pdf, "applykit-merged.pdf");
  if (merged.blob.size > limits.batchBytes)
    throw Error("The merged output exceeds 150 MB. Use fewer files.");
  return merged;
}
export async function editPDF(
  file: File,
  groups: number[][],
  rotation: Record<number, number>,
  name: string,
  signal?: AbortSignal,
  progress?: (n: number) => void,
) {
  const source = await load(file);
  if (
    !groups.length ||
    groups.some(
      (group) =>
        !group.length ||
        group.some(
          (n) => !Number.isInteger(n) || n < 1 || n > source.getPageCount(),
        ),
    )
  )
    throw Error("Select valid pages before exporting.");
  const outputs: Output[] = [];
  let bytes = 0;
  for (const [index, group] of groups.entries()) {
    signal?.throwIfAborted();
    const label = groups.length > 1 ? "-" + (index + 1) : "";
    const file = await output(
      await sanitizedCopy(source, group, rotation),
      name + label + ".pdf",
    );
    bytes += file.blob.size;
    if (bytes > limits.batchBytes)
      throw Error("The output exceeds 150 MB. Select fewer pages at a time.");
    outputs.push(file);
    progress?.(index + 1);
  }
  return outputs;
}
export type PDFImageOptions = {
  w: number;
  h: number;
  margin: number;
  fit: "crop" | "contain" | "stretch";
};
export const pt = (mm: number) => (mm * 72) / 25.4;
export async function imagesToPDF(
  files: File[],
  options: PDFImageOptions,
  signal?: AbortSignal,
  progress?: (n: number) => void,
) {
  if (!files.length) throw Error("Choose one or more images.");
  const { w, h, margin, fit } = options;
  if (
    ![w, h, margin].every(Number.isFinite) ||
    w < 10 ||
    h < 10 ||
    w > 1200 ||
    h > 1200 ||
    margin < 0 ||
    2 * margin >= Math.min(w, h)
  )
    throw Error(
      "Page sides must be 10–1,200 mm, and the margins must fit inside the page.",
    );
  const pdf = await PDFDocument.create();
  for (const [index, file] of files.entries()) {
    signal?.throwIfAborted();
    const input = await openImage(file);
    let canvas: HTMLCanvasElement | undefined;
    try {
      // Draw into a contained source canvas first, then fit the PDF page in points.
      canvas = drawImage(input, { background: "#ffffff" }, "image/jpeg");
      const blob = await encode(canvas, "image/jpeg", 0.95);
      const picture = await pdf.embedJpg(await blob.arrayBuffer());
      const page = pdf.addPage([pt(w), pt(h)]);
      const mw = pt(w - margin * 2),
        mh = pt(h - margin * 2),
        m = pt(margin);
      const rect = fitRect(picture.width, picture.height, mw, mh, fit);
      if (fit === "crop") {
        page.pushOperators(
          pushGraphicsState(),
          rectangle(m, m, mw, mh),
          clip(),
          endPath(),
        );
        page.drawImage(picture, {
          x: m + rect.x,
          y: m + rect.y,
          width: rect.w,
          height: rect.h,
        });
        page.pushOperators(popGraphicsState());
      } else
        page.drawImage(picture, {
          x: m + rect.x,
          y: m + rect.y,
          width: rect.w,
          height: rect.h,
        });
      progress?.(index + 1);
    } finally {
      input.bitmap.close();
      if (canvas) release(canvas);
    }
  }
  const generated = await output(pdf, "applykit-images.pdf");
  if (generated.blob.size > limits.batchBytes)
    throw Error("The generated PDF exceeds 150 MB. Use fewer images.");
  return generated;
}
