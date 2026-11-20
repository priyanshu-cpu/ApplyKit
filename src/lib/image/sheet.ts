import { PDFDocument } from "pdf-lib";
import { a4 } from "./geometry";
export async function photoSheet(
  blob: Blob,
  width: number,
  height: number,
  copies: number,
) {
  if (!Number.isInteger(copies) || copies < 1 || copies > 100)
    throw Error("Select between 1 and 100 copies.");
  const margin = 8,
    gap = 3;
  const columns = Math.floor((a4.width - 2 * margin + gap) / (width + gap));
  const rows = Math.floor((a4.height - 2 * margin + gap) / (height + gap));
  if (!columns || !rows || columns < 1 || rows < 1)
    throw Error("The photo is too large for the printable A4 area.");
  const pdf = await PDFDocument.create();
  const bytes = await blob.arrayBuffer();
  const image =
    blob.type === "image/png"
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
  const point = (mm: number) => (mm * 72) / 25.4;
  const perPage = columns * rows;
  for (let first = 0; first < copies; first += perPage) {
    const page = pdf.addPage([point(a4.width), point(a4.height)]);
    for (let i = 0; i < Math.min(perPage, copies - first); i++)
      page.drawImage(image, {
        x: point(margin + (i % columns) * (width + gap)),
        y: point(
          a4.height -
            margin -
            height -
            Math.floor(i / columns) * (height + gap),
        ),
        width: point(width),
        height: point(height),
      });
  }
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
