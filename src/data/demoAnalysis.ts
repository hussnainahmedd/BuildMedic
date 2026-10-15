import type { DemoAnalysisResult } from "../types";

import { DEMO_FINDINGS } from "./demoFindings";
import { DEMO_NODE_BUILD_LOG } from "./demoBuildLog";

/**
 * Demonstration-only composition of the sanitized fixture and fixture findings.
 * This is presentation data, not the BuildMedic diagnostic engine.
 */
export const DEMO_ANALYSIS: DemoAnalysisResult = {
  isDemo: true,
  id: "demo-analysis-baseline",
  status: "complete",
  analyzedAt: "2026-01-15T09:30:00.000Z",
  input: {
    source: "file",
    fileName: DEMO_NODE_BUILD_LOG.fileName,
    byteCount: new TextEncoder().encode(DEMO_NODE_BUILD_LOG.text).byteLength,
    lineCount: DEMO_NODE_BUILD_LOG.text.split("\n").length,
    normalizedNewlines: false,
  },
  ruleCatalogVersion: "demo-rules-1",
  findings: DEMO_FINDINGS,
  message: "Two demonstration findings are shown. Live analysis is planned.",
};
