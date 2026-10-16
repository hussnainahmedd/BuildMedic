import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["release.spec.ts", "production-qa.spec.ts"],
  outputDir: ".cache/browser-results",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: ".cache/browser-results/results.json" }]],
  use: {
    baseURL: process.env.BUILDMEDIC_BASE_URL || "http://127.0.0.1:4183",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.BUILDMEDIC_BASE_URL ? undefined : {
    command: "npm start",
    url: "http://127.0.0.1:4183/health",
    reuseExistingServer: false,
    env: { HOST: "127.0.0.1", PORT: "4183" },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "firefox", use: { browserName: "firefox", viewport: { width: 1440, height: 1000 } } },
    { name: "webkit", use: { browserName: "webkit", viewport: { width: 1440, height: 1000 } } },
  ],
});
