import { expect, test, type Page } from "@playwright/test";

const LOG = "src/qa.ts:4:9 - error TS2322: incompatible types\ntoken=qa-production-secret";
const routes = ["/", "/features", "/how-it-works", "/documentation", "/about", "/support", "/privacy", "/security", "/app", "/app/overview", "/app/new-analysis", "/app/analysis", "/app/log-viewer", "/app/verification", "/app/history", "/app/reports", "/app/settings", "/app/help"];

async function navigate(page: Page, name: string) {
  const open = page.getByRole("button", { name: "Open sidebar", exact: true });
  if (await open.isVisible()) await open.click();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: new RegExp(`^${name}`) }).click();
}

test("all React routes support direct requests, trailing slashes and refresh; unknown routes are branded", async ({ page, request }) => {
  test.setTimeout(120_000);
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/BuildMedic/);
    // Firefox exposes Vercel's valid conditional-document 304 on reload.
    // The rendered route must still work; a 404/redirect/error is never accepted.
    expect([200, 304], `${route} refresh`).toContain((await page.reload())?.status());
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (route !== "/") {
      const slash = await request.get(`${route}/`);
      expect(slash.status(), `${route}/`).toBe(200);
      expect(await slash.text()).toContain('<div id="root">');
    }
  }
  for (const route of ["/qa-unknown", "/app/qa-unknown", "/nested/unknown/page"]) {
    expect((await page.goto(route))?.status()).toBe(200);
    await expect(page.locator(".not-found-page")).toContainText("404");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect([200, 304], `${route} refresh`).toContain((await page.reload())?.status());
    await expect(page.locator(".not-found-page")).toContainText("404");
  }
});

test("real favicon and hashed assets load; missing assets never receive SPA HTML", async ({ page, request }) => {
  await page.goto("/");
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute("href", "/favicon.svg");
  const favicon = await request.get((await icon.getAttribute("href"))!);
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");
  const assetPaths = await page.locator('script[src], link[rel="stylesheet"]').evaluateAll((elements) => elements.map((element) => element.getAttribute("src") || element.getAttribute("href")));
  for (const asset of assetPaths) expect((await request.get(asset!)).status()).toBe(200);
  for (const asset of ["/assets/missing-worker.js", "/assets/missing", "/assets/", "/missing.css", "/nested/missing.js", "/missing.svg"]) {
    const response = await request.get(asset);
    expect(response.status(), asset).toBe(404);
    expect(await response.text(), asset).not.toContain('<div id="root">');
    expect((await request.head(asset)).status(), `HEAD ${asset}`).toBe(404);
  }
});

test("production CSP permits native selects, real workers, verification and sanitized export without console violations", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const workers: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.addInitScript(() => {
    Object.assign(window, { qaCsp: [] });
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { qaCsp: string[] }).qaCsp.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
  const response = await page.goto("/");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("worker-src 'self'");
  expect(headers["content-security-policy"]).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["permissions-policy"]).toContain("camera=()");
  // Exact live-audit reproduction: client navigation from home, then analysis.
  // No screenshot/axe styling is injected into this console/CSP test.
  await page.getByRole("link", { name: "New analysis", exact: true }).click();
  await page.getByRole("textbox", { name: "Build log", exact: true }).fill(LOG);
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page.locator(".analysis-root-card")).toContainText("TS2322");
  await page.getByLabel("Sort findings").selectOption("line");
  await navigate(page, "Verification");
  await page.getByRole("textbox", { name: "Rerun build log", exact: true }).fill("Build completed successfully.");
  await page.getByRole("button", { name: "Compare findings", exact: true }).first().click();
  await expect(page.locator(".verification-result-card")).toContainText("resolved");
  await navigate(page, "Reports");
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Evidence", exact: true })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("buildmedic-report.txt");
  let report = "";
  for await (const chunk of (await download.createReadStream())!) report += chunk.toString();
  expect(report).toContain("TS2322");
  expect(report).not.toContain("qa-production-secret");
  await page.getByRole("button", { name: "Search workspace", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Command center" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Search workspace", exact: true })).toBeFocused();
  expect(workers.filter((url) => /\/assets\/analysis.worker-.*\.js$/.test(url)).length).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => (window as unknown as { qaCsp: string[] }).qaCsp)).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach("production-csp", { body: JSON.stringify({ headers, workers, errors }), contentType: "application/json" });
});

