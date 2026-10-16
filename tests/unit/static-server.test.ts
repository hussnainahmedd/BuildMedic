// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { afterAll, beforeAll, expect, it } from "vitest";

let child: ChildProcess | undefined;
let directory: string | undefined;
let origin = "";

beforeAll(async () => {
  const cache = join(process.cwd(), ".cache");
  await mkdir(cache, { recursive: true });
  directory = await mkdtemp(join(cache, "server-test-"));
  await mkdir(join(directory, "dist", "assets"), { recursive: true });
  await copyFile(new URL("../../server.mjs", import.meta.url), join(directory, "server.mjs"));
  await writeFile(join(directory, "dist", "index.html"), "<!doctype html><title>BuildMedic fixture</title>");
  await writeFile(join(directory, "dist", "assets", "worker.js"), "self.onmessage = () => {};");
  child = spawn(process.execPath, [join(directory, "server.mjs")], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
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

it("serves health, real assets, and extensionless SPA routes with safe headers", async () => {
  const health = await fetch(`${origin}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ service: "buildmedic", status: "ok" });
  const route = await fetch(`${origin}/app/new-analysis`);
  expect(route.status).toBe(200);
  expect(await route.text()).toContain("BuildMedic fixture");
  expect(route.headers.get("x-content-type-options")).toBe("nosniff");
  expect(route.headers.get("content-security-policy")).toContain("worker-src 'self'");
  expect(route.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  const asset = await fetch(`${origin}/assets/worker.js`, { method: "HEAD" });
  expect(asset.status).toBe(200);
  expect(asset.headers.get("content-type")).toContain("javascript");
  expect(asset.headers.get("cache-control")).toContain("immutable");
  expect(await asset.text()).toBe("");
});

it("rejects writes, traversal and malformed encodings, and missing worker assets", async () => {
  expect((await fetch(`${origin}/`, { method: "POST", body: "untrusted log" })).status).toBe(405);
  expect((await fetch(`${origin}/..%2fserver.mjs`)).status).toBe(400);
  expect((await fetch(`${origin}/bad%ZZ`)).status).toBe(400);
  const missing = await fetch(`${origin}/assets/not-present.js`);
  expect(missing.status).toBe(404);
  expect(await missing.text()).not.toContain("BuildMedic fixture");
});
