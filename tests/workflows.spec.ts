import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { tools } from "../src/config/tools";
import { readFile } from "node:fs/promises";

async function image(
  page: Page,
  width = 600,
  height = 400,
  transparent = false,
) {
  const url = await page.evaluate(
    ({ width, height, transparent }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      if (transparent) {
        ctx.fillStyle = "#3344ff";
        ctx.fillRect(width / 4, height / 4, width / 2, height / 2);
      } else {
        let seed = 53;
        const data = ctx.createImageData(width, height);
        for (let i = 0; i < data.data.length; i += 4) {
          for (let j = 0; j < 3; j++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            data.data[i + j] = seed >>> 24;
          }
          data.data[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
      }
      return canvas.toDataURL("image/png");
    },
    { width, height, transparent },
  );
  return {
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from(url.split(",")[1], "base64"),
  };
}
async function pdf(widths = [320, 440, 510]) {
  const doc = await PDFDocument.create();
  doc.setTitle("Application scans");
  doc.setAuthor("ApplyKit tests");
  for (const width of widths) {
    const p = doc.addPage([width, 620]);
    p.drawText("Page " + width, { x: 20, y: 550 });
  }
  return {
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await doc.save()),
  };
}
async function download(page: Page, button: string) {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const file = await wait;
  return readFile((await file.path())!);
}
async function go(page: Page, url: string) {
  await page.goto(url);
  await expect(
    page.locator("astro-island[ssr], [inert].workspace, [inert].wizard-box"),
  ).toHaveCount(0);
}
test("homepage links, keyboard search, recent tools, dark mode and mobile navigation", async ({
  page,
  request,
}) => {
  await go(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Free PDF compressor",
  );
  const hrefs = await page
    .locator('a[href^="/"]')
    .evaluateAll((a) => [
      ...new Set(a.map((link) => (link as HTMLAnchorElement).pathname)),
    ]);
  for (const href of [...new Set([...hrefs, ...tools.map((tool) => tool.url)])])
    expect((await request.get(href)).ok(), href).toBeTruthy();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Search ApplyKit tools" });
  await expect(search).toBeVisible();
  await search.getByRole("searchbox").fill("signature");
  await search.getByRole("button", { name: "Image Tools" }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/signature-resizer/);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Search tools" }).click();
  await expect(search.getByText("Recently used tools")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const menu = page.getByRole("dialog", { name: "Navigation" });
  await expect(menu).toBeVisible();
  await menu.getByText("PDF Tools", { exact: true }).click();
  await menu.getByRole("link", { name: "PDF Merger" }).click();
  await expect(
    page.getByRole("heading", { name: "PDF Merger", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
test("compressor validates actual output bytes and fixed dimensions; handles invalid files", async ({
  page,
}) => {
  await go(page, "/image-tools/image-compressor/");
  const picker = page.locator("input[type=file]");
  await picker.setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toContainText("Choose a supported");
  await picker.setInputFiles(await image(page));
  await page.getByRole("button", { name: "50 KB", exact: true }).click();
  await expect(page.getByText("Output dimensions")).toBeVisible();
  await expect(page.getByText("600 × 400 px", { exact: true })).toHaveCount(2);
  const output = await download(page, "Download file");
  expect(output.length).toBeLessThanOrEqual(50 * 1024);
  expect(output[0]).toBe(255);
  await page.getByLabel("Output format").selectOption("image/png");
  await page.getByRole("button", { name: "10 KB", exact: true }).click();
  await expect(page.getByText(/smallest result is still over/)).toBeVisible();
  await page.getByText("Advanced settings", { exact: true }).click();
  await page.getByLabel("Allow smaller dimensions").check();
  await expect(page.getByText(/smallest result is still over/)).toBeHidden();
  const reduced = await download(page, "Download file");
  expect(reduced.length).toBeLessThanOrEqual(10 * 1024);
  expect(reduced.readUInt32BE(16)).toBeLessThan(600);
});
test("batch converter, ZIP and JPEG background fill", async ({ page }) => {
  await go(page, "/image-tools/image-converter/");
  const source = await image(page, 80, 60, true);
  await page
    .locator("input[type=file]")
    .setInputFiles([source, { ...source, name: "sample-two.png" }]);
  await page.getByLabel("Output format").selectOption("image/jpeg");
  await page.getByRole("button", { name: "Convert images" }).click();
  const jpg = await download(page, "Download sample-converted.jpg");
  const pixel = await page.evaluate(
    async (data: number[]) => {
      const bmp = await createImageBitmap(
        new Blob([new Uint8Array(data)], { type: "image/jpeg" }),
      );
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      return [...ctx.getImageData(0, 0, 1, 1).data];
    },
    [...jpg],
  );
  expect(pixel).toEqual([255, 255, 255, 255]);
  const zip = unzipSync(await download(page, "Download all as ZIP"));
  expect(Object.keys(zip)).toEqual([
    "sample-converted.jpg",
    "sample-two-converted.jpg",
  ]);
});
test("resizer, cropper, checker, signature, watermark and A4 photo sheet", async ({
  page,
}) => {
  await go(page, "/image-tools/image-resizer/");
  const src = await image(page, 400, 300, true);
  await page.locator("input[type=file]").setInputFiles(src);
  await expect(page.getByLabel("Width (px)")).toHaveValue("400");
  await page.getByLabel("Width (px)").fill("200");
  await expect(page.getByLabel("Height (px)")).toHaveValue("150");
  expect((await download(page, "Download file")).length).toBeGreaterThan(100);
  await go(page, "/image-tools/image-cropper/");
  await page.locator("input[type=file]").setInputFiles(src);
  await page.getByLabel("Crop aspect ratio").selectOption("1:1");
  await expect(page.getByText("300 × 300 px")).toBeVisible();
  await page.getByRole("button", { name: "Rotate 90°" }).click();
  await expect(page.getByRole("group", { name: /Crop frame/ })).toBeVisible();
  await page
    .getByRole("group", { name: /Crop frame/ })
    .press("Shift+ArrowLeft");
  await expect(
    page.getByRole("button", { name: "Download file" }),
  ).toBeVisible();
  await go(page, "/image-tools/image-dimension-checker/");
  await page.locator("input[type=file]").setInputFiles(src);
  await page.getByLabel("Required width").fill("400");
  await expect(page.getByText("Passed", { exact: true })).toBeVisible();
  await go(page, "/image-tools/signature-resizer/");
  await page.locator("input[type=file]").setInputFiles(src);
  await expect(page.getByText("Passed", { exact: true })).toHaveCount(3);
  await go(page, "/image-tools/image-watermark/");
  await page.locator("input[type=file]").setInputFiles(src);
  const before = await download(page, "Download file");
  await page.getByLabel("Watermark text").fill("Sample");
  await expect(
    page.getByRole("status").filter({ hasText: "Updating preview…" }),
  ).toBeHidden();
  const marked = await download(page, "Download file");
  expect(marked.equals(before)).toBe(false);
  await go(page, "/image-tools/passport-photo-maker/");
  await page.locator("input[type=file]").setInputFiles(src);
  await expect(page.getByText("413 × 531 px")).toBeVisible();
  const sheet = await PDFDocument.load(await download(page, "Download A4 PDF"));
  expect(sheet.getPage(0).getWidth()).toBeCloseTo(595.276, 1);
  expect(sheet.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
});
test("PDF merge, split ranges, extraction and rotation preserve intended order", async ({
  page,
}) => {
  await go(page, "/pdf-tools/merge-pdf/");
  const a = await pdf([320, 440]),
    b = await pdf([510]);
  await page
    .locator("input[type=file]")
    .setInputFiles([a, { ...b, name: "second.pdf" }]);
  await page.getByRole("button", { name: "Move file 2 up" }).click();
  await page.getByRole("button", { name: "Merge PDFs" }).click();
  const merged = await PDFDocument.load(await download(page, "Download PDF"));
  expect(merged.getPages().map((p) => p.getWidth())).toEqual([510, 320, 440]);
  const three = await pdf();
  await go(page, "/pdf-tools/split-pdf/");
  await page.locator("input[type=file]").setInputFiles(three);
  await expect(page.getByAltText("Preview of page 1")).toBeVisible();
  await page.getByLabel("Page ranges").fill("1–2, 3");
  await page.getByRole("button", { name: "Split PDF", exact: true }).click();
  const split = unzipSync(await download(page, "Download all as ZIP"));
  expect(
    (await PDFDocument.load(split["sample-split-1.pdf"])).getPageCount(),
  ).toBe(2);
  expect(
    (await PDFDocument.load(split["sample-split-2.pdf"])).getPage(0).getWidth(),
  ).toBe(510);
  await go(page, "/pdf-tools/extract-pdf-pages/");
  await page.locator("input[type=file]").setInputFiles(three);
  await page.getByRole("checkbox", { name: "Page 2" }).check();
  await page.getByRole("button", { name: "Extract selected pages" }).click();
  const excerpt = await PDFDocument.load(await download(page, "Download PDF"));
  expect(excerpt.getPages().map((p) => p.getWidth())).toEqual([440]);
  await go(page, "/pdf-tools/rotate-pdf/");
  await page.locator("input[type=file]").setInputFiles(three);
  await page
    .getByRole("button", { name: "Rotate page 3", exact: true })
    .click();
  await page.getByRole("button", { name: "Save rotated PDF" }).click();
  const rotated = await PDFDocument.load(await download(page, "Download PDF"));
  expect(rotated.getPages().map((p) => p.getRotation().angle)).toEqual([
    0, 0, 90,
  ]);
});
test("PDF compressor reduces text and scan files and handles an optimized PDF", async ({ page }) => {
  await go(page, "/pdf-tools/compress-pdf/");
  const input = page.locator("input[type=file]");
  const source = await PDFDocument.create();
  const scan = await source.embedPng((await image(page)).buffer);
  const cover = source.addPage([320, 220]);
  cover.drawText("Application cover");
  source.addPage([600, 400]).drawImage(scan, { width: 600, height: 400 });
  const buffer = Buffer.from(await source.save({ useObjectStreams: false }));
  await input.setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer });
  const run = page.getByRole("button", { name: "Compress PDF", exact: true });
  await run.click();
  const compact = await download(page, "Download PDF");
  expect(compact.length).toBeLessThan(buffer.length);
  expect((await PDFDocument.load(compact)).getPages().map(p => p.getWidth())).toEqual([320, 600]);
  await page.getByLabel("Compression mode").selectOption("scan");
  await run.click();
  const smaller = await download(page, "Download PDF");
  expect(smaller.length).toBeLessThan(compact.length);
  expect((await PDFDocument.load(smaller)).getPages().map(p => p.getSize())).toEqual([
    { width: 320, height: 220 }, { width: 600, height: 400 },
  ]);
  await page.getByLabel("Compression mode").selectOption("target");
  const limit = page.getByLabel("Maximum file size");
  await limit.fill("0");
  await expect(run).toBeDisabled();
  await page.getByLabel("Size unit").selectOption("MB");
  await limit.fill(String(buffer.length / 1000000 + 0.001));
  await run.click();
  await expect(page.getByText(/original already fits/)).toBeVisible();
  await page.getByLabel("Size unit").selectOption("KB");
  await limit.fill(String((buffer.length - 1) / 1000));
  await run.click();
  await expect(page.getByText(/Target met. Text and image quality preserved/)).toBeVisible();
  await limit.fill("60");
  await run.click();
  await expect(page.getByText(/Target met. Image-only PDF/)).toBeVisible();
  const fitted = await download(page, "Download PDF");
  expect(fitted.length).toBeLessThanOrEqual(60000);
  expect((await PDFDocument.load(fitted)).getPageCount()).toBe(2);
  await page.getByRole("button", { name: "Preview compressed PDF" }).click();
  await expect(page.getByRole("img", { name: "Compressed PDF page 1" })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("img", { name: "Compressed PDF page 2" })).toBeVisible();
  await limit.fill("1");
  await run.click();
  await expect(page.getByText(/Target missed/)).toBeVisible();
  expect((await download(page, "Download PDF")).length).toBeGreaterThan(1000);
  await page.getByLabel("Compression mode").selectOption("text");
  await input.setInputFiles({ name: "compact.pdf", mimeType: "application/pdf", buffer: compact });
  await run.click();
  await expect(page.getByText(/could not make the PDF smaller/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
});

test("PDF render, information, image import and malformed PDF handling", async ({
  page,
}) => {
  await go(page, "/pdf-tools/pdf-information/");
  const source = await pdf([300]);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 invalid"),
    });
  await expect(page.getByRole("alert")).toContainText(
    "This PDF cannot be opened",
  );
  await page.locator("input[type=file]").setInputFiles(source);
  await expect(page.getByText("ApplyKit tests", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "300.00" })).toBeVisible();
  await go(page, "/pdf-tools/pdf-to-image/");
  await page.locator("input[type=file]").setInputFiles(source);
  await page.getByRole("checkbox", { name: "Page 1" }).check();
  await page.getByRole("button", { name: "Render selected pages" }).click();
  const rendered = await download(page, "Download file");
  expect(rendered.readUInt32BE(16)).toBe(600);
  expect(rendered.readUInt32BE(20)).toBe(1240);
  await go(page, "/pdf-tools/image-to-pdf/");
  await page
    .locator("input[type=file]")
    .setInputFiles(await image(page, 180, 120));
  await page.getByLabel("Orientation").selectOption("landscape");
  await page.getByLabel("Image fit").selectOption("crop");
  await page.getByRole("button", { name: "Generate PDF" }).click();
  const generated = await PDFDocument.load(
    await download(page, "Download PDF"),
  );
  expect(generated.getPage(0).getHeight()).toBeCloseTo(595.276, 1);
});
test("wizard prepares both images, validates and downloads the ZIP", async ({
  page,
}) => {
  await go(page, "/exam-tools/document-assistant/");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Photograph width (px)").fill("200");
  await page.getByLabel("Photograph height (px)").fill("240");
  await page.getByLabel("Photograph maximum size").fill("80");
  await page
    .getByRole("group", { name: "Photograph", exact: true })
    .getByLabel("JPG")
    .check();
  await page.getByLabel("Signature width (px)").fill("140");
  await page.getByLabel("Signature height (px)").fill("60");
  await page.getByLabel("Signature maximum size").fill("25");
  await page
    .getByRole("group", { name: "Signature", exact: true })
    .getByLabel("JPG")
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const img = await image(page, 300, 300, true);
  await page.locator("input[type=file]").setInputFiles(img);
  await page.getByRole("button", { name: "Prepare photograph" }).click();
  await expect(page.getByText("Passed", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(img);
  await page.getByRole("button", { name: "Prepare signature" }).click();
  await expect(page.getByText("Passed", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(await pdf());
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Passed", { exact: true })).toHaveCount(6);
  await page.getByRole("button", { name: "Go to downloads" }).click();
  const zip = unzipSync(await download(page, "Download all as ZIP"));
  expect(Object.keys(zip)).toEqual([
    "application-photograph.jpg",
    "application-signature.jpg",
    "sample.pdf",
  ]);
  await go(page, "/exam-tools/document-validator/");
  await page.getByLabel("Photograph width (px)").fill("300");
  await page.locator("input[type=file]").first().setInputFiles(img);
  await expect(page.getByText("Passed", { exact: true })).toHaveCount(1);
});
test("calculator boundaries and all calculator workflows", async ({ page }) => {
  await go(page, "/calculators/age-calculator/");
  await page.getByLabel("Date of birth").fill("2000-02-29");
  await page.getByLabel("Age as of").fill("2023-02-28");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("23 years, 0 months, 0 days")).toBeVisible();
  await go(page, "/calculators/age-eligibility-calculator/");
  await page.getByLabel("Date of birth").fill("2000-02-29");
  await page.getByLabel("Exam cutoff date").fill("2023-02-28");
  await page.getByLabel("Minimum age").fill("18");
  await page.getByLabel("Maximum age").fill("22");
  await page.getByLabel("Age relaxation").fill("1");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("Eligible for this age range")).toBeVisible();
  await go(page, "/calculators/percentage-calculator/");
  await page.getByLabel("Obtained marks").fill("60");
  await page.getByLabel("Total marks").fill("80");
  await page.getByLabel("Target percentage").fill("90");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("75%", { exact: true })).toBeVisible();
  await expect(page.getByText("72 marks", { exact: true })).toBeVisible();
  await go(page, "/calculators/cgpa-to-percentage/");
  await page.getByLabel("Conversion formula").selectOption("cbse");
  await page.getByLabel("CGPA", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("76%", { exact: true })).toBeVisible();
  await go(page, "/calculators/date-difference-calculator/");
  await page.getByLabel("Start date").fill("2024-02-01");
  await page.getByLabel("End date", { exact: true }).fill("2024-02-29");
  await page.getByLabel("Include the end date").check();
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("29 days", { exact: true })).toBeVisible();
});

test("clipboard intake, WebP export, and clearing temporary files on page leave", async ({
  page,
}) => {
  await go(page, "/image-tools/image-converter/");
  const source = await image(page, 80, 60, true);
  await page.evaluate((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    });
    // Firefox may discard clipboard data supplied to a synthetic event.
    if (!event.clipboardData?.files.length) {
      Object.defineProperty(event, "clipboardData", { value: transfer });
    }
    document.body.dispatchEvent(event);
  }, [...source.buffer]);
  await expect(page.getByText("pasted.png", { exact: true })).toBeVisible();
  const supportsWebP = await page.evaluate(() =>
    document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp"),
  );
  await page.getByLabel("Output format").selectOption("image/webp");
  const convert = page.getByRole("button", { name: "Convert images" });
  await convert.click();
  if (supportsWebP) {
    const preview = page.getByAltText("Processed image", { exact: true });
    const source = await preview.getAttribute("src");
    const signature = await page.evaluate(async (url) => {
      const data = await (await fetch(url)).arrayBuffer();
      return new TextDecoder().decode(new Uint8Array(data, 8, 4));
    }, source!);
    expect(signature).toBe("WEBP");
    const bundle = unzipSync(await download(page, "Download all as ZIP"));
    expect(new TextDecoder().decode(bundle["pasted-converted.webp"].slice(8, 12))).toBe("WEBP");
  } else {
    await expect(page.getByRole("alert")).toContainText("cannot encode WEBP");
  }
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await expect(page.getByText("pasted.png", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Download file" })).toBeHidden();
});

test("sourced preset and embedded supporting-file tools", async ({ page }) => {
  await go(page, "/exam-tools/document-assistant/");
  const preset = page.getByLabel("Examination or custom requirements");
  await preset.selectOption("ibps-csa-xv-2025");
  const continueStep = page.getByRole("button", { name: "Continue", exact: true });
  await continueStep.click();
  await expect(page.getByRole("link", { name: "Read the official notification" }))
    .toHaveAttribute("href", /^https:\/\/www\.ibps\.in\//);
  await expect(page.getByText(/200 × 230 px \(preferred\)/)).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await preset.selectOption("");
  for (let step = 0; step < 4; step++) await continueStep.click();
  const tools = page.getByLabel("Prepare a supporting file");
  const smallImage = await image(page, 100, 80, true);
  await tools.selectOption("image-compressor");
  await page.locator("input[type=file]").first().setInputFiles(smallImage);
  await page.getByRole("button", { name: "Add to supporting files" }).click();
  await expect(page.getByText("sample-applykit.jpg", { exact: true })).toBeVisible();
  await tools.selectOption("image-to-pdf");
  await page.locator("input[type=file]").first().setInputFiles(smallImage);
  await page.getByRole("button", { name: "Generate PDF" }).click();
  await expect(page.getByText("applykit-images.pdf", { exact: true })).toBeVisible();
  await continueStep.click();
  await page.getByRole("button", { name: "Go to downloads" }).click();
  expect(Object.keys(unzipSync(await download(page, "Download all as ZIP")))).toEqual([
    "sample-applykit.jpg", "applykit-images.pdf",
  ]);
});
