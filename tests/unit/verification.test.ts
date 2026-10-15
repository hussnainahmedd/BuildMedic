import { describe, expect, it } from "vitest";

import { compareAnalysisResults, getFindingKey } from "../../src/verification";
import type { AnalysisResult, Finding } from "../../src/types";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-default",
    ruleId: "typescript/assignment",
    category: "typescript",
    severity: "error",
    confidence: "high",
    title: "Assignment diagnostic",
    explanation: "The assignment does not satisfy the declared type.",
    evidence: [{ lineNumber: 1, text: "error TS2322: assignment mismatch", role: "primary" }],
    suggestedActions: [],
    verificationHint: "Run the same build again.",
    ruleCatalogVersion: "rules-1",
    ...overrides,
  };
}

function makeComplete(id: string, findings: readonly Finding[]): AnalysisResult {
  return {
    id,
    status: "complete",
    analyzedAt: "2026-10-16T00:00:00.000Z",
    input: {
      source: "paste",
      byteCount: 1,
      lineCount: 1,
      normalizedNewlines: true,
    },
    ruleCatalogVersion: "rules-1",
    findings,
  };
}

function makeNoMatch(id: string): AnalysisResult {
  return {
    id,
    status: "no-match",
    analyzedAt: "2026-10-16T00:00:00.000Z",
    input: {
      source: "paste",
      byteCount: 1,
      lineCount: 1,
      normalizedNewlines: true,
    },
    ruleCatalogVersion: "rules-1",
    findings: [],
    message: "No supported diagnostic matched this log.",
  };
}

function makeInvalid(id: string, field: "baseline" | "rerun"): AnalysisResult {
  return {
    id,
    status: "invalid",
    analyzedAt: "2026-10-16T00:00:00.000Z",
    input: {
      source: "paste",
      byteCount: 0,
      lineCount: 0,
      normalizedNewlines: true,
    },
    ruleCatalogVersion: "rules-1",
    findings: [],
    error: {
      code: "unreadable",
      field,
      message: `${field} analysis is invalid.`,
    },
  };
}

