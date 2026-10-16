// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analyzeText } from "../../src/analyzer";
import { RULE_IDS } from "../../src/diagnostics";

describe("diagnostic fast paths retain required cues and source evidence", () => {
  it.each([
    "sh: 1: vite: not found",
    "/bin/sh: tsc: command not found",
    "command 'webpack' not found",
    "'rollup': NOT\tFOUND",
    "./node_modules/.bin/esbuild: not found",
  ])("recognizes a missing CLI amid unrelated progress: %s", (diagnostic) => {
    const result = analyzeText(`${"info bundling with local dependencies\n".repeat(300)}${diagnostic}`);
    expect(result.status).toBe("complete");
    expect(result.findings).toEqual([expect.objectContaining({ ruleId: RULE_IDS.missingCli, severity: "error", evidence: expect.arrayContaining([expect.objectContaining({ lineNumber: 301, role: "primary" })]) })]);
  });

  it("retains forward lockfile details without attaching them to unrelated progress", () => {
    const result = analyzeText("info preparing a package\nnpm ci\npackage-lock.json is not in sync\ninfo complete");
    const lockfiles = result.findings.filter((finding) => finding.ruleId === RULE_IDS.lockfile);
    expect(lockfiles.length).toBeGreaterThan(0);
    expect(lockfiles.flatMap((finding) => finding.evidence.filter((line) => line.role === "primary").map((line) => line.lineNumber))).not.toContain(1);
    expect(lockfiles.some((finding) => finding.evidence[0]?.lineNumber === 2)).toBe(true);
  });

  it("retains unknown and source-only outcomes for long no-cue progress logs", () => {
    const log = `${"info bundling with local dependencies\n".repeat(300)}const message = 'vite: not found';`;
    expect(analyzeText(log).status).toBe("no-match");
  });
});
