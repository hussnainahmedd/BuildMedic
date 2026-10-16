import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";

const LOG = "$ npm run build\nsrc/example.ts:4:9 - error TS2322: incompatible types\ntoken=qa-synthetic-secret";

async function navigate(page: Page, name: string) {
  const open = page.getByRole("button", { name: "Open sidebar", exact: true });
  if (await open.isVisible()) await open.click();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: new RegExp(`^${name}`) }).click();
}

async function analyze(page: Page, log = LOG) {
  await page.goto("/app/new-analysis");
  await page.getByRole("textbox", { name: "Build log", exact: true }).fill(log);
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/analysis$/);
}

test("production module worker runs diagnostics, evidence, reports and private history", async ({ page, browser }, testInfo) => {
  const workers: string[] = [];
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = new URL(testInfo.project.use.baseURL!).origin;
  page.on("request", (request) => { if (new URL(request.url()).origin !== origin) externalRequests.push(request.url()); });
  await analyze(page);
  expect(workers.some((url) => /\/assets\/analysis.worker-.*\.js$/.test(url))).toBe(true);
  await expect(page.locator(".analysis-root-card")).toContainText("TS2322");
  await expect(page.locator(".root-card-footer")).toContainText("line 2");
  await expect(page.locator(".finding-card").first()).toContainText("error");
  await expect(page.locator(".finding-card").first()).toContainText("Inspect the reported type or compiler error");
  await page.screenshot({ path: testInfo.outputPath("desktop-analysis.png"), fullPage: true });
  await navigate(page, "Log viewer");
  await expect(page.getByRole("region", { name: "Build log lines" })).toContainText("[REDACTED SECRET]");
  await expect(page.getByRole("region", { name: "Build log lines" })).not.toContainText("qa-synthetic-secret");
  await navigate(page, "Reports");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("buildmedic-report.txt");
  const stream = await download.createReadStream();
  let report = "";
  for await (const chunk of stream!) report += chunk.toString();
  expect(report).toContain("TS2322");
  expect(report).toContain("No build was executed.");
  expect(report).not.toContain("qa-synthetic-secret");
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain("qa-synthetic-secret");
  expect(storage).not.toContain("TS2322");
  await navigate(page, "History");
  await page.getByRole("button", { name: /^Pasted build log/ }).click();
  await expect(page).toHaveURL(/\/app\/analysis$/);
  await navigate(page, "History");
  await page.getByRole("button", { name: "Clear history" }).click();
  await navigate(page, "New analysis");
  await expect(page.getByRole("textbox", { name: "Build log", exact: true })).toHaveValue("");
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  await testInfo.attach("browser-runtime", { body: JSON.stringify({ browser: browser.version(), workers, externalRequests, errors }), contentType: "application/json" });
});

test("dialog focus, command arrows and system theme follow actual browser behavior", async ({ page }, testInfo) => {
  await page.goto("/app/settings");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "System Follow browser preference" }).click();
  await testInfo.attach("theme-emulation", { body: JSON.stringify(await page.evaluate(() => ({ light: matchMedia("(prefers-color-scheme: light)").matches, dark: matchMedia("(prefers-color-scheme: dark)").matches, theme: document.documentElement.dataset.theme, preferences: localStorage.getItem("buildmedic.preferences.v1") }))), contentType: "application/json" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const trigger = page.getByRole("button", { name: /Search workspace/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Command center" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /Start a new analysis/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\/new-analysis$/);
});

for (const scheme of ["dark", "light"] as const) {
test(`automated WCAG audit of key ${scheme} surfaces`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  async function audit(label: string) {
    // Audit the settled surface, not a blend of old/new theme colors or a
    // partially transparent entrance animation. Fast Linux runners otherwise
    // snapshot these finite transitions before they finish. Infinite decorative
    // animations are deliberately not awaited; no axe rule is disabled.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const finite = document.getAnimations().filter((animation) => {
        const endTime = animation.effect?.getComputedTiming().endTime;
        return typeof endTime === "number" && Number.isFinite(endTime);
      });
      await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    await testInfo.attach(`axe-${label}`, { body: JSON.stringify(result.violations), contentType: "application/json" });
    expect.soft(result.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), label).toEqual([]);
  }
    for (const route of ["/", "/app/new-analysis", "/app/settings", "/app/reports"]) {
      await page.goto(route);
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
      await audit(`${scheme}-${route.replaceAll("/", "_")}`);
    }
    await analyze(page);
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await audit(`${scheme}-analysis`);
    for (const name of ["Overview", "Log viewer", "Verification", "History", "Reports", "Help"]) {
      await navigate(page, name);
      if (name === "Log viewer") await expect(page.locator(".log-code-line").first()).toBeVisible();
      await audit(`${scheme}-${name}`);
    }
    await page.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
    await audit(`${scheme}-dialog`);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/new-analysis");
    await page.emulateMedia({ colorScheme: scheme });
    await audit(`${scheme}-mobile-input`);
    await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
    await audit(`${scheme}-mobile-sidebar`);
});
}

