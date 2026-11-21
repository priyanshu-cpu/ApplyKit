# ApplyKit

Everything you need before submitting an online application. ApplyKit is a static, browser-based toolkit for students, examination candidates, and job seekers. It runs without a backend, database, upload service, or accounts.

## What’s included

- Eight image tools for compression, resizing, signatures, passport photos, cropping, conversion, inspection, and watermarking.
- Eight PDF tools for compression, merging, splitting, page extraction, rotation, image-to-PDF conversion, PDF raster export, and inspection.
- A seven-step Application Document Assistant and a standalone technical validator.
- Five calculators for age, age eligibility, marks, CGPA conversion, and date differences.
- Tool search with Ctrl+K or Command+K, recent tool links, light and dark themes, help pages, and a static tool directory.

## Requirements and commands

Use Node 22.23.4 or later. The project uses Astro, React, TypeScript, Tailwind CSS, Canvas, pdf-lib, PDF.js, Lucide, and fflate. Font files, PDF workers, and PDF rendering resources ship with the site.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
npm run preview
```

Build the project before running the browser tests. Install the Playwright browsers where available.

```sh
npx playwright install chromium firefox webkit
npm run test:browser
```

Set `APPLYKIT_BROWSER_CHANNEL=chrome` or `msedge` to use an installed desktop browser, or set `APPLYKIT_BROWSER_ENGINE=firefox` or `webkit` to use a Playwright engine. WebKit coverage is separate from testing the shipping Safari browser. Set `APPLYKIT_TEST_URL` to test a running preview on another local port.

## Configure and deploy

1. Copy `.env.example` to `.env` and set `SITE_URL` to your public HTTPS origin. This enables canonical URLs, Open Graph share imagery, the sitemap, and the sitemap line in robots.txt. An unset URL keeps local builds usable with no example-domain SEO metadata.
2. Set `PUBLIC_CONTACT_EMAIL` to your support address. If Search Console asks for an HTML verification tag, copy its content string into `PUBLIC_SEARCH_CONSOLE_VERIFICATION`.
3. Run `npm ci` and `npm run build`. Publish the contents of `dist/` at your origin’s root. Serve directory indexes and configure the host to serve `404.html` on missing paths. An application runtime is unnecessary. Use `npm run build` as the build command and `dist` as the publish directory on static hosts such as Cloudflare Pages or Netlify.
4. Check your production origin, then submit `/sitemap-index.xml` via Search Console. ApplyKit includes `public/_headers` for hosts that support that convention. Replicate the headers in your chosen host’s configuration where applicable.

The base content security policy permits only same-origin services and local blob workers. It includes inline scripts and styles required by the Astro output and allows WebAssembly execution for local PDF decoding. Review your host’s CSP against the actual services you enable. Transmit the site over HTTPS.

## Add a verified examination preset

Add an entry to [src/config/exam-presets/index.ts](src/config/exam-presets/index.ts) with a stable ID, organization, notification identifier, official source, verification date, photo and signature rules, and any supporting files. Record preferred dimensions with `preferredDimensions: true` so the assistant can use them without treating them as strict checks. Use conditional and manual requirements where the notice calls for them. Review applicable amendments before enabling a preset, and label prior recruitment cycles as archived. Custom mode is always available.

The included IBPS example is the archived 2025 CRP-CSA-XV notice. Its live photo step happens on the official portal. The legacy CBSE Class X CCE conversion option links to CBSE’s published formula.

## Optional advertising and analytics

The default build loads neither service. For AdSense, set a real `PUBLIC_ADS_PUBLISHER` and the numeric slot IDs you intend to use. Set `PUBLIC_ADS_ENABLED=true`. Place your Google-certified consent management platform on the site where required and wire its resolved permission to `window.__applyKitAdsConsent` for initial page load and a `CustomEvent('applykit:ads-consent', { detail: true })` for changes. On revocation, send `detail: false` and keep the refreshed permission false in your provider. The ad script and ad slots activate only with that permission. Configure the CMP, deployment CSP, and any account-specific ads.txt entry using the provider’s instructions. Ads are labelled and positioned away from download buttons.

For Google Analytics, set `PUBLIC_ANALYTICS_ENABLED=true` and your `PUBLIC_GA_MEASUREMENT_ID`, then configure your deployment CSP to allow the Analytics endpoints you use. The site exposes an opt-in preference. The integration emits a page view with a query-free URL and omits file events such as names, download contents, and metadata. Verify your configured consent behavior and privacy policy on the production origin before enabling these services.

## Browser behavior and limits

- The browser determines JPEG and WebP encoding support. PNG is lossless. The compressor measures the actual output and can keep dimensions fixed. A target is a maximum measured in 1,024-byte KB (or 1,024²-byte MB). Some images cannot meet a target at fixed dimensions. Minimum sizes are tested independently.
- If your browser opens WebP images in its viewer or prompts for a file handler, use the ZIP download to save the WebP output.
- Image limits are 32 MB, 8,192 pixels on either side, and 24 megapixels. PDFs are limited to 64 MB per file and 500 pages. Batch tools accept up to 25 files or 150 MB.
- Single passport photo files use the metadata produced by the browser encoder. PPI controls the requested pixel dimensions and physical placement in A4 PDFs. Print sheets at 100%.
- PDF export supports ordinary static pages. Merge, split, page extraction and rotation create new PDFs from page content. Page annotations, links, interactive fields, digital signatures, and original catalog metadata may not carry over. Flat PDF pages are best for application submissions. Locked PDFs must be unlocked first.
- Each calculator explains its conventions. Age eligibility compares whole completed years with inclusive bounds and applies only user-entered relaxation. A technical pass is one input to an application review.
- PDF Compressor supports text-preserving optimization, scan compression and a maximum size in decimal KB or MB. Target mode checks the original and compact PDF before trying JPEG page profiles from 72 to 220 PPI. It measures the finished PDF, reports missed limits, and offers a page-by-page preview of the download. Image-only output removes searchable text and interactivity. Rewriting a PDF invalidates digital signatures.
- File operations are local and resource use depends on the device. Large batches are best split into smaller groups on mobile.

## Sources for bundled rules

- [IBPS CRP-CSA-XV official notification and scanning guidelines, Annexure IV](https://www.ibps.in/wp-content/uploads/DetailedNotification_CRP_CSA_XV_Final_for_Website_12.9.2025.pdf)
- [CBSE Class X legacy CCE FAQ, question 9](https://www.cbse.gov.in/helpline/FAQs.pdf)
- [Google AdSense consent management requirements for publishers](https://support.google.com/adsense/answer/13554116)
