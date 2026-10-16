import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import process from "node:process";

interface BrowserMetrics {
  workerMs: number;
  renderMs: number;
  maxHeartbeatGapMs: number;
  heartbeatCount: number;
  start: number;
  returned: number;
}
declare global { interface Window { qaMetrics: BrowserMetrics } }

test("measures actual production worker round trips and result rendering", async ({ page, browser }, testInfo) => {
  await page.addInitScript(() => {
    const metrics: BrowserMetrics = { workerMs: 0, renderMs: 0, maxHeartbeatGapMs: 0, heartbeatCount: 0, start: 0, returned: 0 };
    window.qaMetrics = metrics;
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (metrics.start && !metrics.renderMs) {
        metrics.maxHeartbeatGapMs = Math.max(metrics.maxHeartbeatGapMs, now - Math.max(last, metrics.start));
        metrics.heartbeatCount += 1;
      }
      last = now;
    }, 16);
    window.Worker = new Proxy(window.Worker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as Worker;
        let analysisId: number | undefined;
        const post = worker.postMessage.bind(worker);
        function observedPost(message: unknown, transfer: Transferable[]): void;
        function observedPost(message: unknown, options?: StructuredSerializeOptions): void;
        function observedPost(message: unknown, options: Transferable[] | StructuredSerializeOptions = []) {
          const request = message as { kind?: string; id?: number };
          if (request.kind === "analyze") { analysisId = request.id; metrics.start = performance.now(); }
          if (Array.isArray(options)) post(message, options);
          else post(message, options);
        }
        worker.postMessage = observedPost;
        worker.addEventListener("message", (event: MessageEvent<{ id: number; ok: boolean }>) => {
          if (analysisId !== undefined && event.data.id === analysisId && event.data.ok) {
            metrics.returned = performance.now();
            metrics.workerMs = metrics.returned - metrics.start;
          }
        });
        return worker;
      },
    });
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(() => {
        if (metrics.returned && !metrics.renderMs && document.querySelector(".analysis-root-card")) metrics.renderMs = performance.now() - metrics.returned;
      }).observe(document, { childList: true, subtree: true });
    });
  });
  const line = `info bundling src/feature.ts into a static output module ${"with local dependencies ".repeat(10)}\n`;
  const error = "src/report.ts:4:2 - error TS2322: Type 'string' is not assignable to type 'number'.";
  const measurements: { bytes: number; samples: (BrowserMetrics & { uiHeapAfterInputBytes?: number; uiHeapAfterResultBytes?: number })[] }[] = [];
  for (const bytes of [10 * 1024, 100 * 1024, 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024]) {
    const bodyBytes = bytes - error.length - 1;
    const log = `${line.repeat(Math.ceil(bodyBytes / line.length)).slice(0, bodyBytes)}\n${error}`;
    const samples: (BrowserMetrics & { uiHeapAfterInputBytes?: number; uiHeapAfterResultBytes?: number })[] = [];
    // One untimed warmup per size plus three independent page/session samples.
    for (let index = 0; index < 4; index += 1) {
      await page.goto("/app/new-analysis");
      await page.getByLabel(/Choose a file/).setInputFiles({ name: "synthetic-benchmark.log", mimeType: "text/plain", buffer: Buffer.from(log) });
      await expect(page.getByRole("textbox", { name: "Build log", exact: true })).toHaveValue(log);
      await expect(page.getByRole("button", { name: "Analyze log", exact: true })).toBeEnabled();
      if (bytes >= 5 * 1024 * 1024) await expect(page.getByRole("status").filter({ hasText: "Large log:" })).toBeVisible();
      const uiHeapAfterInputBytes = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize);
      await page.getByRole("button", { name: "Analyze log", exact: true }).click();
      await expect(page.locator(".analysis-root-card")).toContainText("TS2322");
      const metrics = await page.evaluate(() => window.qaMetrics);
      const uiHeapAfterResultBytes = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize);
      expect(metrics.workerMs).toBeGreaterThan(0);
      expect(metrics.renderMs).toBeGreaterThan(0);
      if (bytes >= 1024 * 1024) expect(metrics.heartbeatCount).toBeGreaterThan(1);
      if (index > 0) samples.push({ ...metrics, uiHeapAfterInputBytes, uiHeapAfterResultBytes });
    }
    measurements.push({ bytes, samples });
  }
  const result = { browser: browser.version(), protocol: "One warmup and three UI samples per size. Worker round trip includes structured cloning; render is message receipt to result DOM mutation. UI heap snapshots exclude worker/DOM/native allocations and are not peak memory. 16ms heartbeat gaps are observed, not device-wide latency guarantees.", measurements };
  const destination = testInfo.outputPath("measurements.json");
  await writeFile(destination, JSON.stringify(result, null, 2));
  await testInfo.attach("browser-performance", { path: destination, contentType: "application/json" });
  for (const measurement of measurements) process.stdout.write(`${JSON.stringify({ bytes: measurement.bytes, workerMs: measurement.samples.map((sample) => Math.round(sample.workerMs)), renderMs: measurement.samples.map((sample) => Math.round(sample.renderMs)), maxHeartbeatGapMs: Math.round(Math.max(...measurement.samples.map((sample) => sample.maxHeartbeatGapMs))) })}\n`);
});
