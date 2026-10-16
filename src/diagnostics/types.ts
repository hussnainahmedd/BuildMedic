import type {
  FindingCategory,
  FindingConfidence,
  FindingSeverity,
  SuggestedAction,
} from "../types";

export interface DiagnosticRuleContext {
  readonly lines: readonly string[];
  readonly matchingLines: readonly string[];
  readonly maxMatchesPerRule: number;
}

export interface DiagnosticCandidate {
  readonly ruleId: string;
  readonly signature: string;
  readonly identityUncertain?: boolean;
  readonly category: FindingCategory;
  readonly severity: FindingSeverity;
  readonly confidence: FindingConfidence;
  readonly title: string;
  readonly explanation: string;
  readonly suggestedActions: readonly SuggestedAction[];
  readonly verificationHint: string;
  /** Zero-based index into DiagnosticRuleContext.lines. */
  readonly lineIndex: number;
  /** Required continuation lines, kept even when optional context is disabled. */
  readonly continuationLineIndexes?: readonly number[];
}

export interface DiagnosticRule {
  readonly id: string;
  readonly detect: (context: DiagnosticRuleContext) => readonly DiagnosticCandidate[];
}