test("npm, pnpm, yarn and dependency workflows return evidence-backed severity and guidance", async ({ page }) => {
  const cases = [
    { log: "npm install\nnpm error code ERESOLVE\nnpm error unable to resolve dependency tree", rule: "dependencies/peer-version-conflict", severity: "error", guidance: "Align dependency versions" },
    { log: "pnpm install --frozen-lockfile\nERR_PNPM_OUTDATED_LOCKFILE Cannot install with frozen lockfile", rule: "lockfile/mismatch", severity: "error", guidance: "Synchronize the lockfile" },
    { log: "yarn install --immutable\nYN0028 The lockfile would have been modified by this install", rule: "lockfile/mismatch", severity: "error", guidance: "Synchronize the lockfile" },
    { log: "yarn install\nYN0060 peer dependency is incompatible", rule: "dependencies/peer-version-conflict", severity: "warning", guidance: "Align dependency versions" },
    { log: "npm run build\nsrc/index.ts:3:1 - error TS2307: Cannot find module 'example-package'", rule: "dependencies/missing-module", severity: "error", guidance: "Restore the missing dependency" },
    { log: "npm run build\nsh: 1: vite: not found", rule: "tooling/missing-cli", severity: "error", guidance: "Install or expose the requested CLI" },
  ];
  for (const item of cases) {
    await analyze(page, item.log);
    await expect(page.locator(".finding-card").first()).toContainText(item.rule);
    await expect(page.locator(".finding-card .badge").first()).toHaveText(item.severity);
    await expect(page.locator(".root-card-footer")).toContainText("line 2");
    await expect(page.locator(".analysis-next-card")).toContainText(item.guidance);
  }
});

test("file picker and real DataTransfer drop validate, recover and analyze", async ({ page }) => {
  await page.goto("/app/new-analysis");
  const input = page.getByLabel(/Choose a file/);
  const log = page.getByRole("textbox", { name: "Build log", exact: true });
  await input.setInputFiles({ name: "build.log", mimeType: "text/plain", buffer: Buffer.from(LOG) });
  await expect(log).toHaveValue(LOG);
  await expect(page.getByRole("button", { name: "Upload file", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/analysis$/);
  await navigate(page, "New analysis");
  for (const file of [
    { name: "image.png", mimeType: "image/png", buffer: Buffer.from("not a log"), message: "Choose a readable text log file." },
    { name: "binary.log", mimeType: "text/plain", buffer: Buffer.from("bad\0bytes"), message: "binary or unreadable" },
    { name: "empty.log", mimeType: "text/plain", buffer: Buffer.alloc(0), message: "Paste a build log" },
    { name: "oversized.log", mimeType: "text/plain", buffer: Buffer.alloc(25 * 1024 * 1024 + 1, 97), message: "This file is too large" },
  ]) {
    await input.setInputFiles(file);
    await expect(page.getByRole("alert")).toContainText(file.message);
    await expect(log).toHaveValue(LOG);
    await expect(input).toHaveAttribute("aria-invalid", "true");
  }
  const droppedLog = "pnpm run build\nERR_PNPM_NO_SCRIPT Missing script: build";
  const transfer = await page.evaluateHandle((text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], "dropped.log", { type: "text/plain" }));
    return data;
  }, droppedLog);
  await page.locator(".drop-zone").dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(log).toHaveValue(droppedLog);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page.locator(".finding-card").first()).toContainText("package-script/missing");
});

