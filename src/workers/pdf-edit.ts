import { errorMessage } from "../lib/files";
import type { PDFCommand, PDFWorkerMessage } from "../lib/pdf/edit-client";
import { compactPDF, editPDF, mergePDFs } from "../lib/pdf/manipulate";

const send = (message: PDFWorkerMessage) => self.postMessage(message);

self.addEventListener("message", async ({ data }: MessageEvent<PDFCommand>) => {
  const progress = (count: number) => send({ progress: count });
  try {
    const outputs =
      data.kind === "compress"
        ? [await compactPDF(data.file)]
        : data.kind === "merge"
        ? [await mergePDFs(data.files, undefined, progress)]
        : await editPDF(
            data.file,
            data.groups,
            data.rotation,
            data.name,
            undefined,
            progress,
          );
    send({ outputs });
  } catch (error) {
    send({ error: errorMessage(error) });
  }
});
