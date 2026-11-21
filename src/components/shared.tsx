import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  Download,
  FileText,
  ImagePlus,
  X,
  MoveUp,
  MoveDown,
  GripVertical,
  Archive,
  CircleCheck,
  CircleMinus,
  TriangleAlert,
} from "lucide-react";
import {
  cleanName,
  download,
  errorMessage,
  limits,
  sizeLabel,
  validateFile,
  zipFiles,
  type Output,
} from "../lib/files";

export function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}

export function useDiscardFiles(reset: () => void) {
  const latest = useRef(reset);
  latest.current = reset;
  useEffect(() => {
    const discard = (event: PageTransitionEvent) => {
      if (event.persisted) flushSync(() => latest.current());
    };
    window.addEventListener("pagehide", discard);
    return () => window.removeEventListener("pagehide", discard);
  }, []);
}

export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
export function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={"field" + (full ? " full" : "")}>
      {label}
      {children}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder,
  full = false,
}: {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  full?: boolean;
}) {
  return (
    <Field label={label} full={full}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
      />
    </Field>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  options,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  full?: boolean;
}) {
  return (
    <Field label={label} full={full}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([v, n]) => (
          <option value={v} key={v}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Toggle({
  children,
  checked,
  onChange,
}: {
  children: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}
export function Stats({ items }: { items: Record<string, ReactNode> }) {
  return (
    <dl className="stats">
      {Object.entries(items).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "Unavailable"}</dd>
        </div>
      ))}
    </dl>
  );
}
export type Check = {
  label: string;
  state: "passed" | "failed" | "pending";
  detail?: string;
};
export function CheckList({ items }: { items: Check[] }) {
  return (
    <ul className="checklist">
      {items.map(({ label, state, detail }) => {
        const StatusIcon =
          state === "passed"
            ? CircleCheck
            : state === "failed"
              ? TriangleAlert
              : CircleMinus;
        return (
          <li key={label}>
            <span>
              {label}
              {detail && <small className="hint block">{detail}</small>}
            </span>
            <strong className={state}>
              <StatusIcon
                aria-hidden="true"
                size={15}
                className="inline align-text-bottom"
              />{" "}
              {state === "passed"
                ? "Passed"
                : state === "failed"
                  ? "Failed"
                  : "Not verified"}
            </strong>
          </li>
        );
      })}
    </ul>
  );
}
export function Notice({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return text ? (
    <div
      className={"notice" + (error ? " error" : "")}
      role={error ? "alert" : "status"}
    >
      {text}
    </div>
  ) : null;
}
export function Results({
  outputs,
  zipName,
}: {
  outputs: Output[];
  zipName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  useEffect(() => {
    setMessage("");
    setProblem("");
  }, [outputs]);
  if (!outputs.length) return null;
  const save = (output: Output) => {
    download(output);
    setMessage("Download started.");
  };
  return (
    <div>
      {outputs.length === 1 && (
        <div className="actions">
          <button
            type="button"
            className="button primary"
            onClick={() => save(outputs[0])}
          >
            <Download size={17} />
            Download{" "}
            {outputs[0].blob.type === "application/pdf" ? "PDF" : "file"}
          </button>
        </div>
      )}
      {zipName && (
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setProblem("");
              try {
                save({ blob: await zipFiles(outputs), name: zipName });
              } catch (e) {
                setProblem(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Archive size={17} />
            {busy ? "Creating ZIP…" : "Download all as ZIP"}
          </button>
        </div>
      )}
      {outputs.length > 1 && (
        <ul className="result-list">
          {outputs.map((output, i) => (
            <li key={i}>
              <span>
                {output.name} · {sizeLabel(output.blob.size)}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={"Download " + output.name}
                onClick={() => save(output)}
              >
                <Download size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Notice text={problem} error />
      <Notice text={message} />
    </div>
  );
}

export function FilePicker({
  sizeBase = 1024,
  files,
  onChange,
  kind = "image",
  multiple = false,
  paste = false,
  reorder = false,
  disabled = false,
}: {
  files: File[];
  sizeBase?: 1000 | 1024;
  onChange: (files: File[]) => void;
  kind?: "image" | "pdf" | "both";
  multiple?: boolean;
  paste?: boolean;
  reorder?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(files);
  latest.current = files;
  const intake = useRef(0);
  const dragIndex = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("");
  async function add(incoming: File[]) {
    if (disabled || !incoming.length) return;
    const token = ++intake.current;
    setChecking(true);
    setStatus("");
    const accepted: File[] = [];
    const issues: string[] = [];
    const existing = multiple ? latest.current : [];
    let total = existing.reduce((sum, file) => sum + file.size, 0);
    for (const file of incoming.slice(0, multiple ? limits.files : 1)) {
      try {
        await validateFile(file, kind);
        if (token !== intake.current) return;
        if (
          total + file.size > limits.batchBytes ||
          existing.length + accepted.length >= limits.files
        )
          throw Error("The batch limit is 25 files or 150 MB.");
        total += file.size;
        accepted.push(file);
      } catch (e) {
        issues.push(cleanName(file.name) + " — " + errorMessage(e));
      }
    }
    if (multiple && incoming.length > limits.files)
      issues.push("Select up to 25 files at a time.");
    if (token !== intake.current) return;
    if (accepted.length) {
      onChange([...existing, ...accepted]);
      setStatus(
        accepted.length +
          " file" +
          (accepted.length === 1 ? "" : "s") +
          " added.",
      );
    }
    setError(issues.slice(0, 3).join(" "));
    setChecking(false);
  }
  const addRef = useRef(add);
  addRef.current = add;
  useEffect(() => {
    if (!paste) return;
    const handle = (event: ClipboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("input,textarea,[contenteditable=true]")
      )
        return;
      const clipboard = event.clipboardData;
      const imageFiles = [...(clipboard?.files ?? [])].filter(
        (file) => file.type.startsWith("image/"),
      );
      if (!imageFiles.length) {
        for (const item of clipboard?.items ?? []) {
          if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length) {
        event.preventDefault();
        void addRef.current(imageFiles);
      }
    };
    document.addEventListener("paste", handle);
    return () => document.removeEventListener("paste", handle);
  }, [paste]);
  useEffect(
    () => () => {
      intake.current++;
    },
    [],
  );
  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= files.length) return;
    const reordered = [...files];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    onChange(reordered);
    setStatus(
      "Moved " + cleanName(files[from].name) + " to position " + (to + 1) + ".",
    );
  }
  const accept =
    kind === "pdf"
      ? ".pdf,application/pdf"
      : kind === "image"
        ? ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        : ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
  return (
    <>
      <div
        className={"drop-zone" + (dragging ? " dragging" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void add([...e.dataTransfer.files]);
        }}
      >
        {kind === "pdf" ? (
          <FileText size={25} aria-hidden="true" />
        ) : (
          <ImagePlus size={25} aria-hidden="true" />
        )}
        <strong>{multiple ? "Drop files here" : "Drop your file here"}</strong>
        <span className="hint" id={id}>
          {kind === "pdf"
            ? "PDF · up to 64 MB each"
            : kind === "image"
              ? "JPG, PNG, WebP · up to 32 MB each"
              : "JPG, PNG, WebP or PDF"}
          {paste ? " · or paste an image" : ""}
        </span>
        <input
          ref={input}
          type="file"
          aria-label={multiple ? "Choose files" : "Choose file"}
          aria-describedby={id}
          accept={accept}
          multiple={multiple}
          hidden
          onChange={(e) => {
            void add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="button secondary"
          disabled={disabled || checking}
          onClick={() => input.current?.click()}
        >
          {checking ? "Checking…" : multiple ? "Choose files" : "Choose file"}
        </button>
      </div>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file, index) => (
            <li
              className="file-item"
              key={index}
              draggable={reorder && !disabled}
              onDragStart={(e) => {
                dragIndex.current = index;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(index));
              }}
              onDragEnd={() => {
                dragIndex.current = null;
              }}
              onDragOver={(e) => {
                if (reorder && !disabled && dragIndex.current !== null)
                  e.preventDefault();
              }}
              onDrop={(e) => {
                if (reorder && !disabled && dragIndex.current !== null) {
                  e.preventDefault();
                  move(dragIndex.current, index);
                  dragIndex.current = null;
                }
              }}
            >
              {reorder ? (
                <GripVertical size={15} aria-hidden="true" />
              ) : (
                <FileText size={16} aria-hidden="true" />
              )}
              <div>
                <strong>{cleanName(file.name)}</strong>
                <small>{sizeLabel(file.size, sizeBase)}</small>
              </div>
              {reorder && (
                <>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, index - 1)}
                    aria-label={"Move file " + (index + 1) + " up"}
                  >
                    <MoveUp size={15} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={disabled || index === files.length - 1}
                    onClick={() => move(index, index + 1)}
                    aria-label={"Move file " + (index + 1) + " down"}
                  >
                    <MoveDown size={15} />
                  </button>
                </>
              )}
              <button
                className="icon-button"
                type="button"
                disabled={disabled || checking}
                onClick={() => {
                  setError("");
                  onChange(files.filter((_, i) => i !== index));
                  setStatus("Removed " + cleanName(file.name) + ".");
                }}
                aria-label={"Remove " + cleanName(file.name)}
              >
                <X size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only" role="status">
        {status}
      </span>
      <Notice text={error} error />
    </>
  );
}
