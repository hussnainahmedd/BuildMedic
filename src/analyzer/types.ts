import type { AnalysisResult, AnalysisSource } from "../types";

export const DEFAULT_MAX_ANALYZED_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_ANALYZED_LINES = 100_000;
export const DEFAULT_MAX_FINDINGS = 32;
export const DEFAULT_MAX_EVIDENCE_LINES = 6;
export const DEFAULT_MAX_EVIDENCE_LINE_LENGTH = 512;
export const DEFAULT_CONTEXT_LINES = 1;
export const DEFAULT_MAX_MATCHES_PER_RULE = 256;

/** Hard ceilings keep caller-provided tuning from removing safety bounds. */
export const HARD_MAX_ANALYZED_BYTES = 50 * 1024 * 1024;
export const HARD_MAX_ANALYZED_LINES = 200_000;
export const HARD_MAX_FINDINGS = 256;
export const HARD_MAX_EVIDENCE_LINES = 16;
export const HARD_MAX_EVIDENCE_LINE_LENGTH = 4096;
export const HARD_MAX_CONTEXT_LINES = 4;
export const HARD_MAX_MATCHES_PER_RULE = 1_024;

export interface AnalyzeOptions {
  readonly source?: AnalysisSource;
  readonly fileName?: string;
  readonly maxInputBytes?: number;
  /** Optional character guard for environments that impose a string limit. */
  readonly maxInputCharacters?: number;
  readonly maxInputLines?: number;
  readonly maxFindings?: number;
  readonly maxEvidenceLines?: number;
  readonly maxEvidenceLineLength?: number;
  readonly contextLines?: number;
  readonly maxMatchesPerRule?: number;
  readonly ruleCatalogVersion?: string;
  /** Alias for callers that use the shorter catalog terminology. */
  readonly catalogVersion?: string;
  /** Injected only when a caller needs an application-specific serialized id. */
  readonly idFactory?: (kind: "analysis" | "finding", seed: string) => string;
  /** Injected timestamp; the default engine result is intentionally deterministic. */
  readonly timestampFactory?: () => string;
}

export type AnalyzeRequest =
  | string
  | {
      readonly text?: unknown;
      readonly source?: unknown;
      readonly fileName?: unknown;
    };

export interface AnalyzeApi {
  (text: unknown, options?: AnalyzeOptions): AnalysisResult;
}