test("empty, malformed, unknown and unsupported input remain explicit and editable", async ({ page }) => {
  await page.goto("/app/new-analysis");
  const log = page.getByRole("textbox", { name: "Build log", exact: true });
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(log).toHaveAttribute("aria-invalid", "true");
  await expect(log).toBeFocused();
  await log.fill("a".repeat(16_385));
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Log line 1 is too long");
  for (const text of ["custom bundler failed with unsupported signal XYZ", "{malformed JSON, not required to parse as JSON}", "Traceback (most recent call last):\nValueError: Python-specific failure"]) {
    await log.fill(text);
    await page.getByRole("button", { name: "Analyze log", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No supported diagnostic matched", exact: true })).toBeVisible();
    await navigate(page, "New analysis");
  }
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(log).toHaveValue("");
});

test("verification labels persistent, changed and ambiguous reruns without claiming a build pass", async ({ page }) => {
  // No redacted identity in this baseline; secret-bearing identity stays uncertain.
  const baseline = "src/example.ts:4:9 - error TS2322: incompatible types";
  await analyze(page, baseline);
  await navigate(page, "Verification");
  const rerun = page.getByRole("textbox", { name: "Rerun build log", exact: true });
  await page.getByRole("button", { name: "Compare findings", exact: true }).first().click();
  await expect(rerun).toHaveAttribute("aria-invalid", "true");
  await rerun.fill(baseline);
  await rerun.press("Control+Enter");
  await expect(page.locator(".verification-result-card")).toContainText("persistent");
  await expect(page.locator(".verification-result-card")).toContainText("The same diagnostics remain.");
  await rerun.fill(baseline.replace("TS2322", "TS2339"));
  await expect(page.getByText("Waiting for a rerun", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compare findings", exact: true }).first().click();
  await expect(page.locator(".verification-result-card")).toContainText("The diagnostic set changed");
  await expect(page.locator(".verification-result-card")).toContainText("resolved");
  await expect(page.locator(".verification-result-card")).toContainText("new");
  await rerun.fill("Build completed successfully.");
  await rerun.press("Control+Enter");
  await expect(page.locator(".verification-result-card")).toContainText("Fewer matching diagnostics");
  await expect(page.locator(".verification-result-card")).toContainText("resolved");
  await expect(page.locator(".verification-result-card")).toContainText("does not prove");
  await rerun.fill("unknown rerun, no reliable completion marker");
  await rerun.press("Control+Enter");
  await expect(page.locator(".verification-result-card")).toContainText("uncertain");
  await expect(page.locator(".verification-result-card")).toContainText("No build outcome inferred");
});

test("cancellation terminates stalled analysis/comparison and retry runs the genuine worker", async ({ page }) => {
  // Inject a stalled transport only for deterministic cancellation; other tests
  // separately prove execution of the real emitted production worker.
  const stall = () => page.route("**/assets/analysis.worker-*.js", (route) => route.fulfill({ contentType: "text/javascript", body: "self.onmessage = () => {};" }));
  await stall();
  await page.goto("/app/new-analysis");
  const input = page.getByRole("textbox", { name: "Build log", exact: true });
  await input.fill(LOG);
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(input).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(input).toHaveValue(LOG);
  await expect(input).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText("Analysis canceled");
  await page.unroute("**/assets/analysis.worker-*.js");
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/analysis$/);
  await navigate(page, "Verification");
  await page.getByRole("textbox", { name: "Rerun build log", exact: true }).fill(LOG);
  await stall();
  await page.getByRole("button", { name: "Compare findings", exact: true }).first().click();
  await page.getByRole("button", { name: "Cancel comparison", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rerun build log", exact: true })).toHaveValue(LOG);
  await expect(page.getByRole("alert")).toContainText("Comparison canceled");
  await page.unroute("**/assets/analysis.worker-*.js");
  await page.getByRole("button", { name: "Compare findings", exact: true }).first().click();
  await expect(page.locator(".verification-result-card")).toBeVisible();
});

test("search, filters, paging, report tabs and stored settings control real results", async ({ page }) => {
  await analyze(page, `${Array.from({ length: 220 }, (_, index) => `info compiling module ${index}`).join("\n")}\n${LOG}\nYN0060 unmet peer dependency`);
  const search = page.getByRole("textbox", { name: "Search findings", exact: true });
  await search.fill("not-a-real-finding");
  await expect(page.getByText("Nothing in this filter", { exact: true })).toBeVisible();
  await search.fill("TS2322");
  await expect(page.locator(".finding-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear finding search" }).click();
  await page.getByRole("group", { name: "Filter findings" }).getByRole("button", { name: /^warning/ }).click();
  await expect(page.locator(".finding-card")).toHaveCount(1);
  await page.getByLabel("Sort findings").selectOption("line");
  await navigate(page, "Log viewer");
  await expect(page.getByRole("group", { name: "Log pages" })).toContainText("Page 1 of 2");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("group", { name: "Log pages" })).toContainText("Page 2 of 2");
  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: "Search log", exact: true })).toBeFocused();
  await page.getByRole("textbox", { name: "Search log", exact: true }).fill("TS2322");
  await expect(page.locator(".log-code-line")).toHaveCount(1);
  await expect(page.locator("mark")).toHaveText("TS2322");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByRole("button", { name: "Errors only", exact: true }).click();
  await expect(page.locator(".log-code-line")).toHaveCount(1);
  await navigate(page, "Settings");
  await page.getByRole("button", { name: "Compact", exact: true }).click();
  await page.getByRole("checkbox", { name: /Show line numbers/ }).uncheck();
  await page.getByRole("checkbox", { name: /Reduce motion/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await navigate(page, "Log viewer");
  await expect(page.locator(".log-code-line").first()).toBeVisible();
  await expect(page.locator(".log-line-number")).toHaveCount(0);
  await navigate(page, "Reports");
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Evidence", exact: true })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Evidence", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.getByRole("heading", { name: "No analysis available", exact: true })).toBeVisible();
  await navigate(page, "History");
  await page.getByRole("button", { name: /^Pasted build log/ }).click();
  await expect(page.getByRole("status")).toContainText("Only metadata");
});

test("hostile HTML and common secret forms stay inert and redacted in viewer/export", async ({ page }) => {
  const hostile = [
    "error TS2322: <img src=x onerror=alert('qa-xss')><script>alert('qa-xss')</script>",
    "token=qa-token-123 password=qa-password-123",
    "Authorization: Bearer qa-bearer-123",
    "https://qa-user:qa-password@registry.example.test/pkg?token=qa-query-123",
    "-----BEGIN RSA PRIVATE KEY-----", "qa-private-key-body", "-----END RSA PRIVATE KEY-----",
  ].join("\n");
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await analyze(page, hostile);
  await expect(page.locator(".finding-card img, .finding-card script")).toHaveCount(0);
  await navigate(page, "Log viewer");
  const viewer = page.getByRole("region", { name: "Build log lines" });
  await expect(viewer).toContainText("<img src=x");
  await expect(viewer).toContainText("[REDACTED PRIVATE KEY]");
  const safe = await viewer.textContent();
  for (const secret of ["qa-token-123", "qa-password-123", "qa-bearer-123", "qa-query-123", "qa-private-key-body"]) expect(safe).not.toContain(secret);
  await expect(viewer.locator("img, script")).toHaveCount(0);
  await navigate(page, "Reports");
  await page.locator("details summary").click();
  const report = await page.getByLabel("Full sanitized report", { exact: true }).textContent();
  expect(report).toContain("<img src=x");
  expect(report).toContain("Redaction notice");
  for (const secret of ["qa-token-123", "qa-password-123", "qa-bearer-123", "qa-query-123", "qa-private-key-body"]) expect(report).not.toContain(secret);
  expect(dialogs).toEqual([]);
});

test("worker load failure is recoverable and no-worker fallback rejects large inputs", async ({ page }) => {
  await page.route("**/assets/analysis.worker-*.js", (route) => route.abort());
  await page.goto("/app/new-analysis");
  const input = page.getByRole("textbox", { name: "Build log", exact: true });
  await input.fill(LOG);
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Local processing could not complete");
  await expect(input).toHaveValue(LOG);
  await expect(input).toBeEnabled();
  await page.unroute("**/assets/analysis.worker-*.js");
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/analysis$/);
  await page.addInitScript(() => { Object.defineProperty(window, "Worker", { value: undefined, configurable: true }); });
  await analyze(page);
  await navigate(page, "New analysis");
  await input.fill(`${"a".repeat(1000)}\n`.repeat(70));
  await expect(page.getByRole("alert")).toContainText("Reduce the input to 64 KiB or less");
  await expect(input).toBeEnabled();
});

test("blocked browser storage and clipboard permissions never prevent local analysis", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked for QA", "SecurityError"); } });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new DOMException("Blocked for QA", "NotAllowedError")) } });
  });
  await analyze(page);
  await navigate(page, "Reports");
  await page.getByRole("button", { name: "Copy report", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Could not copy the report");
  await expect(page.locator(".report-preview-card")).toContainText("TS2322");
});

