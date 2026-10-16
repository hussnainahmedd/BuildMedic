// @vitest-environment node
import { describe, expect, it } from "vitest";

import { analyzeText, redactSensitiveLog, sanitizeEvidenceLine, stripAnsiAndControl } from "../../src/analyzer";
import { analyzeDiagnosticsDetailed, RULE_IDS } from "../../src/diagnostics";
import { HARD_MAX_MATCHES_PER_RULE } from "../../src/analyzer/types";
import { normalizeLogText } from "../../src/analyzer";
import { validateFile, validateLogText } from "../../src/lib/validation";
import { compareAnalysisResults, getFindingKey } from "../../src/verification";
import type { AnalysisResult, Finding, TextFileLike } from "../../src/types";
import { digestIdentity } from "../../src/analyzer/identity";

function complete(text: string, options: Parameters<typeof analyzeText>[1] = {}) {
  const result = analyzeText(text, options);
  if (result.status !== "complete") throw new Error(`Expected complete, got ${result.status}`);
  return result;
}

function primaryLines(finding: Finding) {
  return finding.evidence.filter((entry) => entry.role === "primary").map((entry) => entry.lineNumber);
}

describe("reviewed diagnostic identity and evidence regressions", () => {
  it("uses a standard SHA-256 digest for privacy-safe identity", () => {
    expect(digestIdentity("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(digestIdentity("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("only calls actual missing-module cues primary and retains required continuation at context zero", () => {
    const result = complete([
      "ordinary first line", "ordinary second line", "ordinary third line",
      "Error: Cannot find module", "'Package/Feature'", "unrelated tail",
    ].join("\n"), { contextLines: 0 });
    expect(result.findings).toHaveLength(1);
    expect(primaryLines(result.findings[0])).toEqual([4]);
    expect(result.findings[0].evidence).toEqual([
      expect.objectContaining({ lineNumber: 4, role: "primary" }),
      expect.objectContaining({ lineNumber: 5, role: "context", text: "'Package/Feature'" }),
    ]);
    expect(result.metadata?.partial).toBe(false);
  });

  it("does not borrow a later package or mistake quoted source for a diagnostic", () => {
    const result = complete("Error: Cannot find module\nordinary output\nError: Cannot find module 'other'");
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map(primaryLines).sort()).toEqual([[1], [3]]);
    expect(analyzeText("ordinary output\nconst text = \"Cannot find module 'other'\";").status).toBe("no-match");
  });

  it.each([
    ["Error: Cannot find module 'Package/Feature'", "Error: Cannot find module 'package/feature'"],
    ["sh: Build: command not found", "Missing script: Build"],
    ["Error EACCES: open '/tmp/one'", "Error EPERM: open '/tmp/one'"],
    ["Error EACCES: open '/tmp/one'", "Error EACCES: open '/tmp/two'"],
    ["npm error ECONNRESET https://registry.example/A", "npm error ETIMEDOUT https://registry.example/A"],
    ["npm error ECONNRESET https://registry.example/A", "npm error ECONNRESET https://registry.example/a"],
    ["npm error ECONNRESET https://registry.example:4001/A", "npm error ECONNRESET https://registry.example:4002/A"],
    ["src/Foo.ts:2:1 - error TS2322: Export 'Widget' differs", "src/foo.ts:2:1 - error TS2322: Export 'Widget' differs"],
    ["src/Foo.ts:2:1 - error TS2322: Export 'Widget' differs", "src/Foo.ts:2:1 - error TS2322: Export 'widget' differs"],
  ])("keeps meaningful changes distinct: %s", (before, after) => {
    const baseline = complete(before);
    const rerun = complete(after);
    expect(baseline.findings[0].signature).not.toBe(rerun.findings[0].signature);
    expect(compareAnalysisResults(baseline, rerun)).toMatchObject({
      outcome: "changed", summary: { persistentCount: 0, resolvedCount: 1, newCount: 1, uncertainCount: 0 },
    });
  });

  it("hashes the full meaningful diagnostic instead of a shared long prefix", () => {
    const prefix = `src/Long.ts:2:1 - error TS2322: ${"shared words ".repeat(80)}`;
    const baseline = complete(`${prefix}END-A`, { maxEvidenceLineLength: 4096 });
    const rerun = complete(`${prefix}END-B`, { maxEvidenceLineLength: 4096 });
    expect(baseline.findings[0].signature).not.toBe(rerun.findings[0].signature);
    expect(baseline.findings[0].signature?.length).toBeLessThan(160);
    expect(baseline.findings[0].signature).not.toContain("shared words");
    expect(compareAnalysisResults(baseline, rerun).outcome).toBe("changed");
  });

  it("normalizes location, timestamp and slash noise without losing source or value case", () => {
    const before = complete("2026-01-01T10:00:00Z C:\\src\\Foo.ts(2,1): error TS2322: Export 'Widget' differs");
    const after = complete("2026-03-01T15:00:00Z C:/src/Foo.ts:20:14 - error TS2322: Export 'Widget' differs");
    expect(compareAnalysisResults(before, after)).toMatchObject({ outcome: "no-change", summary: { persistentCount: 1 } });
  });

  it("includes explicit multiline filesystem/network target details without making them primary", () => {
    for (const [cue, detail] of [["npm error code EACCES", "npm error path /tmp/"], ["npm error code ECONNRESET", "npm error hostname registry."]]) {
      const before = complete(`${cue}\n${detail}One`, { contextLines: 0 });
      const after = complete(`${cue}\n${detail}Two`, { contextLines: 0 });
      expect(primaryLines(before.findings[0])).toEqual([1]);
      expect(before.findings[0].evidence[1]).toMatchObject({ lineNumber: 2, role: "context" });
      expect(compareAnalysisResults(before, after).outcome).toBe("changed");
    }
  });

  it("preserves meaningful quoted whitespace and numbers in messages", () => {
    for (const [a, b] of [["'a  b'", "'a b'"], ["1234567890123", "1234567890124"], ["'a\\b'", "'a//b'"],
      ["'2026-01-01T10:00:00Z'", "'2026-02-01T10:00:00Z'"], ["'file.ts:12'", "'file.ts:13'"]]) {
      expect(compareAnalysisResults(complete(`error TS2322: ${a}`), complete(`error TS2322: ${b}`)).outcome).toBe("changed");
    }
  });

  it("surfaces duplicate independent identities, low confidence, and redacted identities as uncertain", () => {
    const duplicates = complete("error TS2322: same\nerror TS2322: same");
    expect(compareAnalysisResults(duplicates, complete("error TS2322: same")).outcome).toBe("uncertain");
    const low = complete("SIGKILL");
    expect(compareAnalysisResults(low, analyzeText("Build completed successfully.")).outcome).toBe("uncertain");
    const redacted = complete("Error: Cannot find module 'npm_token=do-not-serialize-this'");
    expect(JSON.stringify(redacted.findings)).not.toContain("do-not-serialize-this");
    expect(compareAnalysisResults(redacted, analyzeText("Build completed successfully.")).outcome).toBe("uncertain");
  });
});

describe("explicit completion boundaries", () => {
  it.each([
    "Build not completed", "Build incomplete", "Build completed with errors", "Build failed to complete",
    "const result = { code: 0 };", "code: 0", "status = 0", "test('Build completed successfully.')",
    "The documentation says build completed successfully.", "Build should have completed", "Tests have not passed",
    "Build completed successfully.\nBuild failed", "Build completed successfully.\nerror: unknown compiler failure",
    "const fixture = `\nBuild completed successfully.\n`;", "```js\nBuild completed successfully.\n```",
    "Build completed successfully.\nFAIL tests", "Build completed successfully.\nTests: 2 failed",
  ])("does not infer resolution from %s", (text) => {
    const rerun = analyzeText(text);
    expect(rerun.metadata?.buildCompletion).toBeUndefined();
    expect(compareAnalysisResults(complete("error TS2322: broken"), rerun).outcome).toBe("uncertain");
  });

  it.each(["Build completed successfully.", "Tests passed", "Process exited with code 0", "✓ built in 1.20s", "webpack compiled successfully in 42 ms"])("supports explicit final lines: %s", (text) => {
    const rerun = analyzeText(`ordinary output\n${text}`);
    expect(rerun.metadata?.buildCompletion?.lineNumber).toBe(2);
    const result = compareAnalysisResults(complete("error TS2322: broken"), rerun);
    expect(result).toMatchObject({ outcome: "improved", summary: { resolvedCount: 1 } });
    expect(result.message).toMatch(/does not prove/);
  });

  it("uses the final relevant explicit outcome", () => {
    const result = analyzeText("Build completed successfully.\nBuild not completed\nBuild completed successfully.");
    expect(result.metadata?.buildCompletion?.lineNumber).toBe(3);
  });
});

describe("display-only redaction boundaries", () => {
  it("retains plain spans and original separators when stripping large colored logs", () => {
    const line = "info building a local module with readable context\r\n";
    const plain = line.repeat(20_000);
    expect(stripAnsiAndControl(plain)).toBe(plain);
    expect(stripAnsiAndControl(`\u001b[31m${plain}\u001b[0m`)).toBe(plain);
    expect(stripAnsiAndControl("before\r\u001b[31m\nafter")).toBe("before\r[CONTROL]\nafter");
  });
  it("redacts complete and incomplete keys through EOF and preserves original separators", () => {
    for (const footer of ["\r\n-----END RSA PRIVATE KEY-----", ""]) {
      const value = `head\r\n-----BEGIN RSA PRIVATE KEY-----\rprivate-body\n${"secret-key-body".repeat(6000)}${footer}\r\ntail`;
      const safe = redactSensitiveLog(value);
      expect(safe.redacted).toBe(true);
      expect(safe.text.match(/\r\n|\r|\n/g)).toEqual(value.match(/\r\n|\r|\n/g));
      expect(safe.text).not.toMatch(/private-body|secret-key-body/);
      if (!footer) expect(safe.text).not.toContain("tail");
    }
    expect(redactSensitiveLog("-----BEGIN PRIVATE KEY\ncut-off-material").text).not.toContain("cut-off-material");
  });

  it("does not leave suffixes of long bearer, known token, env, quoted or URL values", () => {
    const secret = `hidden-${"a".repeat(9000)}-TAIL-MUST-NOT-LEAK`;
    const cases = [
      `Authorization: Bearer ${secret}`, `Bearer ${secret}`, `Basic ${"A".repeat(9000)}TAIL`,
      `BUILD_SERVICE_API_TOKEN=${secret}`, `{"password":"${secret}"}`,
      `https://user:${secret}@registry.invalid/pkg?token=${secret}&x=1`,
      `npm_${"A".repeat(9000)}TAIL`, `token='${secret}'`,
    ];
    for (const value of cases) {
      const safe = redactSensitiveLog(value);
      expect(safe.redacted).toBe(true);
      expect(safe.text).not.toMatch(/TAIL|hidden-|a{20}|A{20}/);
    }
  });

  it("handles escaped JSON quotes and embedded terminal/bidi controls before secret recognition", () => {
    const value = String.raw`{"password":"prefix\"secret-tail","api\u004bey":"escaped-key-secret"}` +
      "\nBearer fixture\u001b[31mSecret\u001b[0mTokenTail\nMY_APP_TOKEN=hidden\u202eSuffix";
    const safe = redactSensitiveLog(value);
    expect(safe.text).not.toMatch(/secret-tail|escaped-key-secret|fixture|TokenTail|hidden|Suffix|\u202e/);
    expect(safe.text).not.toContain(String.fromCharCode(27));
    expect(safe.text.split("\n")).toHaveLength(3);
  });

  it("does not let token replacements break JSON escapes or hide behind redaction-like prefixes", () => {
    for (const value of [
      String.raw`{"password":"Bearer prefix\"secret-tail"}`,
      String.raw`{"password":"https://user:pw@host/\"secret-tail"}`,
      "token=[REDACTED-but-secret-tail]", "Bearer [REDACTED TOKEN]secret-tail",
      "token=[REDACTED SECRET]secret-tail", "postgres://user:secret-tail@database.invalid/db",
      "https://secret-tail@registry.invalid/pkg", 'MY_SERVICE_TOKEN="unclosed-secret-tail',
    ]) {
      expect(redactSensitiveLog(value).text).not.toContain("secret-tail");
    }
  });

  it("redacts before evidence cuts and records an original tail even after replacement shrinks it", () => {
    const value = `token=${"s".repeat(9000)} end-of-original-tail`;
    const safe = sanitizeEvidenceLine(value, 64);
    expect(safe.text).not.toContain("ssss");
    expect(safe.text).toContain("[truncated]");
    expect(safe.text.length).toBeLessThanOrEqual(64);
    expect(safe.redacted).toBe(true);
    const result = complete(`error TS2322: token=${"s".repeat(9000)}`, { maxEvidenceLineLength: 64 });
    expect(result.findings[0].evidence[0]).toMatchObject({ lineNumber: 1, redacted: true });
    expect(result.findings[0].evidence[0].text).not.toContain("ssss");
    expect(result.metadata?.evidenceTruncated).toBe(true);
  });

  it("keeps whole-log redaction line aligned for private-key evidence", () => {
    const result = complete("-----BEGIN PRIVATE KEY-----\nerror TS2322: private material\nno footer", { contextLines: 0 });
    expect(result.findings[0].evidence).toEqual([expect.objectContaining({ lineNumber: 2, text: "", role: "primary", redacted: true })]);
    expect(result.findings[0].signature).not.toContain("private material");
  });

  it("is idempotent and keeps standalone CR/LF separators when removing terminal noise", () => {
    const value = "Bearer secret-value\r\u001b[31m\nhttps://user:pw@registry.invalid/?token=secret-value&x=1";
    const safe = redactSensitiveLog(value);
    expect(safe.text.match(/\r\n|\r|\n/g)).toEqual(value.match(/\r\n|\r|\n/g));
    expect(redactSensitiveLog(safe.text).text).toBe(safe.text);
  });
});

describe("bounded domain inputs and work", () => {
  it("accepts only allowlisted extensions for empty MIME, then validates actual content", () => {
    const file = { name: "build.LOG", type: "", size: 10 };
    expect(validateFile(file)).toMatchObject({ valid: true, value: { requiresContentValidation: true } });
    expect(validateLogText("readable text").valid).toBe(true);
    expect(validateLogText("binary\u0000text").valid).toBe(false);
    for (const rejected of [{ ...file, name: "build.exe" }, { ...file, type: "application/octet-stream" }, { ...file, name: undefined }]) {
      expect(validateFile(rejected).valid).toBe(false);
    }
    for (const malformed of [42, "not a file", [], { size: 3, type: 42 }, { size: 3, name: 42, type: "" }]) {
      expect(() => validateFile(malformed as unknown as TextFileLike)).not.toThrow();
      expect(validateFile(malformed as unknown as TextFileLike).valid).toBe(false);
    }
  });

  it("flags evidence limits only when actual evidence is omitted", () => {
    const short = complete("error TS2322: one", { maxEvidenceLines: 1 });
    expect(short.metadata).toMatchObject({ partial: false, limitsReached: [] });
    const zero = complete("before\nerror TS2322: one\nafter", { contextLines: 0, maxEvidenceLines: 1 });
    expect(zero.findings[0].evidence).toHaveLength(1);
    expect(zero.metadata).toMatchObject({ partial: false, limitsReached: [] });
    const omitted = complete("before\nerror TS2322: one\nafter", { maxEvidenceLines: 1 });
    expect(omitted.metadata).toMatchObject({ partial: true, evidenceTruncated: true });
  });

  it("probes one extra match even at the hard per-rule maximum", () => {
    const input = normalizeLogText(Array.from({ length: HARD_MAX_MATCHES_PER_RULE + 1 }, (_, index) => `error TS2322: independent-${index}`).join("\n"));
    const result = analyzeDiagnosticsDetailed(input, { maxMatchesPerRule: HARD_MAX_MATCHES_PER_RULE });
    expect(result.cappedRuleIds).toContain(RULE_IDS.typescript);
    expect(result.limitsReached).toContain("matches-per-rule");
  });

  it("defensively rejects malformed or excessive structured comparison inputs", () => {
    const valid = complete("error TS2322: expected");
    const badInputs: unknown[] = [
      undefined, {}, { ...valid, input: undefined }, { ...valid, metadata: { partial: true, limitsReached: "bad" } },
      { ...valid, findings: [null] }, { ...valid, findings: [{ ...valid.findings[0], evidence: "bad" }] },
      { ...valid, findings: [{ ...valid.findings[0], evidence: [{ text: 42, lineNumber: 1 }] }] },
      { ...valid, findings: new Array(100_000).fill(valid.findings[0]) },
      { ...valid, findings: [{ ...valid.findings[0], signature: "s".repeat(1_000_000) }] },
      { ...valid, metadata: { partial: false, limitsReached: [], buildCompletion: { lineNumber: -1, text: 42 } } },
    ];
    for (const bad of badInputs) {
      expect(() => compareAnalysisResults(bad as AnalysisResult, valid)).not.toThrow();
      expect(compareAnalysisResults(bad as AnalysisResult, valid).status).toBe("invalid");
      expect(compareAnalysisResults(valid, bad as AnalysisResult).status).toBe("invalid");
    }
  });

  it("keeps full bounded explicit signatures exact and private while treating legacy/redacted identity conservatively", () => {
    const base = complete("error TS2322: expected");
    const finding = base.findings[0];
    const a = { ...base, findings: [{ ...finding, signature: `${"a".repeat(2000)}A` }] };
    const b = { ...base, findings: [{ ...finding, signature: `${"a".repeat(2000)}B` }] };
    expect(compareAnalysisResults(a, a)).toMatchObject({ outcome: "no-change", summary: { persistentCount: 1 } });
    expect(compareAnalysisResults(a, b).outcome).toBe("changed");
    expect(getFindingKey(a.findings[0]).length).toBeLessThan(200);
    const legacy = { ...base, findings: [{ ...finding, signature: undefined, evidence: [{ lineNumber: 1, text: "token=[REDACTED SECRET]", redacted: true, role: "primary" as const }] }] };
    expect(compareAnalysisResults(legacy, legacy).outcome).toBe("uncertain");
    const unknownMetadata = { ...base, metadata: { ...base.metadata!, futureField: { anything: true } } };
    expect(compareAnalysisResults(unknownMetadata, unknownMetadata).outcome).toBe("no-change");
  });
});
