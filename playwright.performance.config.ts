import { defineConfig } from "@playwright/test";
import release from "./playwright.config";

export default defineConfig({
  ...release,
  testMatch: "performance.spec.ts",
  timeout: 240_000,
  // DOM snapshots/traces can serialize multi-megabyte textarea contents and
  // materially distort the UI/worker workload being measured.
  use: { ...release.use, trace: "off", screenshot: "off" },
  outputDir: ".cache/browser-performance",
  reporter: [["list"], ["json", { outputFile: ".cache/browser-performance/results.json" }]],
  projects: release.projects?.filter((project) => project.name === "chromium"),
});
