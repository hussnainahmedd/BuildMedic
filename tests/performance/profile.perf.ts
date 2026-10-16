import { performance } from "node:perf_hooks";
import process from "node:process";
import { expect, it } from "vitest";
import { analyzeText, normalizeLogText, redactSensitiveLog } from "../../src/analyzer";
import { inspectLogText } from "../../src/lib/validation";
import { analyzeDiagnosticsDetailed } from "../../src/diagnostics";
import { DIAGNOSTIC_RULES } from "../../src/diagnostics/rules";
import { findBuildCompletion } from "../../src/analyzer/completion";

it("profiles the same synthetic pipeline stages without UI or transport claims", () => {
  const line = `info bundling src/feature.ts into a static output module ${"with local dependencies ".repeat(10)}\n`;
  const bytes = 1024 * 1024;
  const error = "src/report.ts:4:2 - error TS2322: Type 'string' is not assignable to type 'number'.";
  const bodyBytes = bytes - error.length - 1;
  const log = `${line.repeat(Math.ceil(bodyBytes / line.length)).slice(0, bodyBytes)}\n${error}`;
  const normalized = normalizeLogText(log);
  const stages = {
    inspect: () => inspectLogText(log),
    normalize: () => normalizeLogText(log),
    redact: () => redactSensitiveLog(normalized.text),
    rules: () => analyzeDiagnosticsDetailed(normalized),
    ...Object.fromEntries(DIAGNOSTIC_RULES.map((rule) => [rule.id, () => rule.detect({ ...normalized, maxMatchesPerRule: 257 })])),
    completion: () => findBuildCompletion(normalized.lines),
    total: () => analyzeText(log),
  };
  expect(analyzeText(log)).toMatchObject({ status: "complete", input: { byteCount: bytes } });
  for (const [stage, run] of Object.entries(stages)) {
    run();
    const samples = Array.from({ length: 10 }, () => {
      const start = performance.now();
      run();
      return Math.round((performance.now() - start) * 100) / 100;
    }).sort((a, b) => a - b);
    process.stdout.write(`${JSON.stringify({ stage, bytes, medianMs: samples[5], samplesMs: samples })}\n`);
  }
});
