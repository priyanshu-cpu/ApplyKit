import { useEffect, useState } from "react";
import { errorMessage, type Output } from "../lib/files";
import type { PDFDocumentProxy } from "../lib/pdf/render";
import { Notice, useObjectUrl } from "./shared";

// Load the generated PDF on demand so the preview shows what will actually download.
export default function CompressedPDFPreview({ output }: { output: Output }) {
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [picture, setPicture] = useState<Blob>();
  const [error, setError] = useState("");
  const url = useObjectUrl(picture);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let loaded: PDFDocumentProxy | undefined;
    import("../lib/pdf/render").then(async ({ openPDF }) => {
      loaded = await openPDF(new File([output.blob], output.name, { type: "application/pdf" }), controller.signal);
      if (controller.signal.aborted) await loaded.loadingTask.destroy();
      else setDoc(loaded);
    }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => {
      controller.abort();
      if (loaded) void loaded.loadingTask.destroy().catch(() => {});
    };
  }, [open, output]);

  useEffect(() => {
    if (!doc) return;
    const controller = new AbortController();
    setPicture(undefined);
    setError("");
    import("../lib/pdf/render").then(async ({ renderPage }) => {
      const dimensions = (await doc.getPage(page)).getViewport({ scale: 1 });
      const ppi = Math.min(150, 72 * 2000 / Math.max(dimensions.width, dimensions.height));
      const image = await renderPage(doc, page, { ppi, includeAnnotations: true, signal: controller.signal });
      if (!controller.signal.aborted) setPicture(image);
    }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [doc, page]);

  if (!open) return <button type="button" className="button secondary" onClick={() => setOpen(true)}>Preview compressed PDF</button>;
  return <div>
    {doc && <div className="actions">
      <button type="button" className="button secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous page</button>
      <span>Page {page} of {doc.numPages}</span>
      <button type="button" className="button secondary" disabled={page === doc.numPages} onClick={() => setPage(page + 1)}>Next page</button>
    </div>}
    <Notice text={error || (!url ? "Loading preview…" : "")} error={!!error} />
    {url && <img style={{ maxWidth: "100%", height: "auto" }} src={url} alt={"Compressed PDF page " + page} />}
  </div>;
}
