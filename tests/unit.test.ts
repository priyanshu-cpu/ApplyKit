import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMonths,
  calendarBetween,
  countDifference,
  eligible,
  nextBirthday,
  parseDate,
  percentage,
} from "../src/lib/calculations.ts";
import {
  aspect,
  cropToAspect,
  fitRect,
  toMM,
  toPixels,
} from "../src/lib/image/geometry.ts";
import { checkDimensions, headerDimensions } from "../src/lib/image/process.ts";
import { cleanName, detectHeader, validateFile } from "../src/lib/files.ts";
import { parseRanges } from "../src/lib/pdf/ranges.ts";
import { imageChecks, ruleError } from "../src/lib/validation.ts";

test("physical photo dimensions and aspect-preserving geometry", () => {
  assert.equal(toPixels(35, "mm", 300), 413);
  assert.equal(toPixels(4.5, "cm", 300), 531);
  assert.equal(toPixels(2, "in", 300), 600);
  assert.equal(toMM(600, "px", 300), 50.8);
  assert.equal(aspect(600, 400), "3:2");
  assert.deepEqual(fitRect(400, 200, 100, 100, "contain"), {
    x: 0,
    y: 25,
    w: 100,
    h: 50,
  });
  assert.deepEqual(fitRect(400, 200, 100, 100, "crop"), {
    x: -50,
    y: 0,
    w: 200,
    h: 100,
  });
  assert.deepEqual(cropToAspect(1, 400, 200), { x: 25, y: 0, w: 50, h: 100 });
  assert.throws(() => checkDimensions(8192, 8192), /24 megapixels/);
  assert.throws(() => checkDimensions(0, 100), /whole dimensions/);
});
test("validates image signatures rather than trusting extensions or MIME", async () => {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d494844520000030000000200",
    "hex",
  );
  assert.equal(detectHeader(png), "image/png");
  assert.deepEqual(headerDimensions(png, "image/png"), [768, 512]);
  assert.equal(
    await validateFile(
      new File([png], "mislabeled.jpg", { type: "image/jpeg" }),
      "image",
    ),
    "image/png",
  );
  await assert.rejects(
    () =>
      validateFile(
        new File(["<svg></svg>"], "fake.png", { type: "image/png" }),
        "image",
      ),
    /supported/,
  );
  await assert.rejects(
    () => validateFile(new File([png], "fake.pdf"), "pdf"),
    /supported PDF/,
  );
  assert.equal(cleanName("  bad/abc\\file.pdf  "), "bad_abc_file.pdf");
});
test("calendar age, invalid dates and non-leap anniversaries", () => {
  const dob = parseDate("2000-02-29")!,
    cutoff = parseDate("2023-02-28")!;
  const age = calendarBetween(dob, cutoff);
  assert.deepEqual([age.years, age.months, age.days], [23, 0, 0]);
  assert.equal(
    nextBirthday(dob, parseDate("2024-02-28")!).toISOString().slice(0, 10),
    "2024-02-29",
  );
  assert.equal(
    nextBirthday(dob, parseDate("2023-03-01")!).toISOString().slice(0, 10),
    "2024-02-29",
  );
  assert.equal(parseDate("1900-02-29"), undefined);
  assert.equal(parseDate("2025-04-31"), undefined);
  assert.equal(
    addMonths(parseDate("2024-01-31")!, 1).toISOString().slice(0, 10),
    "2024-02-29",
  );
  assert.throws(() => calendarBetween(cutoff, dob), /beginning date/);
});
test("eligibility has inclusive boundaries, explicit relaxation and invalid range checks", () => {
  assert.equal(eligible(18, 18, 27), true);
  assert.equal(eligible(27, 18, 27), true);
  assert.equal(eligible(28, 18, 27), false);
  assert.equal(eligible(30, 18, 27, 3), true);
  assert.equal(eligible(31, 18, 27, 3), false);
  assert.throws(() => eligible(18, 20, 19), /maximum/);
});
test("elapsed and inclusive day counts use real months", () => {
  const start = parseDate("2024-02-01")!,
    end = parseDate("2024-02-29")!;
  assert.equal(countDifference(start, end, false).totalDays, 28);
  const inclusive = countDifference(start, end, true);
  assert.deepEqual(
    [inclusive.totalDays, inclusive.totalMonths, inclusive.days],
    [29, 1, 0],
  );
  assert.equal(countDifference(start, start, true).totalDays, 1);
  assert.deepEqual(percentage(45, 60, 90), { value: 75, required: 54 });
  assert.throws(() => percentage(61, 60), /between zero/);
});
test("PDF range syntax and bounds", () => {
  assert.deepEqual(parseRanges("1–3, 5, 7-8", 8), [[1, 2, 3], [5], [7, 8]]);
  assert.throws(() => parseRanges("0,2", 8), /between page/);
  assert.throws(() => parseRanges("2,", 8), /Use a list/);
  assert.throws(() => parseRanges("8-7", 8), /in order/);
});
test("technical checks include exact bytes and leave missing and preferred rules unverified", () => {
  assert.deepEqual(
    imageChecks(
      "Photo",
      { width: 400, maxKB: 20, formats: ["image/jpeg"] },
      { width: 400, height: 300, size: 20481, mime: "image/jpeg" },
    ).map((c) => c.state),
    ["passed", "failed", "passed"],
  );
  assert.deepEqual(
    imageChecks(
      "Photo",
      { width: 200, preferredDimensions: true, minKB: 20 },
      { width: 201, height: 230, size: 20480, mime: "image/png" },
    ).map((c) => c.state),
    ["pending", "passed", "pending"],
  );
  assert.equal(imageChecks("Photo", { width: 400 })[0].state, "pending");
  assert.match(ruleError({ minKB: 40, maxKB: 20 }), /minimum/);
});
