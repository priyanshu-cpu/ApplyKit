export const a4 = { width: 210, height: 297 };
export const aspect = (w: number, h: number) => {
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  const d = gcd(w, h);
  return w / d + ":" + h / d;
};
export const unitsPerInch = { px: 1, mm: 25.4, cm: 2.54, in: 1 };
export type Unit = keyof typeof unitsPerInch;
export const toPixels = (value: number, unit: Unit, ppi: number) =>
  Math.round(unit === "px" ? value : (value / unitsPerInch[unit]) * ppi);
export const toMM = (value: number, unit: Unit, ppi: number) =>
  unit === "px" ? (value * 25.4) / ppi : (value * 25.4) / unitsPerInch[unit];
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
export function fitRect(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  fit: "stretch" | "contain" | "crop",
) {
  const scale =
    fit === "crop" ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
  const w = fit === "stretch" ? dw : sw * scale;
  const h = fit === "stretch" ? dh : sh * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}
export type Crop = { x: number; y: number; w: number; h: number };
export const fullCrop: Crop = { x: 0, y: 0, w: 100, h: 100 };
export function cropToAspect(ratio: number, w: number, h: number): Crop {
  const relative = (ratio * h) / w;
  const width = relative > 1 ? 100 : relative * 100;
  const height = relative > 1 ? 100 / relative : 100;
  return { x: (100 - width) / 2, y: (100 - height) / 2, w: width, h: height };
}
