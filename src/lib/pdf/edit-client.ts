import type { Output } from "../files";

export type PDFCommand =
  | { kind: "compress"; file: File }
  | { kind: "merge"; files: File[] }
  | {
      kind: "edit";
      file: File;
      groups: number[][];
      rotation: Record<number, number>;
      name: string;
    };
export type PDFWorkerMessage =
  { progress: number } | { outputs: Output[] } | { error: string };

export function runPDFEdit(
  command: PDFCommand,
  signal: AbortSignal,
  progress: (count: number) => void,
) {
  signal.throwIfAborted();
  const worker = new Worker(
    new URL("../../workers/pdf-edit.ts", import.meta.url),
    { type: "module" },
  );
  return new Promise<Output[]>((resolve, reject) => {
    const dispose = () => {
      signal.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      dispose();
      reject(signal.reason);
    };
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }: MessageEvent<PDFWorkerMessage>) => {
      if ("progress" in data) {
        progress(data.progress);
        return;
      }
      dispose();
      if ("outputs" in data) resolve(data.outputs);
      else reject(Error(data.error));
    };
    worker.onerror = () => {
      dispose();
      reject(
        Error(
          "The PDF processing worker stopped. Try again with a smaller file.",
        ),
      );
    };
    try {
      worker.postMessage(command);
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}
