export function parseRanges(input: string, count: number) {
  if (!input.trim()) throw Error("Enter one or more page numbers or ranges.");
  const groups = input
    .trim()
    .split(/[,;]/)
    .map((group) => {
      const match = /^\s*(\d+)\s*(?:[-–—]\s*(\d+)\s*)?$/.exec(group);
      if (!match) throw Error("Use a list such as 1–3, 5, 7–9.");
      const first = Number(match[1]),
        last = Number(match[2] ?? match[1]);
      if (first < 1 || last < first || last > count)
        throw Error(
          "Each range must be in order and between page 1 and " + count + ".",
        );
      return Array.from({ length: last - first + 1 }, (_, i) => first + i);
    });
  if (
    groups.length > 50 ||
    groups.reduce((sum, group) => sum + group.length, 0) > 1000
  )
    throw Error("Use at most 50 groups and 1,000 total selected pages.");
  return groups;
}
