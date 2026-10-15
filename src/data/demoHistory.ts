import type { DemoHistoryEntry } from "../types";

/** Demonstration-only history rows; these are not persisted user sessions. */
export const DEMO_HISTORY: readonly DemoHistoryEntry[] = [
  {
    isDemo: true,
    id: "demo-history-baseline",
    analysisId: "demo-analysis-baseline",
    label: "TypeScript build failure",
    createdAt: "2026-01-15T09:30:00.000Z",
    source: "file",
    status: "complete",
    inputBytes: 512,
    findingCount: 2,
    summary: "One high-confidence TypeScript error and one downstream npm lifecycle warning.",
    topFindingId: "demo-finding-ts2322",
  },
  {
    isDemo: true,
    id: "demo-history-rerun",
    analysisId: "demo-analysis-rerun",
    label: "TypeScript build rerun",
    createdAt: "2026-01-15T09:42:00.000Z",
    source: "paste",
    status: "complete",
    inputBytes: 286,
    findingCount: 1,
    summary: "The original compiler error is absent; one secondary lifecycle signal remains for review.",
    topFindingId: "demo-finding-lifecycle-failure",
  },
  {
    isDemo: true,
    id: "demo-history-clean",
    analysisId: "demo-analysis-clean",
    label: "Clean build sample",
    createdAt: "2026-01-15T09:48:00.000Z",
    source: "file",
    status: "no-match",
    inputBytes: 174,
    findingCount: 0,
    summary: "No supported diagnostic matched this demonstration log.",
  },
];
