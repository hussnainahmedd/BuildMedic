import { describe, expect, it } from "vitest";

import {
  analyzeLog,
  analyzeText,
  normalizeLogText,
  redactSensitiveText,
  sanitizeEvidenceLine,
  stripAnsiAndControl,
} from "../../src/analyzer";
import { RULE_IDS } from "../../src/diagnostics";
import {
  AMBIGUOUS_AND_SAFE_LOG,
  ANSI_AND_SECRET_LOG,
  DIAGNOSTIC_FAMILIES_LOG,
} from "../fixtures/diagnostic-families";

function findingFor(result: ReturnType<typeof analyzeText>, ruleId: string) {
  if (result.status !== "complete") {
    throw new Error(`Expected a complete result, received ${result.status}`);
  }

  const finding = result.findings.find((item) => item.ruleId === ruleId);
  if (finding === undefined) {
    throw new Error(`Expected finding ${ruleId}`);
  }
  return finding;
}

describe("browser-safe diagnostic engine", () => {
  it("detects every supported rule family and keeps one-based evidence lines", () => {
    const result = analyzeText(DIAGNOSTIC_FAMILIES_LOG);

    expect(result.status).toBe("complete");
    if (result.status !== "complete") {
      return;
    }

    expect(new Set(result.findings.map((finding) => finding.category))).toEqual(
      new Set([
        "typescript",
        "dependencies",
        "lockfile",
        "package-script",
        "permissions",
        "network",
        "native-module",
        "memory",
      ]),
    );
    expect(findingFor(result, RULE_IDS.typescript).evidence.some((line) => line.lineNumber === 2)).toBe(true);
    expect(findingFor(result, RULE_IDS.missingModule).evidence.some((line) => line.lineNumber === 12)).toBe(true);
    expect(findingFor(result, RULE_IDS.lockfile).evidence[0]?.lineNumber).toBe(6);
    expect(findingFor(result, RULE_IDS.missingScript).evidence[0]?.lineNumber).toBe(7);
    expect(findingFor(result, RULE_IDS.filesystem).evidence[0]?.lineNumber).toBe(8);
    expect(findingFor(result, RULE_IDS.network).evidence[0]?.lineNumber).toBe(9);
    expect(findingFor(result, RULE_IDS.native).evidence[0]?.lineNumber).toBe(10);
    expect(findingFor(result, RULE_IDS.memory).evidence[0]?.lineNumber).toBe(11);
    expect(findingFor(result, RULE_IDS.dependencyConflict).evidence.some((line) => line.lineNumber === 4)).toBe(true);
  });

  it("recognizes npm, pnpm, and yarn failure spellings", () => {
    const packageManagerLogs = [
      "pnpm install --frozen-lockfile\nERR_PNPM_OUTDATED_LOCKFILE Cannot install with frozen lockfile",
      "pnpm run build\nERR_PNPM_NO_SCRIPT Missing script: build",
      "yarn install --immutable\nYN0028 The lockfile would have been modified by this install",
      'yarn run build\nerror Command "build" not found.',
      "yarn install\nYN0060 peer dependency is incompatible",
      "npm error code EAI_AGAIN",
    ];

    for (const log of packageManagerLogs) {
      expect(analyzeText(log).status).toBe("complete");
    }

    expect(findingFor(analyzeText(packageManagerLogs[0] ?? ""), RULE_IDS.lockfile).confidence).toBe("high");
    expect(findingFor(analyzeText(packageManagerLogs[1] ?? ""), RULE_IDS.missingScript).category).toBe("package-script");
    expect(findingFor(analyzeText(packageManagerLogs[4] ?? ""), RULE_IDS.dependencyConflict).category).toBe("dependencies");
    expect(findingFor(analyzeText(packageManagerLogs[5] ?? ""), RULE_IDS.network).category).toBe("network");
  });

  it("normalizes LF, CRLF, and CR without shifting evidence positions", () => {
    const log = "first\r\n\u001b[31merror TS2322\u001b[0m\rthird\nfourth";
    const normalized = normalizeLogText(log);
    const result = analyzeText(log);

    expect(normalized.text).toBe("first\n\u001b[31merror TS2322\u001b[0m\nthird\nfourth");
    expect(normalized.normalizedNewlines).toBe(true);
    expect(normalized.lines).toHaveLength(4);
    expect(stripAnsiAndControl(normalized.lines[1] ?? "")).toBe("error TS2322");
    expect(findingFor(result, RULE_IDS.typescript).evidence.some((line) => line.lineNumber === 2)).toBe(true);
    expect(result.input.normalizedNewlines).toBe(true);
  });

  it("keeps source/message identities distinct while consolidating exact duplicates", () => {
    const result = analyzeText(
      [
        "error TS2322: first occurrence",
        "error TS2322: first occurrence",
        "error TS2322: repeated occurrence",
        "FATAL ERROR: Reached heap limit",
        "error TS2322: third occurrence",
      ].join("\n"),
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") {
      return;
    }

    const typeFindings = result.findings.filter((finding) => finding.ruleId === RULE_IDS.typescript);
    expect(typeFindings).toHaveLength(3);
    expect(typeFindings.find((finding) => finding.signature?.includes("first occurrence"))?.evidence.filter((line) => line.role === "primary").map((line) => line.lineNumber)).toEqual([
      1,
      2,
    ]);
    expect(result.findings.some((finding) => finding.category === "memory")).toBe(true);
    expect(result.findings.every((finding) => finding.ruleCatalogVersion === "buildmedic-rules-1")).toBe(true);
  });

  it("does not turn successful, source-like, or merely preparatory output into findings", () => {
    const result = analyzeText(AMBIGUOUS_AND_SAFE_LOG);

    expect(result.status).toBe("no-match");
    expect(result.findings).toEqual([]);
  });

  it("returns the generic no-match outcome for unknown logs", () => {
    const result = analyzeLog("a custom tool completed with status 0\nall checks passed");

    expect(result).toMatchObject({
      status: "no-match",
      findings: [],
      message: "No supported diagnostic matched this log.",
    });
  });

  it("strips control noise for matching and redacts secrets in displayed evidence", () => {
    const result = analyzeText(ANSI_AND_SECRET_LOG);
    const network = findingFor(result, RULE_IDS.network);
    const evidenceText = network.evidence.map((line) => line.text).join("\n");

    expect(evidenceText).not.toContain("fixture-secret");
    expect(evidenceText).not.toContain("fixtureBearerToken123");
    expect(evidenceText).not.toContain("user:password@");
    expect(network.evidence.some((line) => line.redacted === true)).toBe(true);
    expect(redactSensitiveText("token=secret-value password:pw").text).toContain("[REDACTED SECRET]");
    expect(redactSensitiveText("_authToken=fixture-token").text).not.toContain("fixture-token");
    expect(redactSensitiveText("-----BEGIN RSA PRIVATE KEY-----fixture-key").text).toContain("[REDACTED PRIVATE KEY]");
    expect(sanitizeEvidenceLine("long-value", 5).text.length).toBeLessThanOrEqual(5);
  });

  it("rejects empty and oversized input before diagnostics", () => {
    expect(analyzeText("")).toMatchObject({
      status: "invalid",
      error: { code: "required", field: "log" },
      findings: [],
    });
    expect(analyzeText("12345", { maxInputBytes: 4 })).toMatchObject({
      status: "invalid",
      error: { code: "too-large", actualBytes: 5, limitBytes: 4 },
      findings: [],
    });
    expect(analyzeText("x\n".repeat(4), { maxInputLines: 2 })).toMatchObject({
      status: "invalid",
      error: { code: "too-large" },
    });
  });

  it("is deterministic across repeated runs and supports injected identity values", () => {
    const first = analyzeText(DIAGNOSTIC_FAMILIES_LOG);
    const second = analyzeText(DIAGNOSTIC_FAMILIES_LOG);
    expect(second).toEqual(first);

    const injected = analyzeText("error TS2322", {
      timestampFactory: () => "2026-10-16T00:00:00.000Z",
      idFactory: (kind, seed) => `${kind}-injected-${seed.length}`,
    });
    expect(injected.id).toMatch(/^analysis-injected-/);
    expect(injected.analyzedAt).toBe("2026-10-16T00:00:00.000Z");
  });

  it("keeps evidence and result counts bounded", () => {
    const result = analyzeText(
      Array.from({ length: 12 }, () => "error TS2322: repeated").join("\n"),
      { maxFindings: 1, maxEvidenceLines: 2, maxEvidenceLineLength: 20 },
    );

    expect(result.status).toBe("complete");
    if (result.status === "complete") {
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.evidence).toHaveLength(2);
      expect(result.findings[0]?.evidence.every((line) => line.text.length <= 20)).toBe(true);
    }
  });
});
