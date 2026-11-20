import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, RotateCw } from "lucide-react";
import {
  cleanName,
  errorMessage,
  extension,
  limits,
  sizeLabel,
  stem,
  type ImageMime,
  type Output,
} from "../lib/files";
import { parseRanges } from "../lib/pdf/ranges";
import type { PDFDocumentProxy, readPDFInfo } from "../lib/pdf/render";
import {
  Field,
  FilePicker,
  Notice,
  NumberField,
  Results,
  SelectField,
  Stats,
  Toggle,
  useObjectUrl,
  useDiscardFiles,
  useReady,
} from "./shared";

function Thumbnail({
  doc,
  n,
  rotation,
}: {
  doc: PDFDocumentProxy;
  n: number;
  rotation: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [blob, setBlob] = useState<Blob>();
  const url = useObjectUrl(blob);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setBlob(undefined);
    if (!visible) return;
    const controller = new AbortController();
    import("../lib/pdf/render")
      .then(({ renderPage }) =>
        renderPage(doc, n, {
          thumbnail: true,
          rotation,
          signal: controller.signal,
        }),
      )
      .then((blob) => {
        if (!controller.signal.aborted) setBlob(blob);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [doc, n, rotation, visible]);
  return (
    <span className="thumb" ref={ref}>
      {url ? (
        <img alt={"Preview of page " + n} src={url} loading="lazy" />
      ) : (
        <FileText size={25} aria-hidden="true" />
      )}
    </span>
  );
}
export default function PDFTool({
  slug,
  embedded = false,
  onResults,
}: {
  slug: string;
  embedded?: boolean;
  onResults?: (outputs: Output[]) => void;
}) {
  const hydrated = useReady();
  const merge = slug === "merge-pdf",
    split = slug === "split-pdf",
    rotate = slug === "rotate-pdf",
    imagePDF = slug === "image-to-pdf",
    raster = slug === "pdf-to-image",
    information = slug === "pdf-information";
  const multi = merge || imagePDF;
  const [files, setFiles] = useState<File[]>([]);
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof readPDFInfo>>>();
  const [chosen, setChosen] = useState<number[]>([]);
  const [rotation, setRotation] = useState<Record<number, number>>({});
  const [ranges, setRanges] = useState("");
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState("a4");
  const [width, setWidth] = useState("210");
  const [height, setHeight] = useState("297");
  const [orientation, setOrientation] = useState("portrait");
  const [margin, setMargin] = useState("10");
  const [fit, setFit] = useState("contain");
  const [mime, setMime] = useState<ImageMime>("image/png");
  const [ppi, setPpi] = useState("144");
  const controller = useRef<AbortController | null>(null);
  useDiscardFiles(() => {
    controller.current?.abort();
    setFiles([]);
    setOutputs([]);
    setBusy(false);
  });
  const first = files[0];
  const pageCount = doc?.numPages ?? 0;
  const all = Array.from({ length: pageCount }, (_, i) => i + 1);
  let groups: number[][] = [],
    rangeError = "";
  if (split && ranges && doc) {
    try {
      groups = parseRanges(ranges, pageCount);
    } catch (e) {
      rangeError = errorMessage(e);
    }
  }
  const rangePages = new Set(groups.flat());
  useEffect(() => {
    const token = new AbortController();
    let opened: PDFDocumentProxy | undefined;
    setDoc(undefined);
    setInfo(undefined);
    setChosen([]);
    setRotation({});
    setRanges("");
    setReadError("");
    if (!first || multi) {
      setLoading(false);
      return;
    }
    setLoading(true);
    import("../lib/pdf/render")
      .then(async (lib) => {
        opened = await lib.openPDF(first, token.signal);
        if (token.signal.aborted) {
          void opened.loadingTask.destroy().catch(() => {});
          return;
        }
        setDoc(opened);
        if (information) {
          const metadata = await lib.readPDFInfo(opened, token.signal);
          if (!token.signal.aborted) setInfo(metadata);
        }
      })
      .catch((e) => {
        if (!token.signal.aborted) setReadError(errorMessage(e));
      })
      .finally(() => {
        if (!token.signal.aborted) setLoading(false);
      });
    return () => {
      token.abort();
      if (opened) void opened.loadingTask.destroy().catch(() => {});
    };
  }, [first, multi, information]);
  useEffect(() => () => controller.current?.abort(), []);
  useLayoutEffect(() => {
    controller.current?.abort();
    setOutputs([]);
    setError("");
    setProgress("");
  }, [
    files,
    chosen,
    rotation,
    ranges,
    pageSize,
    width,
    height,
    orientation,
    margin,
    fit,
    mime,
    ppi,
  ]);
  const select = (n: number) =>
    setChosen((previous) =>
      previous.includes(n)
        ? previous.filter((page) => page !== n)
        : [...previous, n].sort((a, b) => a - b),
    );
  const rotatePage = (n: number) =>
    setRotation((previous) => ({
      ...previous,
      [n]: ((previous[n] ?? 0) + 90) % 360,
    }));
  const rotateAll = () =>
    setRotation((previous) =>
      Object.fromEntries(all.map((n) => [n, ((previous[n] ?? 0) + 90) % 360])),
    );
  async function run() {
    if (busy || !first) return;
    const token = new AbortController();
    controller.current = token;
    setBusy(true);
    setError("");
    setProgress("Preparing…");
    setOutputs([]);
    const progress = (n: number) => {
      if (!token.signal.aborted) setProgress(n + " processed…");
    };
    try {
      let next: Output[] = [];
      if (raster && doc) {
        if (!Number.isFinite(+ppi) || +ppi < 36 || +ppi > 600)
          throw Error("Enter a resolution from 36 to 600 PPI.");
        const { renderPage } = await import("../lib/pdf/render");
        let bytes = 0;
        for (const n of chosen) {
          token.signal.throwIfAborted();
          const blob = await renderPage(doc, n, {
            mime,
            ppi: +ppi,
            signal: token.signal,
          });
          bytes += blob.size;
          if (bytes > limits.batchBytes)
            throw Error(
              "The output exceeds 150 MB. Export fewer pages or use lower resolution.",
            );
          next.push({
            blob,
            name: stem(first.name) + "-page-" + n + "." + extension(mime),
          });
          progress(next.length);
        }
      } else if (imagePDF) {
        const { imagesToPDF } = await import("../lib/pdf/manipulate");
        token.signal.throwIfAborted();
        const [w, h] =
          pageSize === "a4"
            ? [210, 297]
            : pageSize === "letter"
              ? [215.9, 279.4]
              : [+width, +height];
        next = [
          await imagesToPDF(
            files,
            {
              w: orientation === "portrait" ? Math.min(w, h) : Math.max(w, h),
              h: orientation === "portrait" ? Math.max(w, h) : Math.min(w, h),
              margin: +margin,
              fit: fit as "contain" | "crop" | "stretch",
            },
            token.signal,
            progress,
          ),
        ];
      } else {
        const { runPDFEdit } = await import("../lib/pdf/edit-client");
        next = await runPDFEdit(
          merge
            ? { kind: "merge", files }
            : {
                kind: "edit",
                file: first,
                groups: rotate ? [all] : split ? groups : [chosen],
                rotation,
                name:
                  stem(first.name) +
                  (rotate ? "-rotated" : split ? "-split" : "-pages"),
              },
          token.signal,
          progress,
        );
      }
      token.signal.throwIfAborted();
      setOutputs(next);
      onResults?.(next);
      setProgress(
        "Your " + (next.length === 1 ? "file is" : "files are") + " ready.",
      );
    } catch (e) {
      if (!token.signal.aborted) {
        setError(errorMessage(e));
        setProgress("");
      }
    } finally {
      setBusy(false);
    }
  }
  const ready = merge
    ? files.length > 1
    : imagePDF
      ? files.length > 0
      : !!doc && (rotate || (split ? groups.length > 0 : chosen.length > 0));
  const action = merge
    ? "Merge PDFs"
    : imagePDF
      ? "Generate PDF"
      : rotate
        ? "Save rotated PDF"
        : split
          ? "Split PDF"
          : raster
            ? "Render selected pages"
            : "Extract selected pages";
  return (
    <div className="workspace" inert={!hydrated} aria-busy={!hydrated}>
      <section className="panel" aria-label="PDF input and settings">
        <div className="panel-head">
          <h2>
            {imagePDF
              ? "Select images"
              : multi
                ? "Select PDFs"
                : "Select a PDF"}
          </h2>
          {files.length > 0 && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => setFiles([])}
            >
              Start over
            </button>
          )}
        </div>
        <FilePicker
          kind={imagePDF ? "image" : "pdf"}
          files={files}
          onChange={setFiles}
          multiple={multi}
          reorder={multi}
          paste={imagePDF && !embedded}
          disabled={busy}
        />
        <Notice text={readError} error />
        {imagePDF && (
          <div className="fields">
            <SelectField
              label="Page size"
              value={pageSize}
              onChange={setPageSize}
              options={{ a4: "A4", letter: "Letter", custom: "Custom" }}
            />
            <SelectField
              label="Orientation"
              value={orientation}
              onChange={setOrientation}
              options={{ portrait: "Portrait", landscape: "Landscape" }}
            />
            {pageSize === "custom" && (
              <>
                <NumberField
                  label="Page width (mm)"
                  min={10}
                  max={1200}
                  step="any"
                  value={width}
                  onChange={setWidth}
                />
                <NumberField
                  label="Page height (mm)"
                  min={10}
                  max={1200}
                  step="any"
                  value={height}
                  onChange={setHeight}
                />
              </>
            )}
            <NumberField
              label="Margins (mm)"
              value={margin}
              step="any"
              onChange={setMargin}
            />
            <SelectField
              label="Image fit"
              value={fit}
              onChange={setFit}
              options={{
                contain: "Contain",
                crop: "Crop to fill",
                stretch: "Stretch",
              }}
            />
          </div>
        )}
        {split && (
          <div className="fields">
            <Field label="Page ranges" full>
              <input
                placeholder="1–3, 5, 7–9"
                value={ranges}
                onChange={(e) => setRanges(e.target.value)}
              />
              <small className="hint">
                Use commas to separate outputs. Each range makes a separate PDF.
              </small>
            </Field>
          </div>
        )}
        {raster && (
          <div className="fields">
            <SelectField
              label="Output format"
              options={{ "image/png": "PNG", "image/jpeg": "JPG" }}
              value={mime}
              onChange={(v) => setMime(v as ImageMime)}
            />
            <NumberField
              label="Resolution (PPI)"
              value={ppi}
              onChange={setPpi}
              min={36}
              max={600}
            />
          </div>
        )}
        <Notice text={rangeError} error />
        {!information && (
          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={busy || !ready}
              onClick={run}
            >
              {action}
            </button>
            {busy && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  controller.current?.abort();
                  setProgress("Processing canceled.");
                }}
              >
                Cancel
              </button>
            )}
          </div>
        )}
        <Notice text={error} error />
      </section>
      <section className="panel" aria-label="PDF preview and output">
        <div className="panel-head">
          <h2>
            {information
              ? "Document information"
              : multi
                ? "Files and results"
                : "Pages and results"}
          </h2>
          {doc && (
            <span className="hint">
              {pageCount} {pageCount === 1 ? "page" : "pages"}
            </span>
          )}
        </div>
        <Notice text={loading ? "Reading PDF…" : progress} />
        {outputs.length > 0 && (
          <div className="preview-result">
            <Results
              outputs={outputs}
              zipName={outputs.length > 1 ? "applykit-pdf-results.zip" : undefined}
            />
          </div>
        )}
        {!doc && !files.length && (
          <div className="empty-preview">
            <FileText size={34} aria-hidden="true" />
            <strong>
              {multi ? "Your results appear here" : "Your pages appear here"}
            </strong>
            <span className="hint">
              {imagePDF
                ? "Choose images to get started."
                : "Choose a PDF to get started."}
            </span>
          </div>
        )}
        {multi && files.length > 0 && (
          <Stats
            items={{
              "Selected files": files.length,
              "Total size": sizeLabel(
                files.reduce((sum, file) => sum + file.size, 0),
              ),
            }}
          />
        )}
        {doc && information && (
          <>
            <Stats
              items={{
                "File name": cleanName(first.name),
                "File size": sizeLabel(first.size),
                "Page count": pageCount,
                Title: info?.title,
                Author: info?.author,
                Created: info?.created,
                Modified: info?.updated,
              }}
            />
            {info && (
              <div className="table-scroll">
                <table className="data-table">
                  <caption className="sr-only">
                    Displayed page dimensions in PDF points
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Page</th>
                      <th scope="col">Width (pt)</th>
                      <th scope="col">Height (pt)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.sizes.map((page) => (
                      <tr key={page.n}>
                        <td>{page.n}</td>
                        <td>{page.width.toFixed(2)}</td>
                        <td>{page.height.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {doc && !information && (
          <>
            <div className="actions">
              {rotate ? (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={rotateAll}
                >
                  <RotateCw size={16} /> Rotate all
                </button>
              ) : (
                !split && (
                  <>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={busy || chosen.length === all.length}
                      onClick={() => setChosen(all)}
                    >
                      Select all
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={busy || !chosen.length}
                      onClick={() => setChosen([])}
                    >
                      Deselect all
                    </button>
                  </>
                )
              )}
            </div>
            <div className="pdf-pages">
              {all.map((n) => {
                const selected = split ? rangePages.has(n) : chosen.includes(n);
                return (
                  <div
                    className={"pdf-page" + (selected ? " selected" : "")}
                    key={n}
                  >
                    <Thumbnail doc={doc} n={n} rotation={rotation[n] ?? 0} />
                    {rotate ? (
                      <>
                        <span>
                          Page {n} · {rotation[n] ?? 0}°
                        </span>
                        <button
                          className="button secondary"
                          disabled={busy}
                          type="button"
                          aria-label={"Rotate page " + n}
                          onClick={() => rotatePage(n)}
                        >
                          <RotateCw size={15} /> Rotate
                        </button>
                      </>
                    ) : split ? (
                      <span>
                        Page {n}
                        {selected ? " · Selected" : ""}
                      </span>
                    ) : (
                      <Toggle
                        checked={selected}
                        onChange={() => {
                          if (!busy) select(n);
                        }}
                      >
                        Page {n}
                      </Toggle>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
