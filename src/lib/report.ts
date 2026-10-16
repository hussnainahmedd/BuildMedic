import { redactSensitiveLog, sanitizeEvidenceLine } from "../analyzer";
import type { AnalysisResult } from "../types";

export const REPORT_FILE_NAME = "buildmedic-report.txt";
export const NO_BUILD_DISCLAIMER = "No build was executed. Findings and suggested commands are text suggestions only; no successful build is claimed.";
export const REPORT_REDACTION_NOTICE = "Redaction notice: sensitive-looking values and control characters are removed from report text. Review sanitized evidence before sharing. Raw logs are not included.";

export function safeReportText(value: string, limit = 4096): string {
  return redactSensitiveLog(value).text.split(/\r\n|\r|\n/).map((line) => sanitizeEvidenceLine(line, limit).text).join("\n");
}
export function reportStatus(analysis: AnalysisResult, hasInput: boolean): string {
  if (analysis.status === "complete") return "Complete";
  if (analysis.status === "no-match") return "No supported match";
  return hasInput ? "Invalid input" : "No analysis available";
}
export function buildAnalysisReport(analysis: AnalysisResult, hasInput: boolean): string {
  const lines = [
    "BUILDMEDIC ANALYSIS REPORT", "==========================", "",
    NO_BUILD_DISCLAIMER, REPORT_REDACTION_NOTICE, "",
    `Status: ${reportStatus(analysis, hasInput)}`,
  ];
  if (analysis.status === "invalid" && !hasInput) {
    lines.push("No analysis has been run in this session.", "Paste or upload a build log from New analysis to generate a report.");
    return lines.join("\n");
  }
  lines.push(
    `Input: ${analysis.input.source === "file" ? "Uploaded build log" : "Pasted build log"}`,
    `Analyzed at: ${safeReportText(analysis.analyzedAt, 80)}`,
    `Input size: ${analysis.input.byteCount} bytes across ${analysis.input.lineCount} lines${analysis.input.countsArePartial ? " (partial counts)" : ""}`,
    `Rule catalog: ${safeReportText(analysis.ruleCatalogVersion, 120)}`, "",
  );
  if (analysis.metadata?.partial || analysis.metadata?.evidenceTruncated) {
    lines.push("PARTIAL / OMISSION WARNING", "This is a bounded result, not an exhaustive log report.",
      `Omitted findings: ${analysis.metadata.omittedFindingCount ?? "unknown"}.`,
      `Limits reached: ${analysis.metadata.limitsReached.map((limit) => safeReportText(limit, 80)).join(", ") || "evidence"}.`,
      analysis.metadata.evidenceTruncated ? "Some evidence was truncated or omitted." : "", "");
  }
  if (analysis.status === "invalid") lines.push("ERROR", "-----", safeReportText(analysis.error.message));
  else if (analysis.status === "no-match") lines.push("RESULT", "------", safeReportText(analysis.message), "No build outcome is inferred from this result.");
  else {
    lines.push(`Findings: ${analysis.findings.length}`, "", "ALL BOUNDED FINDINGS", "--------------------");
    for (const [index, finding] of analysis.findings.entries()) {
      lines.push(
        `${index + 1}. [${safeReportText(finding.severity, 20).toUpperCase()}] ${safeReportText(finding.title)}`,
        `   Rule: ${safeReportText(finding.ruleId)}`, `   Confidence: ${safeReportText(finding.confidence, 20)}`,
        `   Explanation: ${safeReportText(finding.explanation)}`, "   Sanitized evidence:",
        ...finding.evidence.map((evidence) => `   ${evidence.lineNumber}: ${safeReportText(evidence.text)}`),
        "   Suggested next steps (text only; never executed):",
        ...finding.suggestedActions.flatMap((action) => [
          `   - ${safeReportText(action.label)}: ${safeReportText(action.description)}`,
          ...(action.verificationCondition ? [`     Verification condition: ${safeReportText(action.verificationCondition)}`] : []),
        ]), `   Verification guidance: ${safeReportText(finding.verificationHint)}`, "",
      );
    }
  }
  // Apply full-text redaction too, so a multiline value cannot leak across fields.
  return redactSensitiveLog(lines.join("\n")).text;
}
