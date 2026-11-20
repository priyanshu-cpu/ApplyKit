import { useEffect, useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import {
  examPresets,
  type Rules,
  type SupportingRule,
} from "../config/exam-presets";
import {
  cleanName,
  errorMessage,
  extension,
  imageFormats,
  sizeLabel,
  validateFile,
  type FileKind,
  type ImageMime,
  type Output,
} from "../lib/files";
import { cropToAspect, fullCrop, type Crop } from "../lib/image/geometry";
import {
  compress,
  drawImage,
  openImage,
  release,
  type ImageSource,
} from "../lib/image/process";
import {
  checkResult,
  imageChecks,
  ruleError,
  type ImageFacts,
  type ImageRule,
} from "../lib/validation";
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
  type Check,
} from "./shared";
import CropEditor from "./CropEditor";
import PDFTool from "./PDFTool";
import ImageTool from "./ImageTool";

const labels = [
  "Examination",
  "Requirements",
  "Photograph",
  "Signature",
  "Supporting documents",
  "Validation",
  "Downloads",
];
const fileTypes: Record<FileKind, string> = {
  ...imageFormats,
  "application/pdf": "PDF",
};
const defaultSupport: SupportingRule = { name: "Supporting files" };
const initialRules = (): Rules => ({
  photo: {},
  signature: {},
  supporting: [{ ...defaultSupport }],
});
const shortRule = (rule: ImageRule) =>
  [
    rule.width || rule.height
      ? (rule.width ?? "Any") +
        " × " +
        (rule.height ?? "Any") +
        " px" +
        (rule.preferredDimensions ? " (preferred)" : "")
      : "",
    rule.minKB ? "at least " + rule.minKB + " KB" : "",
    rule.maxKB ? "at most " + rule.maxKB + " KB" : "",
    (rule.formats ?? []).map((m) => imageFormats[m]).join(" or "),
  ]
    .filter(Boolean)
    .join(" · ") || "No rules entered";
const emptyNumber = (value: string) =>
  value === "" ? undefined : Number(value);
const safeSource = (value: string) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
type Prepared = { output: Output; facts: ImageFacts };
type SupportingStatus = {
  mime?: FileKind;
  pages?: number;
  isA4?: boolean;
  error?: string;
};

