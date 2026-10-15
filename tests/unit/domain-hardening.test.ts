import { describe, expect, it } from "vitest";

import {
  analyzeText,
  redactSensitiveLog,
} from "../../src/analyzer";
import { RULE_IDS } from "../../src/diagnostics";
import { validateLogText } from "../../src/lib/validation";
import { compareAnalysisResults } from "../../src/verification";

function completeFindings(text: string, options: Parameters<typeof analyzeText>[1] = {}) {
  const result = analyzeText(text, options);
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error(`expected complete, received ${result.status}`);
  return result;
}

describe("domain engine integration hardening", () => {
  it("keeps TypeScript source/message identities distinct and ignores line shifts", () => {
    const baseline = completeFindings([
      "src/one.ts:2:5 - error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/two.ts:4:5 - error TS2322: Type 'boolean' is not assignable to type 'number'.",
    ].join("\n"));
    const rerun = completeFindings([
      "build output moved",
      "src/two.ts:44:18 - error TS2322: Type 'boolean' is not assignable to type 'number'.",
      "src/one.ts:90:2 - error TS2322: Type 'string' is not assignable to type 'number'.",
    ].join("\n"));

    expect(baseline.findings.filter((finding) => finding.ruleId === RULE_IDS.typescript)).toHaveLength(2);
    const comparison = compareAnalysisResults(baseline, rerun);
    expect(comparison).toMatchObject({
      outcome: "no-change",
      summary: { resolvedCount: 0, persistentCount: 2, newCount: 0, uncertainCount: 0 },
    });
  });

  it("does not match different missing packages as one rule", () => {
    const baseline = completeFindings("Error: Cannot find module 'package-a'");
    const rerun = completeFindings("Error: Cannot find module 'package-b'");
    const comparison = compareAnalysisResults(baseline, rerun);

    expect(comparison).toMatchObject({
      outcome: "changed",
      summary: { resolvedCount: 1, persistentCount: 0, newCount: 1, uncertainCount: 0 },
    });
  });

  it("uses an explicit completion marker for useful resolution rows without claiming a pass", () => {
    const baseline = completeFindings("error TS2322: assignment mismatch");
    const rerun = analyzeText("Build completed successfully.");
    expect(rerun.status).toBe("no-match");
    const comparison = compareAnalysisResults(baseline, rerun);

    expect(comparison).toMatchObject({
      status: "compared",
      outcome: "improved",
      summary: { resolvedCount: 1, persistentCount: 0, newCount: 0, uncertainCount: 0 },
    });
    expect(comparison.message).toContain("does not prove that the command executed to completion");
  });

  it("keeps arbitrary no-match reruns uncertain", () => {
    const baseline = completeFindings("error TS2322: assignment mismatch");
    const rerun = analyzeText("an unknown tool emitted an arbitrary message");
    const comparison = compareAnalysisResults(baseline, rerun);

    expect(comparison).toMatchObject({ status: "no-match", outcome: "uncertain", summary: { uncertainCount: 1 } });
    expect(comparison.comparisons[0]?.state).toBe("uncertain");
  });

  it("marks catalog changes and capped analyses uncertain", () => {
    const baseline = completeFindings("error TS2322: assignment mismatch", { ruleCatalogVersion: "rules-a" });
    const changedCatalog = completeFindings("error TS2322: assignment mismatch", { ruleCatalogVersion: "rules-b" });
    expect(compareAnalysisResults(baseline, changedCatalog)).toMatchObject({
      outcome: "uncertain",
      summary: { uncertainCount: 1 },
      comparisons: [{ state: "uncertain" }],
    });

    const capped = completeFindings([
      "error TS2322: first",
      "error TS2322: second",
    ].join("\n"), { maxFindings: 1 });
    expect(capped.metadata?.partial).toBe(true);
    expect(compareAnalysisResults(capped, baseline).outcome).toBe("uncertain");
  });

  it("ranks concrete compiler failures before ambiguous SIGKILL evidence", () => {
    const result = completeFindings(["SIGKILL", "error TS2322: assignment mismatch"].join("\n"));
    expect(result.findings[0]?.ruleId).toBe(RULE_IDS.typescript);
    const memory = result.findings.find((finding) => finding.ruleId === RULE_IDS.memory);
    expect(memory?.confidence).toBe("low");
    expect(memory?.explanation).toMatch(/SIGKILL|137/);
    expect(memory?.explanation).toMatch(/ambiguous|not prove|not.*memory/i);
  });

  it("covers warning, CLI, multiline, native, and registry distinctions", () => {
    expect(analyzeText("TypeScript compilation succeeded with no errors").status).toBe("no-match");
    expect(analyzeText("TS2322 is fixed and no longer reported").status).toBe("no-match");
    const peer = completeFindings("YN0002 peer dependency is incorrectly met").findings.find((finding) => finding.ruleId === RULE_IDS.dependencyConflict);
    expect(peer?.severity).toBe("warning");
    expect(completeFindings("ERR_PNPM_NO_SCRIPT Missing script: build").findings[0]?.ruleId).toBe(RULE_IDS.missingScript);
    expect(completeFindings('error Command "build" not found.').findings[0]?.ruleId).toBe(RULE_IDS.missingScript);
    expect(completeFindings("sh: esbuild: command not found").findings[0]?.ruleId).toBe(RULE_IDS.missingCli);
    const prebuiltNotice = completeFindings("node-gyp info No prebuilt binaries found for this platform").findings.find((finding) => finding.ruleId === RULE_IDS.native);
    expect(prebuiltNotice).toMatchObject({ severity: "warning", confidence: "low" });

    const lock = completeFindings("npm ci can only install packages when your package.json and\npackage-lock.json are in sync.");
    expect(lock.findings.some((finding) => finding.ruleId === RULE_IDS.lockfile)).toBe(true);
    const missing = completeFindings("Error: Cannot find module\n'package-a'");
    expect(missing.findings.some((finding) => finding.ruleId === RULE_IDS.missingModule)).toBe(true);

    const auth = completeFindings("npm error code E401").findings.find((finding) => finding.ruleId === RULE_IDS.network);
    expect(auth?.title).toMatch(/authentication|authorization/i);
    expect(auth?.explanation).toMatch(/not proof of a connectivity failure/i);
    const notFound = completeFindings("npm ERR! code E404").findings.find((finding) => finding.ruleId === RULE_IDS.network);
    expect(notFound?.explanation).toMatch(/does not by itself prove a local module is missing/i);
  });

  it("keeps each detector focused on positive, negative, and ambiguous evidence", () => {
    const cases: readonly {
      readonly ruleId: string;
      readonly positive: string;
      readonly negative: string;
      readonly ambiguous?: string;
    }[] = [
      { ruleId: RULE_IDS.typescript, positive: "error TS2322: mismatch", negative: "tsc compiled successfully", ambiguous: "TypeScript compiler diagnostic reported" },
      { ruleId: RULE_IDS.missingModule, positive: "Error: Cannot find module 'pkg'", negative: "const message = 'Cannot find module'", ambiguous: "Could not find dependency in the install state" },
      { ruleId: RULE_IDS.dependencyConflict, positive: "ERESOLVE unable to resolve dependency tree", negative: "peer dependencies are satisfied", ambiguous: "peer dependency is unmet" },
      { ruleId: RULE_IDS.lockfile, positive: "YN0028 lockfile would have been modified", negative: "package-lock.json is up to date", ambiguous: "frozen-lockfile update requested" },
      { ruleId: RULE_IDS.missingScript, positive: "Missing script: build", negative: "npm run build", ambiguous: "error Command \"build\" not found" },
      { ruleId: RULE_IDS.filesystem, positive: "npm error code EACCES", negative: "filesystem access granted", ambiguous: "ENOENT while opening a file" },
      { ruleId: RULE_IDS.network, positive: "npm error code EAI_AGAIN", negative: "registry request succeeded", ambiguous: "registry error" },
      { ruleId: RULE_IDS.native, positive: "gyp ERR! configure error", negative: "node-gyp info using node-gyp", ambiguous: "node-gyp info no prebuilt binaries found" },
      { ruleId: RULE_IDS.memory, positive: "JavaScript heap out of memory", negative: "build completed successfully", ambiguous: "SIGKILL" },
      { ruleId: RULE_IDS.missingCli, positive: "sh: esbuild: command not found", negative: "esbuild command found" },
    ];

    for (const item of cases) {
      expect(analyzeText(item.positive).status === "complete" && analyzeText(item.positive).findings.some((finding) => finding.ruleId === item.ruleId)).toBe(true);
      const negative = analyzeText(item.negative);
      expect(negative.status === "complete" && negative.findings.some((finding) => finding.ruleId === item.ruleId)).toBe(false);
      if (item.ambiguous !== undefined) {
        const ambiguous = analyzeText(item.ambiguous);
        expect(ambiguous.status === "complete" && ambiguous.findings.some((finding) => finding.ruleId === item.ruleId)).toBe(true);
      }
    }
  });

  it("rejects binary, oversized, and overlong input before regex work", () => {
    expect(analyzeText("bad\u0000log")).toMatchObject({ status: "invalid", error: { code: "unreadable" } });
    expect(analyzeText("x".repeat(40), { maxInputLineLength: 10 })).toMatchObject({
      status: "invalid",
      error: { code: "too-large", lineNumber: 1, limitLineLength: 10 },
    });
    expect(validateLogText("x".repeat(40), {
      warningBytes: 4,
      maxBytes: 100,
      maxLineLength: 10,
      acceptedMimeTypes: ["text/plain"],
    })).toMatchObject({ valid: false, error: { lineNumber: 1, limitLineLength: 10 } });
  });

  it("redacts complete private keys, JSON/env secrets, and URL query credentials by line-preserving helper", () => {
    const log = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "private-material-must-not-leak",
      "-----END RSA PRIVATE KEY-----",
      '{"apiKey":"json-secret","password":"json-password"}',
      "BUILD_TOKEN=env-secret",
      "PRIVATE_KEY=another-secret",
      "https://registry.invalid/pkg?access_token=query-secret&x=1",
    ].join("\n");
    const safe = redactSensitiveLog(log);
    expect(safe.redacted).toBe(true);
    expect(safe.text.split("\n")).toHaveLength(log.split("\n").length);
    for (const secret of ["private-material-must-not-leak", "json-secret", "json-password", "env-secret", "another-secret", "query-secret"]) {
      expect(safe.text).not.toContain(secret);
    }
    expect(redactSensitiveLog("npm_secret=lowercase-secret").text).not.toContain("lowercase-secret");
    const finding = completeFindings("Error: Cannot find module 'npm_secret=lowercase-secret'").findings[0];
    expect(JSON.stringify(finding)).not.toContain("lowercase-secret");
  });
});
