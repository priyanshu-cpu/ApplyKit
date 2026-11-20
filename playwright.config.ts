import { defineConfig } from "@playwright/test";

const channel = process.env.APPLYKIT_BROWSER_CHANNEL;
const browser = process.env.APPLYKIT_BROWSER_ENGINE as
  "chromium" | "firefox" | "webkit" | undefined;
const baseURL = process.env.APPLYKIT_TEST_URL || "http://127.0.0.1:4322";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 2,
  use: {
    baseURL,
    browserName: browser || "chromium",
    channel,
    trace: "retain-on-failure",
  },
  webServer: process.env.APPLYKIT_TEST_URL
    ? undefined
    : {
        command: "node tests/serve.mjs",
        url: baseURL,
        timeout: 45_000,
        reuseExistingServer: !process.env.CI,
      },
});
