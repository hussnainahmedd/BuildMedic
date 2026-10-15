import type { Finding } from "./finding";
import type { ValidationError } from "./validation";

export const ANALYSIS_STATUSES = ["complete", "no-match", "invalid"] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export type AnalysisSource = "paste" | "file";

export interface AnalysisInputSummary {
  readonly source: AnalysisSource;
  readonly fileName?: string;
  readonly byteCount: number;
  readonly lineCount: number;
  readonly normalizedNewlines: boolean;
  readonly countsArePartial?: boolean;
}

export interface AnalysisRequest {
  readonly text: string;
  readonly source: AnalysisSource;
  readonly fileName?: string;
}

export interface AnalysisResultBase {
  readonly id: string;
  readonly analyzedAt: string;
  readonly input: AnalysisInputSummary;
  readonly ruleCatalogVersion: string;
  readonly metadata?: AnalysisMetadata;
}

export type AnalysisLimit = "findings" | "matches-per-rule" | "evidence";

/** Optional for compatibility with older stored results. No marker is an executed check. */
export interface AnalysisMetadata {
  readonly partial: boolean;
  readonly limitsReached: readonly AnalysisLimit[];
  readonly omittedFindingCount?: number;
  readonly cappedRuleIds?: readonly string[];
  readonly evidenceTruncated?: boolean;
  readonly buildCompletion?: {
    readonly lineNumber: number;
    readonly text: string;
  };
}

export interface CompleteAnalysisResult extends AnalysisResultBase {
  readonly status: "complete";
  readonly findings: readonly Finding[];
  readonly message?: string;
}

export interface NoMatchAnalysisResult extends AnalysisResultBase {
  readonly status: "no-match";
  readonly findings: readonly [];
  readonly message: string;
}

export interface InvalidAnalysisResult extends AnalysisResultBase {
  readonly status: "invalid";
  readonly findings: readonly [];
  readonly error: ValidationError;
}

export type AnalysisResult =
  | CompleteAnalysisResult
  | NoMatchAnalysisResult
  | InvalidAnalysisResult;

export interface BuildLogSample {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly text: string;
  readonly sanitizationNote: string;
}

/** Marker carried by the frontend-only sample log. */
export type DemoBuildLog = BuildLogSample & { readonly isDemo: true };

/** Marker for any analysis result that is safe to use only as fixture content. */
export type DemoAnalysisResult = AnalysisResult & { readonly isDemo: true };