test("desktop, tablet and mobile layouts retain usable navigation, dialogs and controls", async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.screenshot({ path: testInfo.outputPath(`home-${viewport.width}.png`), fullPage: true });
    if (viewport.width <= 740) {
      const menu = page.getByRole("button", { name: "Open navigation", exact: true });
      await menu.click();
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
    }
    await analyze(page);
    const analysisOverflow = await page.locator("main").evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect.soft(analysisOverflow.scroll, `Populated Analysis at ${viewport.width}px`).toBeLessThanOrEqual(analysisOverflow.client + 1);
    await page.screenshot({ path: testInfo.outputPath(`analysis-${viewport.width}.png`), fullPage: true });
    for (const name of ["New analysis", "Log viewer", "Verification", "History", "Reports", "Settings", "Help"]) {
      await navigate(page, name);
      const overflow = await page.locator("main").evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      expect.soft(overflow.scroll, `${name} at ${viewport.width}px`).toBeLessThanOrEqual(overflow.client + 1);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    await page.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Keyboard shortcuts", exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`workspace-${viewport.width}.png`), fullPage: true });
    if (viewport.width <= 768) {
      const trigger = page.getByRole("button", { name: "Open sidebar", exact: true });
      await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toHaveCount(0);
      await trigger.click();
      await expect(page.getByRole("button", { name: "Close sidebar", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
  }
});
