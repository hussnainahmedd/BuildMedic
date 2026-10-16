import { cpus, platform, arch } from "node:os";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";

import { analyzeText } from "../../src/analyzer";
import { createTaskRuntime } from "../../src/workers/runtime";

const MIB = 1024 * 1024;
const iterations = Math.max(1, Math.min(30, Number(process.env.BENCH_ITERATIONS) || 30));
const caseBudgetMs = 15_000;
const normalLine = `info bundling src/feature.ts into a static output module ${"with local dependencies ".repeat(10)}\n`;

function fixture(bytes: number, variant = "normal"): string {
  const line = variant === "dense" ? `${"a".repeat(16_000)}\n` : normalLine;
  const error = variant === "normal" ? "src/report.ts:4:2 - error TS2322: Type 'string' is not assignable to type 'number'." : "";
  const bodyBytes = bytes - error.length - 1;
  const body = line.repeat(Math.ceil(bodyBytes / line.length)).slice(0, bodyBytes);
  return `${body}\n${error}`;
}

function sample(label: string, bytes: number, run: () => unknown, verify: (result: unknown) => void) {
  const samples: number[] = [];
  const start = performance.now();
  // The first invocation verifies correctness and warms module/regex/JIT caches.
  verify(run());
  for (let index = 0; index < iterations; index += 1) {
    const before = performance.now();
    const result = run();
    samples.push(Math.round((performance.now() - before) * 100) / 100);
    verify(result);
    if (performance.now() - start >= caseBudgetMs) break;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  process.stdout.write(`${JSON.stringify({ label, bytes, samplesMs: samples,
    medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    iterations: samples.length, requestedIterations: iterations, cutoffReached: samples.length < iterations,
  })}\n`);
}

it("measures deterministic synthetic logs and worker display preparation (not browser rendering)", () => {
  process.stdout.write(`${JSON.stringify({ runtime: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    protocol: "One warmup, up to 30 timed samples, 15-second per-case cutoff. No peak-memory or browser-latency claim." })}\n`);
  for (const bytes of [10 * 1024, 100 * 1024, MIB, 5 * MIB, 10 * MIB, 25 * MIB]) {
    const log = fixture(bytes);
    sample("analysis-normal", bytes, () => analyzeText(log), (result) => {
      expect(result).toMatchObject({ status: "complete", input: { byteCount: bytes } });
    });
  }
  for (const variant of ["dense", "normal"] as const) {
    const log = fixture(MIB, variant);
    const runtime = createTaskRuntime();
    sample(`viewer-prepare-${variant}`, MIB, () => runtime({ version: 1, id: 1, kind: "viewer-prepare", input: { text: log } }), (result) => {
      expect(result).toMatchObject({ ok: true, result: { inputBytes: MIB } });
    });
    sample(`analysis-${variant}-repeat`, MIB, () => analyzeText(log), (result) => {
      expect(result).toMatchObject({ status: variant === "dense" ? "no-match" : "complete" });
    });
  }
});
