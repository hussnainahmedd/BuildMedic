import type { DemoFinding } from "../types";

/** Every entry is a demonstration-only finding; no analyzer produced these values. */
export const DEMO_FINDINGS: readonly DemoFinding[] = [
  {
    isDemo: true,
    id: "demo-finding-ts2322",
    ruleId: "typescript/assignment-type-mismatch",
    category: "typescript",
    severity: "error",
    confidence: "high",
    title: "An optional value is used where a string is required",
    explanation:
      "The TypeScript compiler reports that config.label may be undefined at the call site. The value should be narrowed or given an explicit fallback before it is passed to formatLabel.",
    evidence: [
      {
        lineNumber: 7,
        text:
          "src/formatters/report.ts:18:9 - error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
        role: "primary",
      },
      {
        lineNumber: 8,
        text: "18   return formatLabel(config.label);",
        role: "context",
      },
    ],
    suggestedActions: [
      {
        id: "demo-action-narrow-value",
        label: "Handle the optional label",
        description:
          "Review the intended empty-label behavior and narrow config.label or provide a documented fallback.",
        verificationCondition: "The TypeScript error is absent on the next build.",
      },
    ],
    verificationHint: "Run the same build command again and confirm the TS2322 diagnostic is gone.",
    ruleCatalogVersion: "demo-rules-1",
  },
  {
    isDemo: true,
    id: "demo-finding-lifecycle-failure",
    ruleId: "npm/lifecycle-failure",
    category: "package-script",
    severity: "warning",
    confidence: "medium",
    title: "The npm build script stopped after an earlier compiler error",
    explanation:
      "The lifecycle message is a downstream summary. The compiler diagnostic above is the more useful place to start investigation.",
    evidence: [
      {
        lineNumber: 12,
        text: "npm error Lifecycle script \"build\" failed with error:",
        role: "primary",
      },
      {
        lineNumber: 13,
        text: "npm error code 2",
        role: "context",
      },
    ],
    suggestedActions: [
      {
        id: "demo-action-follow-root-error",
        label: "Start with the compiler diagnostic",
        description:
          "Treat this lifecycle message as a summary and address the higher-confidence TypeScript finding first.",
        verificationCondition: "The lifecycle summary no longer appears after the build succeeds.",
      },
    ],
    verificationHint: "Compare a rerun after the TypeScript finding has been addressed.",
    ruleCatalogVersion: "demo-rules-1",
  },
] as const;
