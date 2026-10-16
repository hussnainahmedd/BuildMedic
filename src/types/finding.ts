export const FINDING_CATEGORIES = [
  "dependencies",
  "typescript",
  "package-script",
  "lockfile",
  "permissions",
  "network",
  "native-module",
  "memory",
  "tooling",
  "unknown",
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_SEVERITIES = ["critical", "error", "warning", "info"] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_CONFIDENCES = ["high", "medium", "low"] as const;

export type FindingConfidence = (typeof FINDING_CONFIDENCES)[number];

export interface FindingEvidence {
  readonly lineNumber: number;
  readonly text: string;
  readonly role?: "primary" | "context";
  /** True when one or more sensitive values were replaced in the displayed line. */
  readonly redacted?: boolean;
}

export interface SuggestedAction {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly verificationCondition?: string;
}

export interface Finding {
  readonly id: string;
  /** Stable rule/signature identity used by verification comparisons. */
  readonly ruleId: string;
  /** Stable, more-specific identity used to consolidate repeated diagnostics. */
  readonly signature?: string;
  /** Identity was redacted, ambiguous, or shared by indistinguishable occurrences. */
  readonly identityUncertain?: boolean;
  /** Multiple cues consolidated into this identity; not a proven count of independent errors. */
  readonly occurrenceCount?: number;
  readonly category: FindingCategory;
  readonly severity: FindingSeverity;
  readonly confidence: FindingConfidence;
  readonly title: string;
  readonly explanation: string;
  readonly evidence: readonly FindingEvidence[];
  readonly suggestedActions: readonly SuggestedAction[];
  readonly verificationHint: string;
  readonly ruleCatalogVersion: string;
}

export interface FindingCounts {
  readonly total: number;
  readonly critical: number;
  readonly error: number;
  readonly warning: number;
  readonly info: number;
}

/** Marker carried by fixture findings so they cannot be mistaken for live results. */
export type DemoFinding = Finding & { readonly isDemo: true };
