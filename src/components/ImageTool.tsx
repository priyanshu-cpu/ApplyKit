import { useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCw, SlidersHorizontal, Download } from "lucide-react";
import {
  aspect,
  clamp,
  cropToAspect,
  fullCrop,
  toPixels,
  toMM,
  type Crop,
  type Unit,
} from "../lib/image/geometry";
import {
  compress,
  drawImage,
  encode,
  openImage,
  orientedSize,
  release,
  rotateSource,
  type ImageOptions,
  type ImageSource,
} from "../lib/image/process";
import {
  cleanName,
  download,
  errorMessage,
  extension,
  imageFormats,
  limits,
  sizeLabel,
  stem,
  type ImageMime,
  type Output,
} from "../lib/files";
import { imageChecks, ruleError, type ImageRule } from "../lib/validation";
import {
  CheckList,
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
import CropEditor from "./CropEditor";

const defaults = {
  width: "",
  height: "",
  scale: "50",
  resizeBy: "px",
  lock: true,
  fit: "contain",
  mime: "image/jpeg",
  quality: 92,
  target: "50",
  sizeUnit: "KB",
  reduce: false,
  min: "",
  max: "",
  requireFormat: "",
  unit: "mm",
  ppi: "300",
  copies: "6",
  rotation: 0,
  zoom: 100,
  panX: 0,
  panY: 0,
  cropRatio: "free",
  trim: true,
  grayscale: false,
  brightness: 100,
  contrast: 100,
  fill: false,
  background: "#ffffff",
  text: "",
  name: "",
  date: "",
  font: 24,
  color: "#ffffff",
  opacity: 85,
  horizontal: "center",
  vertical: "bottom",
};
type Settings = typeof defaults;
type Generated = {
  outputs: Output[];
  width: number;
  height: number;
  mime: ImageMime;
  met: boolean;
};
const ratios: Record<string, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "2:3": 2 / 3,
};
export default function ImageTool({
  slug,
  embedded = false,
  initialTarget,
  onOutput,
}: {
  slug: string;
  embedded?: boolean;
  initialTarget?: number;
  onOutput?: (files: Output[]) => void;
}) {
  const ready = useReady();
  const compressor = slug === "image-compressor",
    resize = slug === "image-resizer",
    signature = slug === "signature-resizer",
    passport = slug === "passport-photo-maker",
    cropper = slug === "image-cropper",
    batch = slug === "image-converter",
    checker = slug === "image-dimension-checker",
    watermark = slug === "image-watermark";
  const editableCrop = signature || passport || cropper;
  const init = (): Settings => ({
    ...defaults,
    ...(initialTarget ? { target: String(initialTarget) } : {}),
    ...(passport
      ? { width: "35", height: "45", fit: "crop" }
      : signature
        ? { width: "140", height: "60", max: "30", fill: true }
        : batch
          ? { mime: "image/png" }
          : {}),
  });
  const [settings, setSettings] = useState(init);
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<ImageSource>();
  const [sourceFile, setSourceFile] = useState<File>();
  const [crop, setCrop] = useState<Crop>(fullCrop);
  const [result, setResult] = useState<Generated>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [decodeError, setDecodeError] = useState("");
  const [sheetMessage, setSheetMessage] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const [run, setRun] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [compare, setCompare] = useState(50);
  const [rotated, setRotated] = useState<Blob>();
  const job = useRef<AbortController | null>(null);
  const originalUrl = useObjectUrl(sourceFile);
  const resultUrl = useObjectUrl(result?.outputs[0]?.blob);
  const rotatedUrl = useObjectUrl(rotated);
  const primary = files[0];
  useEffect(() => {
    let active = true;
    let opened: ImageSource | undefined;
    setSource(undefined);
    setSourceFile(undefined);
    setDecodeError("");
    setCrop(fullCrop);
    if (!primary) {
      setLoading(false);
      return;
    }
    setLoading(true);
    openImage(primary)
      .then((value) => {
        opened = value;
        if (!active) {
          value.bitmap.close();
          return;
        }
        setSource(value);
        setSourceFile(
          new File([primary], cleanName(primary.name), { type: value.mime }),
        );
        if (resize)
          setSettings((s) => ({
            ...s,
            width: String(value.width),
            height: String(value.height),
          }));
      })
      .catch((e) => {
        if (active) setDecodeError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      opened?.bitmap.close();
    };
  }, [primary, resize]);
  useEffect(() => {
    setRotated(undefined);
    if (!source || !settings.rotation || !editableCrop) return;
    let active = true;
    const canvas = rotateSource(source, settings.rotation);
    encode(canvas, "image/png", 1)
      .then((blob) => {
        if (active) setRotated(blob);
      })
      .catch(() => {})
      .finally(() => release(canvas));
    return () => {
      active = false;
    };
  }, [source, settings.rotation, editableCrop]);
  const oriented = source
    ? orientedSize(source.width, source.height, settings.rotation)
    : undefined;
  const dimensions = () => {
    if (passport)
      return {
        width: toPixels(+settings.width, settings.unit as Unit, +settings.ppi),
        height: toPixels(
          +settings.height,
          settings.unit as Unit,
          +settings.ppi,
        ),
      };
    if (resize && settings.resizeBy === "percent" && source)
      return {
        width: Math.round((source.width * +settings.scale) / 100),
        height: Math.round((source.height * +settings.scale) / 100),
      };
    if (resize && settings.fit === "fit" && source) {
      const width = +settings.width;
      const height = +settings.height;
      if (width > 0 && height > 0) {
        const scale = Math.min(width / source.width, height / source.height);
        return {
          width: Math.max(1, Math.round(source.width * scale)),
          height: Math.max(1, Math.round(source.height * scale)),
        };
      }
    }
    if (signature || resize || (cropper && settings.cropRatio === "custom"))
      return { width: +settings.width, height: +settings.height };
    return {};
  };
  const out = dimensions();
  const selectedMime = settings.mime as ImageMime;
  const optional = (value: string) =>
    value === "" ? undefined : Number(value);
  const rule: ImageRule = {
    width: optional(settings.width),
    height: optional(settings.height),
    minKB: optional(settings.min),
    maxKB: optional(settings.max),
    formats: settings.requireFormat
      ? [settings.requireFormat as ImageMime]
      : signature
        ? [selectedMime]
        : undefined,
  };
  function defaultCrop() {
    if (!oriented) return fullCrop;
    const ratio =
      passport || settings.cropRatio === "custom"
        ? (out.width ?? 0) / (out.height ?? 0)
        : ratios[settings.cropRatio];
    return Number.isFinite(ratio) && ratio > 0
      ? cropToAspect(ratio, oriented.width, oriented.height)
      : fullCrop;
  }
  useEffect(() => {
    if (!oriented || !editableCrop) return;
    setCrop(defaultCrop());
  }, [
    source,
    settings.rotation,
    settings.cropRatio,
    passport ? out.width : cropper ? settings.width : 0,
    passport ? out.height : cropper ? settings.height : 0,
  ]);

  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setCancelled(false);
    if (batch) setRun(0);
    setSettings((previous) => {
      const next = { ...previous, [key]: value };
      if (resize && source && next.lock && next.resizeBy === "px") {
        if (key === "width" || key === "lock")
          next.height = next.width
            ? String(Math.round((+next.width * source.height) / source.width))
            : "";
        if (key === "height")
          next.width = next.height
            ? String(Math.round((+next.height * source.width) / source.height))
            : "";
      }
      return next;
    });
  }
  function setSelection(value: File[]) {
    setCancelled(false);
    setFiles(value);
    setSheetMessage("");
    if (batch) setRun(0);
  }
  function reset() {
    job.current?.abort();
    setSelection([]);
    setSettings(init());
    setResult(undefined);
    setCrop(fullCrop);
    setCompare(50);
  }
  useDiscardFiles(reset);
  function stamp(): ImageOptions["stamp"] {
    const text = [settings.text, settings.name, settings.date]
      .filter(Boolean)
      .join(" · ");
    return {
      text,
      size: settings.font,
      color: settings.color,
      opacity: settings.opacity / 100,
      horizontal: settings.horizontal as "left" | "center" | "right",
      vertical: settings.vertical as "top" | "middle" | "bottom",
    };
  }
  useEffect(() => {
    setResult(undefined);
    setError("");
    setSheetMessage("");
    if (
      !source ||
      checker ||
      cancelled ||
      !files.length ||
      sourceFile?.name !== cleanName(files[0].name) ||
      loading ||
      (batch && run === 0)
    ) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    job.current = controller;
    setBusy(true);
    const timer = setTimeout(
      async () => {
        try {
          if (signature && ruleError(rule)) throw Error(ruleError(rule));
          if (
            passport &&
            (!Number.isFinite(+settings.ppi) ||
              +settings.ppi < 36 ||
              +settings.ppi > 1200)
          )
            throw Error("Enter a resolution from 36 to 1,200 PPI.");
          const target =
            compressor && settings.target !== ""
              ? +settings.target *
                (settings.sizeUnit === "MB" ? 1024 ** 2 : 1024)
              : signature && !Number.isNaN(+settings.max) && settings.max !== ""
                ? +settings.max * 1024
                : undefined;
          if (target !== undefined && (!Number.isFinite(target) || target < 1))
            throw Error("Enter a target of at least one byte.");
          const options: ImageOptions = {
            ...out,
            fit:
              (resize || passport) && settings.fit !== "fit"
                ? (settings.fit as ImageOptions["fit"])
                : "stretch",
            crop: editableCrop ? crop : undefined,
            rotation: editableCrop ? settings.rotation : 0,
            zoom: editableCrop ? settings.zoom / 100 : 1,
            panX: passport ? settings.panX : 0,
            panY: passport ? settings.panY : 0,
            background:
              settings.fill || selectedMime === "image/jpeg"
                ? settings.background
                : undefined,
            trim: signature && settings.trim,
            grayscale: signature && settings.grayscale,
            brightness: signature ? settings.brightness : undefined,
            contrast: signature ? settings.contrast : undefined,
            stamp: passport || watermark ? stamp() : undefined,
          };
          const outputs: Output[] = [];
          let width = 0,
            height = 0,
            met = true,
            bytes = 0;
          for (const [index, file] of (batch ? files : [files[0]]).entries()) {
            signal.throwIfAborted();
            const image = index === 0 ? source : await openImage(file);
            let canvas: HTMLCanvasElement | undefined;
            try {
              canvas = drawImage(image, options, selectedMime);
              const generated = await compress(
                canvas,
                selectedMime,
                settings.quality / 100,
                target,
                compressor && settings.reduce,
                signal,
              );
              bytes += generated.blob.size;
              if (bytes > limits.batchBytes)
                throw Error(
                  "Output exceeds the 150 MB batch limit. Convert fewer files at a time.",
                );
              if (index === 0) {
                width = generated.width;
                height = generated.height;
                met = generated.met;
              }
              outputs.push({
                blob: generated.blob,
                name:
                  stem(file.name) +
                  "-" +
                  (batch
                    ? "converted"
                    : signature
                      ? "signature"
                      : passport
                        ? "photo"
                        : "applykit") +
                  "." +
                  extension(selectedMime),
              });
            } finally {
              if (canvas) release(canvas);
              if (index > 0) image.bitmap.close();
            }
          }
          if (!signal.aborted)
            setResult({ outputs, width, height, mime: selectedMime, met });
        } catch (e) {
          if (!signal.aborted) setError(errorMessage(e));
        } finally {
          if (!signal.aborted) setBusy(false);
        }
      },
      batch ? 0 : 260,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [source, sourceFile, files, settings, crop, run, cancelled, loading]);

  const num = (
    key:
      | "width"
      | "height"
      | "scale"
      | "target"
      | "min"
      | "max"
      | "ppi"
      | "copies",
    label: string,
    min = 1,
    max?: number,
    step: number | string = 1,
  ) => (
    <NumberField
      label={label}
      value={settings[key]}
      onChange={(v) => change(key, v)}
      min={min}
      max={max}
      step={step}
    />
  );
  const range = (
    key:
      | "quality"
      | "zoom"
      | "panX"
      | "panY"
      | "brightness"
      | "contrast"
      | "font"
      | "opacity",
    label: string,
    min: number,
    max: number,
    unit = "%",
  ) => (
    <Field label={label + " · " + settings[key] + unit}>
      <input
        type="range"
        min={min}
        max={max}
        value={settings[key]}
        onChange={(e) => change(key, +e.target.value)}
      />
    </Field>
  );
  const text = (key: "text" | "name" | "date", label: string) => (
    <Field label={label}>
      <input
        type={key === "date" ? "date" : "text"}
        maxLength={90}
        value={settings[key]}
        onChange={(e) => change(key, e.target.value)}
      />
    </Field>
  );
  const formatOptions = passport
    ? { "image/jpeg": "JPG", "image/png": "PNG" }
    : imageFormats;
  const original =
    source && primary
      ? {
          width: source.width,
          height: source.height,
          mime: source.mime,
          size: primary.size,
        }
      : undefined;
  const output = result
    ? {
        width: result.width,
        height: result.height,
        mime: result.mime,
        size: result.outputs[0].blob.size,
      }
    : undefined;
  const actualRuleError = checker || signature ? ruleError(rule) : "";
  const picture = editableCrop && settings.rotation ? rotatedUrl : originalUrl;
  return (
    <div className="workspace" inert={!ready} aria-busy={!ready}>
      <section className="panel" aria-label="Input and settings">
        <div className="panel-head">
          <h2>{batch ? "Select images" : "Select an image"}</h2>
          {files.length > 0 && (
            <button className="button secondary" type="button" onClick={reset}>
              Start over
            </button>
          )}
        </div>
        <FilePicker
          files={files}
          onChange={setSelection}
          multiple={batch}
          paste={!embedded}
          reorder={batch}
        />
        <Notice text={decodeError} error />
        {compressor && (
          <>
            <div className="fields">
              {num(
                "target",
                "Maximum file size",
                0,
                "MB" === settings.sizeUnit ? 500 : 512000,
                "any",
              )}
              <SelectField
                label="Size unit"
                options={{ KB: "KB", MB: "MB" }}
                value={settings.sizeUnit}
                onChange={(v) => change("sizeUnit", v)}
              />
            </div>
            <div className="pills" aria-label="Size presets">
              {[10, 20, 30, 50, 100, 200, 500].map((n) => (
                <button
                  type="button"
                  className="pill-button"
                  key={n}
                  aria-pressed={
                    settings.sizeUnit === "KB" && +settings.target === n
                  }
                  onClick={() => {
                    change("sizeUnit", "KB");
                    change("target", String(n));
                  }}
                >
                  {n} KB
                </button>
              ))}
            </div>
          </>
        )}
        {resize && (
          <div className="fields">
            <SelectField
              label="Resize by"
              options={{ px: "Pixels", percent: "Percentage" }}
              value={settings.resizeBy}
              onChange={(v) => change("resizeBy", v)}
            />
            <SelectField
              label="Image fit"
              options={{
                fit: "Fit within bounds",
                contain: "Contain",
                stretch: "Stretch",
                crop: "Crop to fill",
              }}
              value={settings.fit}
              onChange={(v) => change("fit", v)}
            />
            {settings.resizeBy === "px" ? (
              <>
                {num("width", "Width (px)", 1, 8192)}
                {num("height", "Height (px)", 1, 8192)}
                <div className="full">
                  <Toggle
                    checked={settings.lock}
                    onChange={(v) => change("lock", v)}
                  >
                    Lock aspect ratio
                  </Toggle>
                </div>
              </>
            ) : (
              num("scale", "Scale (%)", 1, 1000, "any")
            )}
          </div>
        )}
        {signature && (
          <div className="fields">
            {num("width", "Width (px)", 1, 8192)}
            {num("height", "Height (px)", 1, 8192)}
            {num("min", "Minimum size (KB)", 0, undefined, "any")}
            {num("max", "Target / maximum size (KB)", 0, undefined, "any")}
          </div>
        )}
        {passport && (
          <div className="fields">
            <SelectField
              label="Measurement unit"
              options={{
                px: "Pixels",
                mm: "Millimeters",
                cm: "Centimeters",
                in: "Inches",
              }}
              value={settings.unit}
              onChange={(v) => {
                const ppi = +settings.ppi || 300;
                const toUnit = (mm: number) =>
                  v === "px"
                    ? Math.round((mm / 25.4) * ppi)
                    : Number(
                        (
                          mm / (v === "cm" ? 10 : v === "in" ? 25.4 : 1)
                        ).toFixed(4),
                      );
                setCancelled(false);
                setSettings((s) => ({
                  ...s,
                  unit: v,
                  width: String(toUnit(toMM(+s.width, s.unit as Unit, ppi))),
                  height: String(toUnit(toMM(+s.height, s.unit as Unit, ppi))),
                }));
              }}
            />
            {num("ppi", "Print resolution (PPI)", 36, 1200)}
            {num("width", "Photo width", 0, undefined, "any")}
            {num("height", "Photo height", 0, undefined, "any")}
            {range("panX", "Horizontal position", -100, 100)}
            {range("panY", "Vertical position", -100, 100)}
          </div>
        )}
        {cropper && (
          <div className="fields">
            <SelectField
              label="Crop aspect ratio"
              options={{
                free: "Freeform",
                ...Object.fromEntries(
                  Object.keys(ratios).map((key) => [key, key]),
                ),
                custom: "Exact output dimensions",
              }}
              value={settings.cropRatio}
              onChange={(v) => change("cropRatio", v)}
            />
            {settings.cropRatio === "custom" && (
              <>
                {num("width", "Output width (px)", 1, 8192)}
                {num("height", "Output height (px)", 1, 8192)}
              </>
            )}
          </div>
        )}
        {editableCrop && source && (
          <>
            <div className="actions">
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  change("rotation", (settings.rotation + 90) % 360)
                }
              >
                <RotateCw size={16} /> Rotate 90°
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setCrop(defaultCrop());
                  change("zoom", 100);
                  change("panX", 0);
                  change("panY", 0);
                }}
              >
                Reset crop
              </button>
            </div>
            {picture && (
              <CropEditor
                url={picture}
                crop={crop}
                onChange={(value) => {
                  setCancelled(false);
                  setCrop(value);
                }}
                fixed={passport || settings.cropRatio !== "free"}
              />
            )}
            <div className="fields">{range("zoom", "Zoom", 100, 300)}</div>
            {cropper && settings.cropRatio === "free" && (
              <details className="tool-details">
                <summary>Crop coordinates</summary>
                <div className="fields">
                  {(["x", "y", "w", "h"] as const).map((key, index) => (
                    <NumberField
                      key={key}
                      label={
                        ["Left (%)", "Top (%)", "Width (%)", "Height (%)"][
                          index
                        ]
                      }
                      min={0}
                      max={100}
                      value={Number(crop[key].toFixed(2))}
                      step="any"
                      onChange={(v) => {
                        setCancelled(false);
                        setCrop((previous) => ({
                          ...previous,
                          [key]: clamp(
                            +v,
                            key === "w" || key === "h" ? 1 : 0,
                            key === "x"
                              ? 100 - previous.w
                              : key === "y"
                                ? 100 - previous.h
                                : key === "w"
                                  ? 100 - previous.x
                                  : 100 - previous.y,
                          ),
                        }));
                      }}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
        {checker && (
          <>
            <h3>Check application requirements</h3>
            <div className="fields">
              {num("width", "Required width (px)", 1, 8192)}
              {num("height", "Required height (px)", 1, 8192)}
              {num("min", "Minimum size (KB)", 0, undefined, "any")}
              {num("max", "Maximum size (KB)", 0, undefined, "any")}
              <SelectField
                label="Required format"
                options={{ "": "Any supported format", ...imageFormats }}
                value={settings.requireFormat}
                onChange={(v) => change("requireFormat", v)}
              />
            </div>
          </>
        )}
        {(passport || watermark) && (
          <details className="tool-details" open={watermark}>
            <summary>
              <SlidersHorizontal size={16} />{" "}
              {passport ? "Name and date stamp" : "Watermark settings"}
            </summary>
            <div className="fields">
              {watermark && text("text", "Watermark text")}
              {text("name", "Name")}
              {text("date", "Date")}
              {range("font", "Font size", 8, 160, " px")}
              <Field label="Text color">
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) => change("color", e.target.value)}
                />
              </Field>
              {range("opacity", "Opacity", 0, 100)}
              <SelectField
                label="Alignment"
                options={{ left: "Left", center: "Center", right: "Right" }}
                value={settings.horizontal}
                onChange={(v) => change("horizontal", v)}
              />
              <SelectField
                label="Position"
                options={{ top: "Top", middle: "Middle", bottom: "Bottom" }}
                value={settings.vertical}
                onChange={(v) => change("vertical", v)}
              />
            </div>
          </details>
        )}
        {!checker && (
          <>
            <div className="fields">
              <SelectField
                label="Output format"
                options={formatOptions}
                value={settings.mime}
                onChange={(v) => change("mime", v)}
              />
              {selectedMime !== "image/png" &&
                range("quality", "Quality", 2, 100)}
            </div>
            <details className="tool-details">
              <summary>
                <SlidersHorizontal size={16} /> Advanced settings
              </summary>
              <div className="fields">
                {compressor && (
                  <div className="full">
                    <Toggle
                      checked={settings.reduce}
                      onChange={(v) => change("reduce", v)}
                    >
                      Allow smaller dimensions to meet the target
                    </Toggle>
                  </div>
                )}
                {signature && (
                  <>
                    <Toggle
                      checked={settings.trim}
                      onChange={(v) => change("trim", v)}
                    >
                      Trim whitespace
                    </Toggle>
                    <Toggle
                      checked={settings.grayscale}
                      onChange={(v) => change("grayscale", v)}
                    >
                      Grayscale
                    </Toggle>
                    {range("brightness", "Brightness", 25, 200)}
                    {range("contrast", "Contrast", 25, 200)}
                  </>
                )}
                {selectedMime !== "image/jpeg" && (
                  <Toggle
                    checked={settings.fill}
                    onChange={(v) => change("fill", v)}
                  >
                    Fill transparent areas
                  </Toggle>
                )}
                <Field label="Background color">
                  <input
                    type="color"
                    value={settings.background}
                    onChange={(e) => change("background", e.target.value)}
                  />
                </Field>
              </div>
              {selectedMime === "image/png" && (
                <p className="hint">
                  PNG is lossless. Lower quality values cannot reduce PNG size.
                </p>
              )}
            </details>
          </>
        )}
        {!checker && (
          <div className="actions">
            {batch && (
              <button
                type="button"
                className="button primary"
                disabled={!source || busy}
                onClick={() => {
                  setCancelled(false);
                  setRun((n) => n + 1);
                }}
              >
                Convert images
              </button>
            )}
            {busy && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  job.current?.abort();
                  setCancelled(true);
                  setBusy(false);
                }}
              >
                Cancel
              </button>
            )}
            {cancelled && !batch && (
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setCancelled(false);
                  setRun((n) => n + 1);
                }}
              >
                Update preview
              </button>
            )}
          </div>
        )}
      </section>
      <section className="panel" aria-label="Preview and results">
        <div className="panel-head">
          <h2>{checker ? "Image information" : "Preview and download"}</h2>
        </div>
        {result && (
          <div className="preview-result">
            <Results
              outputs={result.outputs}
              zipName={batch || result.mime === "image/webp" ? "applykit-images.zip" : undefined}
            />
          </div>
        )}
        {loading && <Notice text="Reading your image…" />}
        {busy && (
          <Notice text={batch ? "Converting images…" : "Updating preview…"} />
        )}
        {!originalUrl ? (
          <div className="empty-preview">
            <ImagePlus size={33} aria-hidden="true" />
            <strong>Your preview appears here</strong>
            <span className="hint">Choose an image to get started.</span>
          </div>
        ) : compressor && resultUrl ? (
          <>
            <div className="comparison">
              <img src={originalUrl} alt="Original image" />
              <img
                src={resultUrl}
                alt="Compressed image"
                style={{ clipPath: "inset(0 0 0 " + compare + "%)" }}
              />
              <span className="compare-line" style={{ left: compare + "%" }} />
            </div>
            <Field label="Compare original and compressed image">
              <input
                type="range"
                min="0"
                max="100"
                value={compare}
                onChange={(e) => setCompare(+e.target.value)}
              />
            </Field>
            <div className="preview-pair">
              <figure>
                <div className="preview-frame">
                  <img src={originalUrl} alt="Original preview" />
                </div>
                <figcaption>Original</figcaption>
              </figure>
              <figure>
                <div className="preview-frame">
                  <img src={resultUrl} alt="Compressed preview" />
                </div>
                <figcaption>Compressed</figcaption>
              </figure>
            </div>
          </>
        ) : (
          <div className="preview-frame">
            <img
              src={resultUrl || originalUrl}
              alt={resultUrl ? "Processed image" : "Original image"}
            />
          </div>
        )}
        {original && (
          <Stats
            items={
              checker
                ? {
                    "File name": cleanName(primary.name),
                    Dimensions:
                      original.width + " × " + original.height + " px",
                    "Aspect ratio": aspect(original.width, original.height),
                    Megapixels: (
                      (original.width * original.height) /
                      1e6
                    ).toFixed(2),
                    "File size": sizeLabel(original.size),
                    Format: imageFormats[original.mime],
                  }
                : {
                    "Original dimensions":
                      original.width + " × " + original.height + " px",
                    "Original size": sizeLabel(original.size),
                    ...(out.width && out.height && !output
                      ? {
                          "Planned dimensions":
                            out.width + " × " + out.height + " px",
                        }
                      : {}),
                    ...(output
                      ? {
                          "Output dimensions":
                            output.width + " × " + output.height + " px",
                          "Output size": sizeLabel(output.size),
                          "Output format": imageFormats[output.mime],
                          ...(compressor
                            ? {
                                "Size reduction":
                                  Number(
                                    (
                                      (1 - output.size / original.size) *
                                      100
                                    ).toFixed(1),
                                  ) + "%",
                              }
                            : {}),
                        }
                      : {}),
                  }
            }
          />
        )}
        <Notice text={error || actualRuleError} error />
        {result && !result.met && (
          <Notice text="The smallest result is still over your target. Try a different format, or permit smaller dimensions if your application allows it." />
        )}
        {(checker || signature) && !actualRuleError && (
          <>
            <h3>Validation checklist</h3>
            <CheckList
              items={imageChecks(
                signature ? "Signature" : "Image",
                rule,
                checker ? original : output,
              )}
            />
          </>
        )}
        {result && onOutput && (
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => onOutput(result.outputs)}
            >
              Add to supporting files
            </button>
          </div>
        )}
        {passport && (
          <>
            <h3>Printable A4 sheet</h3>
            <p className="hint">
              Print at actual size (100%). PPI determines image pixels and sheet
              placement. Individual image metadata depends on the browser
              encoder.
            </p>
            <div className="fields">
              {num("copies", "Number of copies", 1, 100)}
            </div>
            <div className="actions">
              <button
                className="button secondary"
                type="button"
                disabled={!result || sheetBusy}
                onClick={async () => {
                  if (!result) return;
                  setSheetBusy(true);
                  setSheetMessage("");
                  try {
                    const { photoSheet } = await import("../lib/image/sheet");
                    const blob = await photoSheet(
                      result.outputs[0].blob,
                      toMM(
                        +settings.width,
                        settings.unit as Unit,
                        +settings.ppi,
                      ),
                      toMM(
                        +settings.height,
                        settings.unit as Unit,
                        +settings.ppi,
                      ),
                      +settings.copies,
                    );
                    download({ blob, name: "applykit-a4-photos.pdf" });
                    setSheetMessage("A4 download started.");
                  } catch (e) {
                    setSheetMessage(errorMessage(e));
                  } finally {
                    setSheetBusy(false);
                  }
                }}
              >
                <Download size={17} />
                {sheetBusy ? "Preparing sheet…" : "Download A4 PDF"}
              </button>
            </div>
            <Notice text={sheetMessage} />
          </>
        )}
      </section>
    </div>
  );
}