describe("compareAnalysisResults", () => {
  it("classifies a baseline finding absent from the rerun as resolved", () => {
    const baseline = makeFinding({ id: "baseline-1", ruleId: "typescript/assignment" });
    const result = compareAnalysisResults(makeComplete("analysis-before", [baseline]), makeComplete("analysis-after", []));

    expect(result).toMatchObject({
      status: "compared",
      baselineAnalysisId: "analysis-before",
      rerunAnalysisId: "analysis-after",
      outcome: "improved",
      summary: { resolvedCount: 1, persistentCount: 0, newCount: 0, uncertainCount: 0 },
    });
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0]).toMatchObject({
      findingKey: "typescript/assignment",
      state: "resolved",
      baselineFindingId: "baseline-1",
    });
  });

  it("classifies a finding present on both sides as persistent", () => {
    const baseline = makeFinding({ id: "baseline-1", ruleId: "npm/lifecycle" });
    const rerun = makeFinding({ id: "rerun-9", ruleId: "npm/lifecycle" });
    const result = compareAnalysisResults(makeComplete("before", [baseline]), makeComplete("after", [rerun]));

    expect(result).toMatchObject({
      status: "compared",
      outcome: "no-change",
      summary: { resolvedCount: 0, persistentCount: 1, newCount: 0, uncertainCount: 0 },
    });
    expect(result.comparisons[0]).toMatchObject({
      state: "persistent",
      baselineFindingId: "baseline-1",
      rerunFindingId: "rerun-9",
    });
  });

  it("classifies a finding introduced by the rerun as new", () => {
    const rerun = makeFinding({ id: "rerun-1", ruleId: "lockfile/missing" });
    const result = compareAnalysisResults(makeComplete("before", []), makeComplete("after", [rerun]));

    expect(result).toMatchObject({
      status: "compared",
      outcome: "regressed",
      summary: { resolvedCount: 0, persistentCount: 0, newCount: 1, uncertainCount: 0 },
    });
    expect(result.comparisons[0]).toMatchObject({ state: "new", rerunFindingId: "rerun-1" });
  });

  it("reports mixed resolved, persistent, and new transitions in stable key order", () => {
    const baseline = makeComplete("before", [
      makeFinding({ id: "b-z", ruleId: "z-rule", title: "Z", evidence: [{ lineNumber: 1, text: "z signal" }] }),
      makeFinding({ id: "b-a", ruleId: "a-rule", title: "A", evidence: [{ lineNumber: 2, text: "a signal" }] }),
      makeFinding({ id: "b-p", ruleId: "p-rule", title: "P", evidence: [{ lineNumber: 3, text: "p signal" }] }),
    ]);
    const rerun = makeComplete("after", [
      makeFinding({ id: "r-p", ruleId: "p-rule", title: "P", evidence: [{ lineNumber: 30, text: "p signal" }] }),
      makeFinding({ id: "r-n", ruleId: "n-rule", title: "N", evidence: [{ lineNumber: 40, text: "n signal" }] }),
    ]);

    const result = compareAnalysisResults(baseline, rerun);

    expect(result).toMatchObject({
      outcome: "changed",
      summary: { resolvedCount: 2, persistentCount: 1, newCount: 1, uncertainCount: 0 },
    });
    expect(result.comparisons.map((comparison) => [comparison.findingKey, comparison.state])).toEqual([
      ["a-rule", "resolved"],
      ["n-rule", "new"],
      ["p-rule", "persistent"],
      ["z-rule", "resolved"],
    ]);
  });

  it("matches reordered findings by normalized rule identity rather than position", () => {
    const first = makeFinding({ id: "a", ruleId: "rule/a", title: "A" });
    const second = makeFinding({ id: "b", ruleId: "rule/b", title: "B" });
    const baseline = makeComplete("before", [first, second]);
    const orderedRerun = makeComplete("after", [
      makeFinding({ ...second, id: "b-rerun" }),
      makeFinding({ ...first, id: "a-rerun" }),
    ]);
    const reorderedRerun = makeComplete("after", [
      makeFinding({ ...first, id: "a-rerun" }),
      makeFinding({ ...second, id: "b-rerun" }),
    ]);

    const ordered = compareAnalysisResults(baseline, orderedRerun);
    const reordered = compareAnalysisResults(baseline, reorderedRerun);

    expect(ordered.comparisons).toEqual(reordered.comparisons);
    expect(ordered.summary).toEqual(reordered.summary);
    expect(ordered.comparisons.every((comparison) => comparison.state === "persistent")).toBe(true);
  });

  it("normalizes identity casing and separator whitespace without using generated ids", () => {
    const baselineFinding = makeFinding({ id: "generated-before", ruleId: " TypeScript / TS2322 " });
    const rerunFinding = makeFinding({ id: "generated-after", ruleId: "typescript/ts2322" });
    const result = compareAnalysisResults(
      makeComplete("before", [baselineFinding]),
      makeComplete("after", [rerunFinding]),
    );

    expect(getFindingKey(baselineFinding)).toBe("typescript/ts2322");
    expect(result.summary).toMatchObject({ persistentCount: 1, resolvedCount: 0, newCount: 0, uncertainCount: 0 });
    expect(result.comparisons[0]).toMatchObject({
      findingKey: "typescript/ts2322",
      state: "persistent",
      baselineFindingId: "generated-before",
      rerunFindingId: "generated-after",
    });
  });

  it("marks duplicate identities with indistinguishable evidence as uncertain", () => {
    const baseline = makeComplete("before", [
      makeFinding({ id: "b-1", ruleId: "same-rule" }),
      makeFinding({ id: "b-2", ruleId: "same-rule" }),
    ]);
    const rerun = makeComplete("after", [
      makeFinding({ id: "r-1", ruleId: "same-rule" }),
      makeFinding({ id: "r-2", ruleId: "same-rule" }),
    ]);

    const result = compareAnalysisResults(baseline, rerun);

    expect(result.outcome).toBe("uncertain");
    expect(result.summary).toMatchObject({ resolvedCount: 0, persistentCount: 0, newCount: 0, uncertainCount: 2 });
    expect(result.comparisons.every((comparison) => comparison.state === "uncertain")).toBe(true);
  });

  it("uses unique evidence signatures to disambiguate duplicate rule identities", () => {
    const baseline = makeComplete("before", [
      makeFinding({ id: "b-a", ruleId: "same-rule", evidence: [{ lineNumber: 1, text: "alpha" }] }),
      makeFinding({ id: "b-b", ruleId: "same-rule", evidence: [{ lineNumber: 2, text: "beta" }] }),
    ]);
    const rerun = makeComplete("after", [
      makeFinding({ id: "r-b", ruleId: "same-rule", evidence: [{ lineNumber: 20, text: "beta" }] }),
      makeFinding({ id: "r-a", ruleId: "same-rule", evidence: [{ lineNumber: 10, text: "alpha" }] }),
    ]);

    const result = compareAnalysisResults(baseline, rerun);

    expect(result.summary).toMatchObject({ resolvedCount: 0, persistentCount: 2, newCount: 0, uncertainCount: 0 });
    expect(result.comparisons.map((comparison) => comparison.rerunFindingId)).toEqual(["r-a", "r-b"]);
  });

  it("marks conflicting identities with matching evidence as uncertain instead of resolved and new", () => {
    const baseline = makeFinding({ id: "b", ruleId: "rule-a", evidence: [{ lineNumber: 1, text: "same signal" }] });
    const rerun = makeFinding({ id: "r", ruleId: "rule-b", evidence: [{ lineNumber: 1, text: "same signal" }] });
    const result = compareAnalysisResults(makeComplete("before", [baseline]), makeComplete("after", [rerun]));

    expect(result).toMatchObject({ outcome: "uncertain", summary: { resolvedCount: 0, newCount: 0, uncertainCount: 1 } });
    expect(result.comparisons[0]).toMatchObject({ state: "uncertain", baselineFindingId: "b", rerunFindingId: "r" });
  });

  it("treats clean complete analyses as no-change without claiming a pass", () => {
    const result = compareAnalysisResults(makeComplete("before", []), makeComplete("after", []));

    expect(result).toMatchObject({
      status: "compared",
      outcome: "no-change",
      comparisons: [],
      summary: { resolvedCount: 0, persistentCount: 0, newCount: 0, uncertainCount: 0 },
    });
    expect(result.message?.toLowerCase()).not.toMatch(/pass|success|fail/);
  });

  it("keeps identical inputs deterministic and reports persistent findings", () => {
    const analysis = makeComplete("same-analysis", [makeFinding({ id: "same-finding", ruleId: "same-rule" })]);
    const first = compareAnalysisResults(analysis, analysis);
    const second = compareAnalysisResults(analysis, analysis);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ outcome: "no-change", summary: { persistentCount: 1 } });
    expect(first.message).toContain("no change");
  });

  it("returns the existing invalid result shape without transition labels", () => {
    const result = compareAnalysisResults(makeInvalid("bad-baseline", "baseline"), makeComplete("rerun", []));

    expect(result).toMatchObject({ status: "invalid", baselineAnalysisId: "bad-baseline", rerunAnalysisId: "rerun" });
    expect(result.comparisons).toEqual([]);
    expect(result.error).toMatchObject({ field: "baseline", code: "unreadable" });
    expect("summary" in result).toBe(false);
  });

  it("rejects an invalid rerun without labeling baseline findings as resolved", () => {
    const result = compareAnalysisResults(
      makeComplete("baseline", [makeFinding({ id: "baseline-finding" })]),
      makeInvalid("bad-rerun", "rerun"),
    );

    expect(result.status).toBe("invalid");
    expect(result.comparisons).toEqual([]);
    expect(result.error.field).toBe("rerun");
    expect(JSON.stringify(result)).not.toMatch(/resolved|persistent|new/);
  });

  it("returns no-match without treating an unsupported log as a clean rerun", () => {
    const result = compareAnalysisResults(makeComplete("baseline", [makeFinding()]), makeNoMatch("rerun"));

    expect(result).toMatchObject({
      status: "no-match",
      outcome: "no-change",
      comparisons: [],
      summary: { resolvedCount: 0, persistentCount: 0, newCount: 0, uncertainCount: 0 },
    });
    expect(result.message).toContain("uncertain");
    expect(result.message).not.toContain("resolved");
  });

  it("bounds returned rows while retaining deterministic summary counts", () => {
    const baseline = makeComplete(
      "before",
      Array.from({ length: 4 }, (_, index) => makeFinding({ id: `b-${index}`, ruleId: `rule-${index}` })),
    );
    const rerun = makeComplete(
      "after",
      Array.from({ length: 4 }, (_, index) => makeFinding({ id: `r-${index}`, ruleId: `rule-${index}` })),
    );
    const result = compareAnalysisResults(baseline, rerun, { maxComparisons: 2 });

    expect(result.comparisons).toHaveLength(2);
    expect(result.summary).toMatchObject({ persistentCount: 4, uncertainCount: 0 });
    expect(result.message).toContain("omitted");
  });
});
