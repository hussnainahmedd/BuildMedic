import type { Finding } from "./finding";
import type { ValidationError } from "./validation";

export const VERIFICATION_FINDING_STATES = ["resolved", "persistent", "new", "uncertain"] as const;

export type VerificationFindingState = (typeof VERIFICATION_FINDING_STATES)[number];

export const VERIFICATION_STATUSES = ["compared", "no-match", "invalid"] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type VerificationOutcome = "improved" | "no-change" | "regressed" | "changed" | "uncertain";

export interface FindingComparison {
  readonly id: string;
  /** Stable rule/signature key, never an array-position match. */
  readonly findingKey: string;
  readonly ruleId: string;
  readonly title: string;
  readonly state: VerificationFindingState;
  readonly baselineFindingId?: string;
  readonly rerunFindingId?: string;
  readonly baselineFinding?: Finding;
  readonly rerunFinding?: Finding;
}

export interface VerificationSummary {
  readonly resolvedCount: number;
  readonly persistentCount: number;
  readonly newCount: number;
  /** Number of transitions whose identity/evidence could not be matched confidently. */
  readonly uncertainCount?: number;
}

export interface VerificationResultBase {
  readonly id: string;
  readonly baselineAnalysisId: string;
  readonly rerunAnalysisId: string;
}

export interface ComparedVerificationResult extends VerificationResultBase {
  readonly status: "compared";
  readonly outcome: VerificationOutcome;
  readonly comparisons: readonly FindingComparison[];
  readonly summary: VerificationSummary;
  readonly message?: string;
}

export interface NoMatchVerificationResult extends VerificationResultBase {
  readonly status: "no-match";
  readonly outcome: "no-change";
  readonly comparisons: readonly [];
  readonly summary: VerificationSummary;
  readonly message: string;
}

export interface InvalidVerificationResult extends VerificationResultBase {
  readonly status: "invalid";
  readonly comparisons: readonly [];
  readonly error: ValidationError;
}

export type VerificationResult =
  | ComparedVerificationResult
  | NoMatchVerificationResult
  | InvalidVerificationResult;

/** Marker carried by verification fixtures so they cannot be mistaken for live comparisons. */
export type DemoVerificationResult = VerificationResult & { readonly isDemo: true };