function RuleFields({
  title,
  rule,
  onChange,
}: {
  title: string;
  rule: ImageRule;
  onChange: (rule: ImageRule) => void;
}) {
  return (
    <fieldset className="rule-fields">
      <legend>{title}</legend>
      <div className="fields">
        <NumberField
          label={title + " width (px)"}
          min={1}
          max={8192}
          value={rule.width ?? ""}
          onChange={(v) => onChange({ ...rule, width: emptyNumber(v) })}
        />
        <NumberField
          label={title + " height (px)"}
          min={1}
          max={8192}
          value={rule.height ?? ""}
          onChange={(v) => onChange({ ...rule, height: emptyNumber(v) })}
        />
        <NumberField
          label={title + " minimum size (KB)"}
          step="any"
          value={rule.minKB ?? ""}
          onChange={(v) => onChange({ ...rule, minKB: emptyNumber(v) })}
        />
        <NumberField
          label={title + " maximum size (KB)"}
          step="any"
          value={rule.maxKB ?? ""}
          onChange={(v) => onChange({ ...rule, maxKB: emptyNumber(v) })}
        />
        <div className="full">
          <strong className="hint">
            Allowed {title.toLowerCase()} formats (leave all clear for any)
          </strong>
          <div className="actions mt-0">
            {Object.entries(imageFormats).map(([key, name]) => (
              <Toggle
                key={key}
                checked={rule.formats?.includes(key as ImageMime) ?? false}
                onChange={(enabled) => {
                  const others = (rule.formats ?? []).filter(
                    (value) => value !== key,
                  );
                  onChange({
                    ...rule,
                    formats: enabled ? [...others, key as ImageMime] : others,
                  });
                }}
              >
                {name}
              </Toggle>
            ))}
          </div>
        </div>
      </div>
      <Notice text={ruleError(rule)} error />
    </fieldset>
  );
}
function ExamImage({
  label,
  rule,
  file,
  onFile,
  prepared,
  onPrepare,
  validator = false,
  onFacts,
}: {
  label: string;
  rule: ImageRule;
  file?: File;
  onFile: (file?: File) => void;
  prepared?: Prepared;
  onPrepare?: (prepared?: Prepared) => void;
  validator?: boolean;
  onFacts?: (facts?: ImageFacts) => void;
}) {
  const [image, setImage] = useState<ImageSource>();
  const [blob, setBlob] = useState<Blob>();
  const [crop, setCrop] = useState<Crop>(fullCrop);
  const [quality, setQuality] = useState(94);
  const [trim, setTrim] = useState(label === "Signature");
  const [mime, setMime] = useState<ImageMime>(
    rule.formats?.[0] ?? "image/jpeg",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const token = useRef<AbortController | null>(null);
  const url = useObjectUrl(blob);
  const resultUrl = useObjectUrl(prepared?.output.blob);
  useEffect(() => {
    setMime(rule.formats?.[0] ?? "image/jpeg");
  }, [rule.formats]);
  useEffect(() => {
    let current = true,
      source: ImageSource | undefined;
    setImage(undefined);
    setBlob(undefined);
    setError("");
    setCrop(fullCrop);
    if (!file) return;
    openImage(file)
      .then((value) => {
        source = value;
        if (!current) {
          value.bitmap.close();
          return;
        }
        if (validator) {
          onFacts?.({
            width: value.width,
            height: value.height,
            size: file.size,
            mime: value.mime,
          });
          value.bitmap.close();
          source = undefined;
        } else {
          setImage(value);
          setBlob(new Blob([file], { type: value.mime }));
        }
      })
      .catch((e) => {
        if (current) setError(errorMessage(e));
      });
    return () => {
      current = false;
      source?.bitmap.close();
    };
  }, [file, validator]);
  useEffect(() => {
    if (image && rule.width && rule.height)
      setCrop(
        cropToAspect(rule.width / rule.height, image.width, image.height),
      );
  }, [image, rule.width, rule.height]);
  useEffect(() => () => token.current?.abort(), []);
  async function generate() {
    if (!image || busy) return;
    const controller = new AbortController();
    token.current = controller;
    setBusy(true);
    setError("");
    let canvas: HTMLCanvasElement | undefined;
    try {
      const problem = ruleError(rule);
      if (problem) throw Error(problem);
      const w = (image.width * crop.w) / 100,
        h = (image.height * crop.h) / 100;
      canvas = drawImage(
        image,
        {
          width:
            rule.width ??
            (rule.height
              ? Math.max(1, Math.round((rule.height * w) / h))
              : undefined),
          height:
            rule.height ??
            (rule.width
              ? Math.max(1, Math.round((rule.width * h) / w))
              : undefined),
          crop,
          fit: trim ? "contain" : "stretch",
          background: mime === "image/jpeg" ? "#ffffff" : undefined,
          trim,
        },
        mime,
      );
      const { blob, width, height } = await compress(
        canvas,
        mime,
        quality / 100,
        rule.maxKB ? rule.maxKB * 1024 : undefined,
        false,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      onPrepare?.({
        output: {
          name: "application-" + label.toLowerCase() + "." + extension(mime),
          blob,
        },
        facts: { width, height, size: blob.size, mime },
      });
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e));
    } finally {
      if (canvas) release(canvas);
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>{validator ? label : "Prepare " + label.toLowerCase()}</h2>
      <p className="hint mb-3">{shortRule(rule)}</p>
      <FilePicker
        files={file ? [file] : []}
        onChange={(files) => {
          onFacts?.();
          onPrepare?.();
          onFile(files[0]);
        }}
        paste={!validator}
        disabled={busy}
      />
      <Notice text={error} error />
      {!validator && (
        <>
          {url && (
            <CropEditor
              url={url}
              crop={crop}
              fixed={!!(rule.width && rule.height)}
              onChange={(value) => {
                setCrop(value);
              }}
            />
          )}
          <div className="fields">
            <SelectField
              label="Output format"
              value={mime}
              onChange={(value) => setMime(value as ImageMime)}
              options={
                rule.formats?.length
                  ? Object.fromEntries(
                      rule.formats.map((m) => [m, imageFormats[m]]),
                    )
                  : imageFormats
              }
            />
            {mime !== "image/png" && (
              <Field label={"Quality · " + quality + "%"}>
                <input
                  type="range"
                  min="2"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(+e.target.value)}
                />
              </Field>
            )}
            {label === "Signature" && (
              <Toggle checked={trim} onChange={setTrim}>
                Trim whitespace
              </Toggle>
            )}
          </div>
          <div className="actions">
            <button
              className="button primary"
              type="button"
              disabled={busy || !image}
              onClick={generate}
            >
              {busy ? "Preparing…" : "Prepare " + label.toLowerCase()}
            </button>
          </div>
          {prepared && (
            <div className="mt-3">
              {resultUrl && (
                <div className="preview-frame">
                  <img
                    src={resultUrl}
                    alt={"Prepared " + label.toLowerCase()}
                  />
                </div>
              )}
              <Stats
                items={{
                  Dimensions:
                    prepared.facts.width +
                    " × " +
                    prepared.facts.height +
                    " px",
                  Size: sizeLabel(prepared.facts.size),
                  Format: imageFormats[prepared.facts.mime],
                }}
              />
              <CheckList items={imageChecks(label, rule, prepared.facts)} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function supportChecks(
  rule: SupportingRule,
  files: File[],
  facts: SupportingStatus[] | undefined,
): Check[] {
  if (rule.manual)
    return [{ label: rule.name, state: "pending", detail: rule.detail }];
  if (!files.length)
    return [
      {
        label: rule.name,
        state: "pending",
        detail: rule.conditional
          ? "Add only if applicable."
          : rule.minFiles
            ? "Required file is missing."
            : "No supporting file selected.",
      },
    ];
  if (rule.minFiles && files.length < rule.minFiles)
    return [
      {
        label: rule.name,
        state: "failed",
        detail: "Add at least " + rule.minFiles + " file(s).",
      },
    ];
  return files.map((file, i) => {
    const fact = facts?.[i];
    const label = rule.name + " · " + cleanName(file.name);
    const configured = !!(
      rule.formats?.length ||
      rule.minKB ||
      rule.maxKB ||
      rule.maxPages ||
      rule.paper
    );
    if (!fact || fact.error || !fact.mime)
      return {
        label,
        state: "pending",
        detail: fact?.error ?? "Checking file…",
      };
    const pass =
      (!rule.formats?.length || rule.formats.includes(fact.mime)) &&
      (!rule.minKB || file.size >= rule.minKB * 1024) &&
      (!rule.maxKB || file.size <= rule.maxKB * 1024) &&
      (!rule.maxPages ||
        (fact.pages !== undefined && fact.pages <= rule.maxPages)) &&
      (!rule.paper || fact.isA4 === true);
    return checkResult(
      label,
      configured,
      true,
      pass,
      fileTypes[fact.mime] +
        " · " +
        sizeLabel(file.size) +
        (fact.pages ? " · " + fact.pages + " page(s)" : "") +
        (rule.paper ? (fact.isA4 ? " · A4" : " · A4 required") : ""),
    );
  });
}
function SupportingInputs({
  rules,
  files,
  change,
  configured,
}: {
  rules: SupportingRule[];
  files: Record<number, File[]>;
  change: (i: number, files: File[]) => void;
  configured: boolean;
}) {
  return (
    <div className="support-inputs">
      {rules.map((rule, i) => (
        <section className="panel" key={i}>
          <h2>{rule.name}</h2>
          {rule.conditional && (
            <p className="hint">If applicable to your application.</p>
          )}
          <p className="hint mb-3">
            {[
              rule.detail,
              rule.formats?.map((m) => fileTypes[m]).join(" or "),
              rule.paper ? "A4" : undefined,
              rule.minKB ? "At least " + rule.minKB + " KB" : undefined,
              rule.maxKB ? "At most " + rule.maxKB + " KB" : undefined,
              rule.maxPages ? "Up to " + rule.maxPages + " pages" : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {!rule.manual && (
            <FilePicker
              kind="both"
              files={files[i] ?? []}
              onChange={(next) => change(i, next)}
              multiple={!configured || !rule.minFiles || rule.minFiles > 1}
            />
          )}
        </section>
      ))}
    </div>
  );
}

export default function ExamTool({
  validator = false,
}: {
  validator?: boolean;
}) {
  const ready = useReady();
  const [step, setStep] = useState(0),
    [visited, setVisited] = useState(0);
  const [presetId, setPresetId] = useState("");
  const [rules, setRules] = useState<Rules>(initialRules);
  const [sourceInput, setSourceInput] = useState("");
  const [photo, setPhoto] = useState<File>(),
    [signature, setSignature] = useState<File>();
  const [photoFacts, setPhotoFacts] = useState<ImageFacts>(),
    [signatureFacts, setSignatureFacts] = useState<ImageFacts>();
  const [preparedPhoto, setPreparedPhoto] = useState<Prepared>(),
    [preparedSignature, setPreparedSignature] = useState<Prepared>();
  const [supporting, setSupporting] = useState<Record<number, File[]>>({});
  const [supportFacts, setSupportFacts] = useState<
    Record<number, SupportingStatus[]>
  >({});
  const [pdfTool, setPdfTool] = useState("");
  const [destination, setDestination] = useState("0");
  const [pdfError, setPdfError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useDiscardFiles(() => {
    moved.current = false;
    setStep(0);
    setVisited(0);
    setPhoto(undefined);
    setSignature(undefined);
    setPhotoFacts(undefined);
    setSignatureFacts(undefined);
    setPreparedPhoto(undefined);
    setPreparedSignature(undefined);
    setSupporting({});
    setSupportFacts({});
  });
  const preset = examPresets.find((p) => p.id === presetId);
  const official = preset?.source || safeSource(sourceInput);
  const custom = rules.supporting[0];
  const supportError =
    !preset &&
    custom.maxKB !== undefined &&
    (!Number.isFinite(custom.maxKB) || custom.maxKB <= 0)
      ? "Enter a positive supporting file-size limit."
      : !preset &&
          custom.maxPages !== undefined &&
          (!Number.isInteger(custom.maxPages) ||
            custom.maxPages < 1 ||
            custom.maxPages > 500)
        ? "Enter a maximum from 1 to 500 PDF pages."
        : !preset &&
            (custom.maxPages || custom.paper) &&
            custom.formats?.[0] &&
            custom.formats[0] !== "application/pdf"
          ? "PDF page rules require PDF or any supported format."
          : "";
  const rError =
    ruleError(rules.photo) || ruleError(rules.signature) || supportError;
  const destinations = (kind: string) =>
    Object.fromEntries(
      rules.supporting.flatMap((rule, i) => {
        const compatible =
          kind === "image-compressor"
            ? rule.formats?.some((mime) => mime !== "application/pdf")
            : rule.formats?.includes("application/pdf");
        return !rule.manual && (!rule.formats?.length || compatible)
          ? [[String(i), rule.name]]
          : [];
      }),
    );
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);
  useEffect(() => {
    const token = new AbortController();
    setSupportFacts({});
    async function verify() {
      for (const [key, files] of Object.entries(supporting)) {
        const found: SupportingStatus[] = [];
        for (const file of files) {
          if (token.signal.aborted) return;
          try {
            const mime = await validateFile(file, "both");
            if (mime === "application/pdf") {
              const { openPDF } = await import("../lib/pdf/render");
              const doc = await openPDF(file, token.signal);
              try {
                let isA4 = true;
                if (rules.supporting[+key]?.paper)
                  for (let n = 1; n <= doc.numPages; n++) {
                    token.signal.throwIfAborted();
                    const page = await doc.getPage(n);
                    const { width, height } = page.getViewport({ scale: 1 });
                    const shorter = Math.min(width, height),
                      longer = Math.max(width, height);
                    if (
                      Math.abs(shorter - 595.276) > 3 ||
                      Math.abs(longer - 841.89) > 3
                    ) {
                      isA4 = false;
                      break;
                    }
                  }
                found.push({ mime, pages: doc.numPages, isA4 });
              } finally {
                void doc.loadingTask.destroy().catch(() => {});
              }
            } else {
              const decoded = await openImage(file);
              decoded.bitmap.close();
              found.push({ mime });
            }
          } catch (e) {
            found.push({ error: errorMessage(e) });
          }
        }
        if (!token.signal.aborted)
          setSupportFacts((previous) => ({ ...previous, [+key]: found }));
      }
    }
    void verify();
    return () => token.abort();
  }, [supporting, rules.supporting]);
  const updateSupport = (i: number, files: File[]) => {
    setSupportFacts((previous) => ({ ...previous, [i]: [] }));
    setSupporting((previous) => ({ ...previous, [i]: files }));
  };
  const changePreset = (id: string) => {
    const data = examPresets.find((p) => p.id === id);
    setPresetId(id);
    setRules(
      data
        ? {
            photo: data.photo,
            signature: data.signature,
            supporting: data.supporting,
          }
        : initialRules(),
    );
    setPreparedPhoto(undefined);
    setPreparedSignature(undefined);
    setSupporting({});
    setSupportFacts({});
    setPdfTool("");
    setDestination("0");
  };
  const move = (index: number) => {
    moved.current = true;
    setStep(index);
    setVisited((previous) => Math.max(previous, index));
  };
  const checklist = [
    ...imageChecks(
      "Photograph",
      rules.photo,
      validator ? photoFacts : preparedPhoto?.facts,
    ),
    ...imageChecks(
      "Signature",
      rules.signature,
      validator ? signatureFacts : preparedSignature?.facts,
    ),
    ...rules.supporting.flatMap((rule, i) =>
      supportChecks(rule, supporting[i] ?? [], supportFacts[i]),
    ),
  ];
  const outputs: Output[] = [
    ...(preparedPhoto ? [preparedPhoto.output] : []),
    ...(preparedSignature ? [preparedSignature.output] : []),
    ...Object.values(supporting)
      .flat()
      .map((file) => ({ blob: file, name: cleanName(file.name) })),
  ];
  const editRules = !preset && (
    <div className="rule-grid">
      <RuleFields
        title="Photograph"
        rule={rules.photo}
        onChange={(photo) => {
          setRules({ ...rules, photo });
          setPreparedPhoto(undefined);
        }}
      />
      <RuleFields
        title="Signature"
        rule={rules.signature}
        onChange={(signature) => {
          setRules({ ...rules, signature });
          setPreparedSignature(undefined);
        }}
      />
      <fieldset className="rule-fields full">
        <legend>Supporting documents</legend>
        <div className="fields">
          <SelectField
            label="Supporting file format"
            value={rules.supporting[0].formats?.[0] ?? ""}
            onChange={(v) =>
              setRules({
                ...rules,
                supporting: [
                  {
                    ...rules.supporting[0],
                    formats: v ? [v as FileKind] : undefined,
                  },
                ],
              })
            }
            options={{ "": "Any supported format", ...fileTypes }}
          />
          <NumberField
            label="Supporting maximum size (KB)"
            step="any"
            value={rules.supporting[0].maxKB ?? ""}
            onChange={(v) =>
              setRules({
                ...rules,
                supporting: [{ ...rules.supporting[0], maxKB: emptyNumber(v) }],
              })
            }
          />
          <NumberField
            label="Supporting maximum PDF pages"
            min={1}
            max={500}
            value={rules.supporting[0].maxPages ?? ""}
            onChange={(v) =>
              setRules({
                ...rules,
                supporting: [
                  { ...rules.supporting[0], maxPages: emptyNumber(v) },
                ],
              })
            }
          />
          <Toggle
            checked={rules.supporting[0].paper === "a4"}
            onChange={(v) =>
              setRules({
                ...rules,
                supporting: [
                  { ...rules.supporting[0], paper: v ? "a4" : undefined },
                ],
              })
            }
          >
            Require A4 for PDF pages
          </Toggle>
        </div>
        <Notice text={supportError} error />
      </fieldset>
      <div className="full">
        <Field label="Official instructions link (optional)">
          <input
            type="url"
            placeholder="https://"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
          />
        </Field>
        <Notice
          text={
            sourceInput && !official
              ? "Enter an http or https link to a notice."
              : ""
          }
          error
        />
      </div>
    </div>
  );
  const requirements = (
    <section className="panel">
      <h2 ref={heading} tabIndex={-1}>
        Application requirements
      </h2>
      {preset ? (
        <>
          <p>
            {preset.organization} · {preset.notification}
          </p>
          <Stats
            items={{
              Photograph: shortRule(rules.photo),
              Signature: shortRule(rules.signature),
              "Last verified": preset.verified,
            }}
          />
          <h3>Supporting requirements</h3>
          <ul className="requirements-list">
            {rules.supporting.map((rule) => (
              <li key={rule.name}>
                <strong>{rule.name}</strong>
                {[
                  rule.conditional ? "If applicable" : undefined,
                  rule.formats?.map((m) => fileTypes[m]).join(" or "),
                  rule.paper ? "A4" : undefined,
                  rule.minKB ? "At least " + rule.minKB + " KB" : undefined,
                  rule.maxKB ? "At most " + rule.maxKB + " KB" : undefined,
                  rule.detail,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ))}
          </ul>
          <ul className="requirements-list">
            {preset.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <a className="text-link" href={preset.source}>
            Read the official notification
          </a>
        </>
      ) : (
        <>
          <p>
            Enter the rules from your application notice. Leave an unknown rule
            blank.
          </p>
          {editRules}
        </>
      )}
    </section>
  );
  const report = (
    <section className="panel">
      <h2 ref={heading} tabIndex={-1}>
        Validation checklist
      </h2>
      <Notice text={rError} error />
      <CheckList items={rError ? [] : checklist} />
      <p className="hint mt-3">
        Passing technical checks does not guarantee acceptance. Verify the
        official notice and review your documents for readability and content.
      </p>
      {official && (
        <a className="text-link" href={official}>
          Official application instructions
        </a>
      )}
    </section>
  );
  const photoInput = (
    <ExamImage
      label="Photograph"
      rule={rules.photo}
      file={photo}
      onFile={setPhoto}
      prepared={preparedPhoto}
      onPrepare={setPreparedPhoto}
      validator={validator}
      onFacts={setPhotoFacts}
    />
  );
  const signatureInput = (
    <ExamImage
      label="Signature"
      rule={rules.signature}
      file={signature}
      onFile={setSignature}
      prepared={preparedSignature}
      onPrepare={setPreparedSignature}
      validator={validator}
      onFacts={setSignatureFacts}
    />
  );
  const supportingInputs = (
    <SupportingInputs
      rules={rules.supporting}
      files={supporting}
      change={updateSupport}
      configured={!!preset}
    />
  );
  function saveSupporting(generated: Output[]) {
    if (!(destination in destinations(pdfTool))) {
      setPdfError("Choose a compatible supporting document.");
      return;
    }
    const index = +destination,
      current = supporting[index] ?? [],
      replace = preset && !!rules.supporting[index].minFiles;
    const newFiles = generated.map(
      (output) =>
        new File([output.blob], output.name, { type: output.blob.type }),
    );
    const next = replace ? newFiles : [...current, ...newFiles];
    if (
      next.length > 25 ||
      next.reduce((sum, file) => sum + file.size, 0) > 150 * 1024 ** 2
    ) {
      setPdfError("The supporting-file batch exceeds 25 files or 150 MB.");
      return;
    }
    updateSupport(index, next);
    setPdfError("");
  }
  return (
    <div className="wizard-box" inert={!ready} aria-busy={!ready}>
      {!validator && (
        <ol className="step-list" aria-label="Preparation steps">
          {labels.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                disabled={i > visited}
                aria-current={i === step ? "step" : undefined}
                onClick={() => move(i)}
              >
                <span>{i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      )}
      {(validator || step === 0) && (
        <section className="panel">
          <div className="panel-head">
            <h2 ref={heading} tabIndex={-1}>
              {validator
                ? "Choose validation rules"
                : "Select your examination"}
            </h2>
            <span className="icon-tile teal">
              <ClipboardCheck size={22} />
            </span>
          </div>
          <p>
            Use a sourced preset for its exact notification, or set the
            requirements from your application form.
          </p>
          <div className="fields">
            <SelectField
              label="Examination or custom requirements"
              value={presetId}
              onChange={changePreset}
              options={{
                "": "Custom requirements",
                ...Object.fromEntries(examPresets.map((p) => [p.id, p.name])),
              }}
              full
            />
          </div>
        </section>
      )}
      {(validator || step === 1) && requirements}
      {validator && (
        <div className="workspace">
          {photoInput}
          {signatureInput}
        </div>
      )}
      {!validator && step === 2 && (
        <div>
          <h2 className="sr-only" ref={heading} tabIndex={-1}>
            Photograph step
          </h2>
          {photoInput}
        </div>
      )}
      {!validator && step === 3 && (
        <div>
          <h2 className="sr-only" ref={heading} tabIndex={-1}>
            Signature step
          </h2>
          {signatureInput}
        </div>
      )}
      {(validator || step === 4) && (
        <>
          <section className="panel">
            <h2 ref={heading} tabIndex={-1}>
              Supporting documents
            </h2>
            <p>Attach the files requested by your application.</p>
            {!validator && (
              <div className="fields">
                <SelectField
                  label="Prepare a supporting file"
                  value={pdfTool}
                  onChange={(value) => {
                    setPdfTool(value);
                    setDestination(Object.keys(destinations(value))[0] ?? "");
                    setPdfError("");
                  }}
                  options={{
                    "": "Attach existing files",
                    ...(Object.keys(destinations("image-compressor")).length
                      ? { "image-compressor": "Compress an image" }
                      : {}),
                    ...(Object.keys(destinations("merge-pdf")).length
                      ? {
                          "image-to-pdf": "Convert images to PDF",
                          "merge-pdf": "Merge PDFs",
                          "extract-pdf-pages": "Extract PDF pages",
                        }
                      : {}),
                  }}
                />
                {pdfTool && (
                  <SelectField
                    label="Add prepared file to"
                    value={destination}
                    onChange={setDestination}
                    options={destinations(pdfTool)}
                  />
                )}
              </div>
            )}
            <Notice text={pdfError} error />
          </section>
          {!validator && pdfTool === "image-compressor" && (
            <ImageTool
              key={pdfTool + destination}
              slug={pdfTool}
              embedded
              initialTarget={rules.supporting[+destination]?.maxKB}
              onOutput={saveSupporting}
            />
          )}
          {!validator && pdfTool && pdfTool !== "image-compressor" && (
            <PDFTool
              key={pdfTool + destination}
              slug={pdfTool}
              embedded
              onResults={saveSupporting}
            />
          )}
          {supportingInputs}
        </>
      )}
      {(validator || step === 5) && report}
      {!validator && step === 6 && (
        <section className="panel">
          <h2 ref={heading} tabIndex={-1}>
            Download your documents
          </h2>
          <Stats
            items={{
              "Files available": outputs.length,
              Passed: checklist.filter((c) => c.state === "passed").length,
              Failed: checklist.filter((c) => c.state === "failed").length,
              "Not verified": checklist.filter((c) => c.state === "pending")
                .length,
            }}
          />
          {!outputs.length && (
            <p className="mt-3">
              Prepare or attach a file in an earlier step to download it here.
            </p>
          )}
          <Results
            outputs={outputs}
            zipName="applykit-application-documents.zip"
          />
          <p className="hint mt-3">
            Review failed and unverified requirements before submitting. Passing
            technical checks does not guarantee acceptance.
          </p>
          {official && (
            <a className="text-link" href={official}>
              Official application instructions
            </a>
          )}
        </section>
      )}
      {!validator && (
        <div className="wizard-foot">
          <button
            className="button secondary"
            type="button"
            disabled={step === 0}
            onClick={() => move(step - 1)}
          >
            Back
          </button>
          {step < labels.length - 1 && (
            <button
              className="button primary"
              type="button"
              disabled={step === 1 && !!rError}
              onClick={() => move(step + 1)}
            >
              {step === 5 ? "Go to downloads" : "Continue"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
