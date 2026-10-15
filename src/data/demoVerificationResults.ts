import type { DemoVerificationResult } from "../types";

/** Demonstration-only comparison showing resolved and persistent findings. */
export const DEMO_VERIFICATION_RESULT: DemoVerificationResult = {
  isDemo: true,
  id: "demo-verification-improved",
  status: "compared",
  outcome: "improved",
  baselineAnalysisId: "demo-analysis-baseline",
  rerunAnalysisId: "demo-analysis-rerun",
  comparisons: [
    {
      id: "demo-comparison-ts2322",
      findingKey: "typescript/assignment-type-mismatch",
      ruleId: "typescript/assignment-type-mismatch",
      title: "An optional value is used where a string is required",
      state: "resolved",
      baselineFindingId: "demo-finding-ts2322",
    },
    {
      id: "demo-comparison-lifecycle",
      findingKey: "npm/lifecycle-failure",
      ruleId: "npm/lifecycle-failure",
      title: "The npm build script stopped after an earlier compiler error",
      state: "persistent",
      baselineFindingId: "demo-finding-lifecycle-failure",
      rerunFindingId: "demo-finding-lifecycle-failure",
    },
  ],
  summary: {
    resolvedCount: 1,
    persistentCount: 1,
    newCount: 0,
  },
  message: "The primary compiler finding resolved; the secondary lifecycle signal remains.",
};

/** Demonstration-only comparison showing that an unchanged input is not a failed fix. */
export const DEMO_NO_CHANGE_VERIFICATION_RESULT: DemoVerificationResult = {
  isDemo: true,
  id: "demo-verification-no-change",
  status: "compared",
  outcome: "no-change",
  baselineAnalysisId: "demo-analysis-baseline",
  rerunAnalysisId: "demo-analysis-baseline",
  comparisons: [
    {
      id: "demo-comparison-no-change-ts2322",
      findingKey: "typescript/assignment-type-mismatch",
      ruleId: "typescript/assignment-type-mismatch",
      title: "An optional value is used where a string is required",
      state: "persistent",
      baselineFindingId: "demo-finding-ts2322",
      rerunFindingId: "demo-finding-ts2322",
    },
  ],
  summary: {
    resolvedCount: 0,
    persistentCount: 1,
    newCount: 0,
  },
  message: "The baseline and rerun are identical; no change was detected.",
};

/** All entries are demonstration-only verification results. */
export const DEMO_VERIFICATION_RESULTS: readonly DemoVerificationResult[] = [
  DEMO_VERIFICATION_RESULT,
  DEMO_NO_CHANGE_VERIFICATION_RESULT,
];
