import { imageFormats, sizeLabel, type ImageMime } from "./files.ts";
export type ImageRule = {
  width?: number;
  height?: number;
  minKB?: number;
  maxKB?: number;
  formats?: ImageMime[];
  preferredDimensions?: boolean;
};
export type ImageFacts = {
  width: number;
  height: number;
  size: number;
  mime: ImageMime;
};
export function checkResult(
  label: string,
  enabled: boolean,
  readable: boolean,
  ok: boolean,
  detail?: string,
) {
  return {
    label,
    state: (!enabled || !readable ? "pending" : ok ? "passed" : "failed") as
      "pending" | "passed" | "failed",
    detail,
  };
}
export function imageChecks(
  label: string,
  rule: ImageRule,
  facts?: ImageFacts,
) {
  const width = !rule.width || rule.width === facts?.width;
  const height = !rule.height || rule.height === facts?.height;
  const size = facts?.size ?? 0;
  return [
    checkResult(
      label + " dimensions",
      Boolean(rule.width || rule.height) && !rule.preferredDimensions,
      !!facts,
      width && height,
      facts
        ? facts.width +
            " × " +
            facts.height +
            " px" +
            (rule.preferredDimensions
              ? " · published dimensions are preferred"
              : "")
        : undefined,
    ),
    checkResult(
      label + " file size",
      Boolean(rule.minKB || rule.maxKB),
      !!facts,
      (!rule.minKB || size >= rule.minKB * 1024) &&
        (!rule.maxKB || size <= rule.maxKB * 1024),
      facts ? sizeLabel(size) : undefined,
    ),
    checkResult(
      label + " format",
      Boolean(rule.formats?.length),
      !!facts,
      !!facts && !!rule.formats?.includes(facts.mime),
      facts ? imageFormats[facts.mime] : undefined,
    ),
  ];
}
export function ruleError(rule: ImageRule) {
  if (
    [rule.width, rule.height].some(
      (n) => n !== undefined && (!Number.isInteger(n) || n < 1 || n > 8192),
    )
  )
    return "Dimensions must be whole numbers from 1 to 8,192.";
  if (
    [rule.minKB, rule.maxKB].some(
      (n) => n !== undefined && (!Number.isFinite(n) || n <= 0),
    )
  )
    return "File-size limits must be positive.";
  if (rule.minKB && rule.maxKB && rule.minKB > rule.maxKB)
    return "The minimum file size exceeds the maximum.";
  return "";
}
