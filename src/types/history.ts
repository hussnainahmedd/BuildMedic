import type { AnalysisSource, AnalysisStatus } from "./analysis";

export interface AnalysisHistoryEntry {
  readonly id: string;
  readonly analysisId: string;
  readonly label: string;
  readonly createdAt: string;
  readonly source: AnalysisSource;
  readonly status: AnalysisStatus;
  readonly inputBytes: number;
  readonly findingCount: number;
  readonly summary: string;
  readonly topFindingId?: string;
}

/** Marker carried by history fixtures so they cannot be treated as persisted user history. */
export type DemoHistoryEntry = AnalysisHistoryEntry & { readonly isDemo: true };
