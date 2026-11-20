const day = 86_400_000;
export function parseDate(input: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!parts) return undefined;
  const [, y, m, d] = parts.map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : undefined;
}
export function localToday() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}
export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const m = result.getUTCMonth() + months,
    d = result.getUTCDate();
  result.setUTCMonth(m + 1, 0);
  result.setUTCDate(Math.min(d, result.getUTCDate()));
  return result;
}
export function calendarBetween(from: Date, to: Date) {
  if (from > to)
    throw Error("The beginning date must be on or before the end date.");
  let totalMonths =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    to.getUTCMonth() -
    from.getUTCMonth();
  if (addMonths(from, totalMonths) > to) totalMonths--;
  const totalDays = (+to - +from) / day;
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: (+to - +addMonths(from, totalMonths)) / day,
    totalDays,
    totalMonths,
  };
}
export function nextBirthday(birth: Date, asOf: Date) {
  let year = asOf.getUTCFullYear() - birth.getUTCFullYear();
  let next = addMonths(birth, year * 12);
  if (next < asOf) next = addMonths(birth, ++year * 12);
  return next;
}
export function eligible(age: number, min: number, max: number, relax = 0) {
  if (
    ![min, max, relax].every((n) => Number.isInteger(n) && n >= 0) ||
    min > max
  )
    throw Error(
      "Use whole, nonnegative ages with a maximum at least as high as the minimum.",
    );
  return age >= min && age <= max + relax;
}
export function countDifference(from: Date, to: Date, inclusive: boolean) {
  if (from > to)
    throw Error("The beginning date must be on or before the end date.");
  const last = inclusive ? new Date(+to + day) : to;
  const result = calendarBetween(from, last);
  return {
    ...result,
    weeks: Math.floor(result.totalDays / 7),
    daysAfterWeeks: result.totalDays % 7,
  };
}
export function percentage(obtained: number, total: number, target?: number) {
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(obtained) ||
    total <= 0 ||
    obtained < 0 ||
    obtained > total
  )
    throw Error(
      "Enter a positive total and obtained marks between zero and that total.",
    );
  if (
    target !== undefined &&
    (!Number.isFinite(target) || target < 0 || target > 100)
  )
    throw Error("Enter a target between 0 and 100%.");
  return {
    value: (obtained / total) * 100,
    required: target === undefined ? undefined : total * (target / 100),
  };
}