test("CSP still blocks arbitrary inline script, style attributes and style elements", async ({ page }) => {
  await page.goto("/app/new-analysis");
  await page.evaluate(() => {
    Object.assign(window, { qaBlocked: [], qaInlineExecuted: false });
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { qaBlocked: string[] }).qaBlocked.push(event.effectiveDirective);
    });
    const script = document.createElement("script");
    script.textContent = "window.qaInlineExecuted = true";
    document.body.append(script);
    const probe = document.createElement("div");
    probe.id = "qa-style-probe";
    probe.setAttribute("style", "position:fixed;z-index:99999");
    document.body.append(probe);
    const style = document.createElement("style");
    style.textContent = "#qa-style-probe { position: absolute; }";
    document.head.append(style);
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { qaBlocked: string[] }).qaBlocked.length)).toBeGreaterThanOrEqual(3);
  const state = await page.evaluate(() => ({
    executed: (window as unknown as { qaInlineExecuted: boolean }).qaInlineExecuted,
    directives: (window as unknown as { qaBlocked: string[] }).qaBlocked,
    position: getComputedStyle(document.getElementById("qa-style-probe")!).position,
  }));
  expect(state.executed).toBe(false);
  expect(state.position).toBe("static");
  expect(state.directives.some((directive) => directive.startsWith("script-src"))).toBe(true);
  expect(state.directives).toContain("style-src-attr");
  expect(state.directives).toContain("style-src-elem");
});

test("long evidence, forms and mobile theme controls remain accessible at 320–1440px", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const longLog = `src/${"deepsegment".repeat(40)}/qa.ts:4:9 - error TS2322: Type '${"X".repeat(1000)}' is not assignable to type 'number'.\nYN0060 unmet peer dependency`;
  await page.goto("/app/new-analysis");
  await page.getByRole("textbox", { name: "Build log", exact: true }).fill(longLog);
  await page.getByRole("button", { name: "Analyze log", exact: true }).click();
  await expect(page.locator(".finding-card").first()).toBeVisible();
  const measurements = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.locator("main").evaluate((main) => {
      const overflow = Array.from(main.querySelectorAll<HTMLElement>(".card, .finding-filters, .evidence-line, .evidence-line > span:last-child, button, input, select"))
        .filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1); })
        .map((element) => element.className || element.tagName);
      return { scroll: main.scrollWidth, client: main.clientWidth, overflow };
    });
    expect(geometry.scroll, `Analysis at ${width}px`).toBeLessThanOrEqual(geometry.client + 1);
    expect(geometry.overflow, `Analysis at ${width}px`).toEqual([]);
    expect(await page.locator(".finding-filters button").first().evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
    const evidence = await page.locator(".evidence-line > span:last-child").first().evaluate((element) => ({ text: element.textContent!.length, scroll: element.scrollWidth, client: element.clientWidth, whiteSpace: getComputedStyle(element).whiteSpace }));
    expect(evidence.text).toBeGreaterThan(400);
    expect(evidence.scroll).toBeLessThanOrEqual(evidence.client + 1);
    expect(evidence.whiteSpace).toBe("pre-wrap");
    measurements.push({ width, ...geometry, evidence });
    await page.screenshot({ path: testInfo.outputPath(`analysis-long-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await navigate(page, "Log viewer");
  const code = await page.locator(".log-code-line code").first().evaluate((element) => ({ length: element.textContent!.length, client: element.clientWidth, scroll: element.scrollWidth }));
  expect(code.length).toBeGreaterThan(1400);
  expect(code.scroll).toBeLessThanOrEqual(code.client + 1);
  await navigate(page, "New analysis");
  const form = await page.getByRole("textbox", { name: "Build log", exact: true }).boundingBox();
  expect(form!.x + form!.width).toBeLessThanOrEqual(320);
  const smallTargets = await page.locator("main button:visible, main select:visible, main input:not([type=file]):visible").evaluateAll((elements) => elements.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width < 24 || rect.height < 24; }).map((element) => element.getAttribute("aria-label") || element.textContent));
  expect(smallTargets).toEqual([]);
  for (const route of ["/", "/app/new-analysis"]) {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(route);
      const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
      await expect(toggle).toBeVisible();
      const box = await toggle.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(width <= 740 ? 44 : 24);
      expect(box!.height).toBeGreaterThanOrEqual(width <= 740 ? 44 : 24);
      const previous = await page.locator("html").getAttribute("data-theme");
      await toggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", previous === "dark" ? "light" : "dark");
    }
  }
  await testInfo.attach("responsive-geometry", { body: JSON.stringify(measurements), contentType: "application/json" });
});
