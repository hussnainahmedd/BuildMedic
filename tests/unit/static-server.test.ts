// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { afterAll, beforeAll, expect, it } from "vitest";

let child: ChildProcess | undefined;
let directory: string | undefined;
let origin = "";

const fixtureHtml = "<!doctype html><title>BuildMedic fixture</title>";
const spaRoutes = [
  "/", "/features", "/how-it-works", "/documentation", "/about", "/support", "/privacy", "/security",
  "/app", "/app/overview", "/app/new-analysis", "/app/analysis", "/app/log-viewer", "/app/verification",
  "/app/history", "/app/reports", "/app/settings", "/app/help", "/not-a-page", "/app/not-a-page",
  "/nested/unknown/page", "/assets-other/not-a-page",
];

beforeAll(async () => {
  const cache = join(process.cwd(), ".cache");
  await mkdir(cache, { recursive: true });
  directory = await mkdtemp(join(cache, "server-test-"));
  await mkdir(join(directory, "dist", "assets"), { recursive: true });
  await mkdir(join(directory, "dist", "assets-other"), { recursive: true });
  await copyFile(new URL("../../server.mjs", import.meta.url), join(directory, "server.mjs"));
  await writeFile(join(directory, "dist", "index.html"), fixtureHtml);
  await writeFile(join(directory, "dist", "assets", "worker.js"), "self.onmessage = () => {};");
  await writeFile(join(directory, "dist", "assets", "app.css"), "body { color: white; }");
  await writeFile(join(directory, "dist", "assets-other", "app.js"), "export {};");
  await writeFile(join(directory, "dist", "manifest"), "real extensionless file");
  child = spawn(process.execPath, [join(directory, "server.mjs")], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", RENDER_GIT_COMMIT: "a".repeat(40) }, stdio: ["ignore", "pipe", "pipe"],
  });
  origin = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Static test server did not become ready")), 10_000);
    child!.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child!.once("exit", () => { clearTimeout(timeout); reject(new Error("Static test server exited before readiness")); });
    child!.stdout!.on("data", (chunk) => {
      const address = /http:\/\/127\.0\.0\.1:\d+/.exec(String(chunk));
      if (address) { clearTimeout(timeout); resolve(address[0]); }
    });
  });
}, 15_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
    child.kill();
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("serves the Render health endpoint without caching it", async () => {
  const health = await fetch(`${origin}/health`);
  expect(health.status).toBe(200);
  expect(health.headers.get("cache-control")).toBe("no-store");
  expect(await health.json()).toEqual({ service: "buildmedic", status: "ok", revision: "a".repeat(40) });
});

it.each(spaRoutes.flatMap((route) => route === "/" ? [route] : [route, `${route}/`]))(
  "serves the React document for %s, including branded unknown-route handling", async (pathname) => {
    const route = await fetch(`${origin}${pathname}?source=direct`);
    expect(route.status).toBe(200);
    expect(route.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(route.headers.get("cache-control")).toBe("no-cache");
    expect(await route.text()).toBe(fixtureHtml);
  },
);

it("preserves filesystem assets, module-worker MIME types, and HEAD responses", async () => {
  const worker = await fetch(`${origin}/assets/worker.js`);
  expect(worker.status).toBe(200);
  expect(worker.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  expect(worker.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(await worker.text()).toBe("self.onmessage = () => {};");
  const css = await fetch(`${origin}/assets/app.css`);
  expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");
  expect(await css.text()).toBe("body { color: white; }");
  const extensionless = await fetch(`${origin}/manifest`);
  expect(await extensionless.text()).toBe("real extensionless file");
  const asset = await fetch(`${origin}/assets/worker.js`, { method: "HEAD" });
  expect(asset.status).toBe(200);
  expect(asset.headers.get("content-length")).toBe(String(Buffer.byteLength("self.onmessage = () => {};")));
  expect(await asset.text()).toBe("");
  const route = await fetch(`${origin}/app/new-analysis/`, { method: "HEAD" });
  expect(route.status).toBe(200);
  expect(route.headers.get("content-length")).toBe(String(Buffer.byteLength(fixtureHtml)));
  expect(await route.text()).toBe("");
  const unrelated = await fetch(`${origin}/assets-other/app.js`);
  expect(unrelated.status).toBe(200);
  expect(unrelated.headers.get("cache-control")).toBe("no-cache");
});

it.each([
  "/assets", "/assets/", "/assets/not-present", "/assets/not-present/", "/assets/not-present.js",
  "/missing.js", "/missing.mjs", "/missing.css", "/favicon.ico", "/missing.js/", "/app/missing.json",
  "/nested/missing.css/", "/assets%2fnot-present", "/%61ssets/not-present", "/missing%2ejs",
  "/missing%2Ejs/", "/.env", "/.well-known/missing", "/nested/file.js/child",
])("returns a real non-HTML 404 for missing asset-like path %s", async (pathname) => {
  const missing = await fetch(`${origin}${pathname}`);
  expect(missing.status).toBe(404);
  expect(missing.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(missing.headers.get("cache-control") ?? "").not.toContain("immutable");
  expect(await missing.text()).toBe("Not found");
  const head = await fetch(`${origin}${pathname}`, { method: "HEAD" });
  expect(head.status).toBe(404);
  expect(await head.text()).toBe("");
});

it("aligns Vercel and Render security headers on documents, workers, health and errors", async () => {
  const config = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8")) as {
    routes: { headers?: Record<string, string> }[];
  };
  const headers = config.routes[0].headers!;
  for (const [pathname, method] of [
    ["/app/new-analysis/", "GET"], ["/assets/worker.js", "GET"], ["/health", "HEAD"],
    ["/assets/missing.js", "GET"], ["/bad%ZZ", "GET"], ["/", "POST"],
  ]) {
    const response = await fetch(`${origin}${pathname}`, { method });
    for (const [name, value] of Object.entries(headers)) {
      expect(response.headers.get(name), `${method} ${pathname}: ${name}`).toBe(value);
    }
    await response.text();
  }
});

it("rejects writes, traversal and malformed encodings", async () => {
  const write = await fetch(`${origin}/`, { method: "POST", body: "untrusted log" });
  expect(write.status).toBe(405);
  expect(write.headers.get("allow")).toBe("GET, HEAD");
  expect((await fetch(`${origin}/..%2fserver.mjs`)).status).toBe(400);
  expect((await fetch(`${origin}/..%5cserver.mjs`)).status).toBe(400);
  expect((await fetch(`${origin}/assets%5cnot-present`)).status).toBe(400);
  expect((await fetch(`${origin}/%00`)).status).toBe(400);
  expect((await fetch(`${origin}/bad%ZZ`)).status).toBe(400);
});
