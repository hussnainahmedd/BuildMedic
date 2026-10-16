import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { once } from "node:events";
import process from "node:process";

// Tests the actual built assets locally or against the just-started CI container.
const workers = (await readdir(new URL("../dist/assets/", import.meta.url))).filter((file) => /^analysis\.worker-.+\.js$/.test(file));
assert.equal(workers.length, 1, "Expected one production analysis worker bundle");
let child;
try {
  let origin = process.argv[2];
  if (!origin) {
    child = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, HOST: "127.0.0.1", PORT: "0" }, stdio: ["ignore", "pipe", "inherit"] });
    origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Production server startup timed out")), 10_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Production server exited before readiness")); });
      child.stdout.on("data", (data) => {
        const match = /http:\/\/127\.0\.0\.1:\d+/.exec(String(data));
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
  }
  const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  for (const route of ["/", "/app/new-analysis", "/app/verification"]) {
    const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /BuildMedic/);
    assert.match(response.headers.get("content-security-policy"), /worker-src 'self'/);
  }
  const worker = await fetch(`${origin}/assets/${workers[0]}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get("content-type"), /javascript/);
  assert.match(await worker.text(), /onmessage/);
  assert.equal((await fetch(`${origin}/assets/missing-worker.js`)).status, 404);
  assert.equal((await fetch(`${origin}/`, { method: "POST", body: "synthetic, never analyzed" })).status, 405);
  process.stdout.write("Production HTTP smoke passed: health, SPA routes, CSP, worker asset, missing asset, rejected write. No browser execution was inferred.\n");
} finally {
  if (child && child.exitCode === null) {
    const exit = once(child, "exit");
    child.kill();
    await exit;
  }
}
