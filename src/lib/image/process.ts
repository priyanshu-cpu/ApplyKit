import { limits, validateFile, type ImageMime } from "../files.ts";
import { clamp, fitRect, fullCrop, type Crop } from "./geometry.ts";

export type ImageSource = {
  bitmap: ImageBitmap;
  mime: ImageMime;
  width: number;
  height: number;
};
export type ImageOptions = {
  width?: number;
  height?: number;
  crop?: Crop;
  rotation?: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  fit?: "contain" | "stretch" | "crop";
  background?: string;
  trim?: boolean;
  grayscale?: boolean;
  brightness?: number;
  contrast?: number;
  stamp?: {
    text: string;
    size: number;
    color: string;
    opacity: number;
    horizontal: "left" | "center" | "right";
    vertical: "top" | "middle" | "bottom";
  };
};
export function checkDimensions(w: number, h: number) {
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 1 ||
    h < 1 ||
    w > limits.side ||
    h > limits.side ||
    w * h > limits.pixels
  ) {
    throw Error(
      "Use whole dimensions from 1 to 8,192 pixels per side, up to 24 megapixels.",
    );
  }
}
export function headerDimensions(bytes: Uint8Array, mime: ImageMime) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png" && bytes.length >= 24)
    return [v.getUint32(16), v.getUint32(20)];
  if (mime === "image/jpeg") {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i++] !== 255) break;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 0xda || marker === 0xd9 || i + 2 >= bytes.length) break;
      const len = v.getUint16(i);
      if (len < 2) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        len >= 7
      )
        return [v.getUint16(i + 5), v.getUint16(i + 3)];
      i += len;
    }
  }
  if (mime === "image/webp" && bytes.length >= 30) {
    const chunk = new TextDecoder().decode(bytes.subarray(12, 16));
    if (chunk === "VP8X")
      return [
        1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      ];
    if (chunk === "VP8L") {
      const packed = v.getUint32(21, true);
      return [1 + (packed & 0x3fff), 1 + ((packed >> 14) & 0x3fff)];
    }
    if (chunk === "VP8 ")
      return [v.getUint16(26, true) & 0x3fff, v.getUint16(28, true) & 0x3fff];
  }
  throw Error(
    "Image dimensions could not be read. The file may be corrupt or unsupported.",
  );
}
export async function openImage(file: File): Promise<ImageSource> {
  const mime = (await validateFile(file, "image")) as ImageMime;
  const [w, h] = headerDimensions(
    new Uint8Array(await file.slice(0, 1024 ** 2).arrayBuffer()),
    mime,
  );
  checkDimensions(w, h);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([file], { type: mime }));
  } catch {
    throw Error(
      "This image could not be decoded. Try a different JPG, PNG or WebP file.",
    );
  }
  try {
    checkDimensions(bitmap.width, bitmap.height);
  } catch (error) {
    bitmap.close();
    throw error;
  }
  return { bitmap, mime, width: bitmap.width, height: bitmap.height };
}
export function canvasOf(width: number, height: number) {
  checkDimensions(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
export function release(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}
function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("This browser could not create an image workspace.");
  ctx.imageSmoothingQuality = "high";
  return ctx;
}
export function orientedSize(width: number, height: number, angle = 0) {
  return Math.abs(angle % 180) === 90
    ? { width: height, height: width }
    : { width, height };
}
export function rotateSource(source: ImageSource, angle: number) {
  const { width, height } = orientedSize(source.width, source.height, angle);
  const canvas = canvasOf(width, height);
  const ctx = context(canvas);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(source.bitmap, -source.width / 2, -source.height / 2);
  return canvas;
}
function trimBounds(
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.min(1, 750 / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const sample = canvasOf(tw, th);
  try {
    const ctx = context(sample);
    ctx.drawImage(image, x, y, w, h, 0, 0, tw, th);
    const { data } = ctx.getImageData(0, 0, tw, th);
    let left = tw,
      right = -1,
      top = th,
      bottom = -1;
    for (let py = 0; py < th; py++)
      for (let px = 0; px < tw; px++) {
        const i = (py * tw + px) * 4;
        if (
          data[i + 3] < 32 ||
          (data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242)
        )
          continue;
        left = Math.min(left, px);
        right = Math.max(right, px);
        top = Math.min(top, py);
        bottom = Math.max(bottom, py);
      }
    if (right < left) return { x, y, w, h };
    const l = Math.max(0, (left - 1) / tw),
      r = Math.min(1, (right + 2) / tw),
      t = Math.max(0, (top - 1) / th),
      b = Math.min(1, (bottom + 2) / th);
    return { x: x + l * w, y: y + t * h, w: (r - l) * w, h: (b - t) * h };
  } finally {
    release(sample);
  }
}
export function drawImage(
  source: ImageSource,
  options: ImageOptions,
  mime: ImageMime,
) {
  const rotated = options.rotation
    ? rotateSource(source, options.rotation)
    : undefined;
  try {
    const input = rotated ?? source.bitmap;
    const crop = options.crop ?? fullCrop;
    const zoom = options.zoom ?? 1;
    const cw = Math.max(1, (input.width * crop.w) / 100 / zoom);
    const ch = Math.max(1, (input.height * crop.h) / 100 / zoom);
    const x = clamp(
      (input.width * crop.x) / 100 +
        ((input.width * crop.w) / 100 - cw) / 2 +
        ((options.panX ?? 0) * input.width) / 200,
      0,
      input.width - cw,
    );
    const y = clamp(
      (input.height * crop.y) / 100 +
        ((input.height * crop.h) / 100 - ch) / 2 +
        ((options.panY ?? 0) * input.height) / 200,
      0,
      input.height - ch,
    );
    const rect = options.trim
      ? trimBounds(input, x, y, cw, ch)
      : { x, y, w: cw, h: ch };
    const width = options.width ?? Math.max(1, Math.round(rect.w));
    const height = options.height ?? Math.max(1, Math.round(rect.h));
    const canvas = canvasOf(width, height);
    const ctx = context(canvas);
    try {
      if (options.background || mime === "image/jpeg") {
        ctx.fillStyle = options.background || "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
      const fit = fitRect(
        rect.w,
        rect.h,
        width,
        height,
        options.fit ?? "stretch",
      );
      ctx.save();
      if (
        options.grayscale ||
        options.brightness !== undefined ||
        options.contrast !== undefined
      ) {
        ctx.filter =
          "grayscale(" +
          (options.grayscale ? 1 : 0) +
          ") brightness(" +
          (options.brightness ?? 100) +
          "%) contrast(" +
          (options.contrast ?? 100) +
          "%)";
      }
      ctx.drawImage(
        input,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        fit.x,
        fit.y,
        fit.w,
        fit.h,
      );
      ctx.restore();
      const stamp = options.stamp;
      if (stamp?.text) {
        const pad = Math.max(3, Math.round(Math.min(width, height) * 0.04));
        const tx =
          stamp.horizontal === "left"
            ? pad
            : stamp.horizontal === "right"
              ? width - pad
              : width / 2;
        const ty =
          stamp.vertical === "top"
            ? pad
            : stamp.vertical === "bottom"
              ? height - pad
              : height / 2;
        ctx.globalAlpha = stamp.opacity;
        ctx.textAlign = stamp.horizontal;
        ctx.textBaseline = stamp.vertical;
        ctx.font = "bold " + Math.min(stamp.size, height) + "px sans-serif";
        const channels = stamp.color
          .match(/[a-f\d]{2}/gi)
          ?.map((channel) => parseInt(channel, 16)) ?? [255, 255, 255];
        const light =
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 >
          140;
        ctx.strokeStyle = light ? "#0f172a" : "#ffffff";
        ctx.lineWidth = Math.max(1, Math.min(stamp.size, height) * 0.09);
        ctx.lineJoin = "round";
        ctx.strokeText(stamp.text, tx, ty, Math.max(1, width - 2 * pad));
        ctx.fillStyle = stamp.color;
        ctx.fillText(stamp.text, tx, ty, Math.max(1, width - 2 * pad));
      }
      return canvas;
    } catch (error) {
      release(canvas);
      throw error;
    }
  } finally {
    if (rotated) release(rotated);
  }
}
export async function encode(
  canvas: HTMLCanvasElement,
  mime: ImageMime,
  quality: number,
) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality),
  );
  if (!blob || blob.type !== mime)
    throw Error(
      "This browser cannot encode " +
        mime.split("/")[1].toUpperCase() +
        ". Choose another output format.",
    );
  return blob;
}
export async function compress(
  canvas: HTMLCanvasElement,
  mime: ImageMime,
  quality: number,
  target?: number,
  reduce = false,
  signal?: AbortSignal,
) {
  let current = canvas;
  let best: { blob: Blob; width: number; height: number } | undefined;
  const remember = (blob: Blob) => {
    const entry = { blob, width: current.width, height: current.height };
    if (!best || blob.size < best.blob.size) best = entry;
    return entry;
  };
  try {
    for (let pass = 0; pass < (reduce ? 8 : 1); pass++) {
      signal?.throwIfAborted();
      const highBlob = await encode(current, mime, quality);
      const high = remember(highBlob);
      if (!target || highBlob.size <= target) return { ...high, met: true };
      if (mime !== "image/png") {
        const low = remember(await encode(current, mime, 0.02));
        if (low.blob.size <= target) {
          let result = low,
            l = 0.02,
            r = quality;
          for (let i = 0; i < 8; i++) {
            signal?.throwIfAborted();
            const q = (l + r) / 2;
            const next = remember(await encode(current, mime, q));
            if (next.blob.size <= target) {
              result = next;
              l = q;
            } else r = q;
          }
          return { ...result, met: true };
        }
      }
      if (
        !reduce ||
        (current.width === 1 && current.height === 1) ||
        pass === 7
      )
        break;
      const scale = clamp(
        Math.sqrt(target / best!.blob.size) * 0.93,
        0.25,
        0.8,
      );
      const next = canvasOf(
        Math.max(1, Math.floor(current.width * scale)),
        Math.max(1, Math.floor(current.height * scale)),
      );
      context(next).drawImage(canvas, 0, 0, next.width, next.height);
      if (current !== canvas) release(current);
      current = next;
    }
    return { ...best!, met: false };
  } finally {
    if (current !== canvas) release(current);
  }
}
