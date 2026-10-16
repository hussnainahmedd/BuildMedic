import type { AnalysisLimit, Finding, FindingConfidence, FindingSeverity } from "../types";

import { sanitizeEvidenceLine, stripAnsiAndControl } from "../analyzer/normalize";
import { collectDiagnosticCandidates, RULE_CATALOG_VERSION } from "./rules";
import type { DiagnosticCandidate, DiagnosticRuleContext } from "./types";

export interface DiagnosticEngineInput {
  readonly lines: readonly string[];
  /** Optional display copy; matching must continue to use the original lines. */
  readonly evidenceLines?: readonly string[];
  readonly matchingLines: readonly string[];
}

export interface DiagnosticEngineOptions {
  readonly ruleCatalogVersion: string;
  readonly maxFindings: number;
  readonly maxEvidenceLines: number;
  readonly maxEvidenceLineLength: number;
  readonly contextLines: number;
  readonly maxMatchesPerRule: number;
  readonly createId?: (kind: "finding", seed: string) => string;
}

export interface DiagnosticAnalysis {
  readonly findings: readonly Finding[];
  readonly limitsReached: readonly AnalysisLimit[];
  readonly omittedFindingCount?: number;
  readonly cappedRuleIds: readonly string[];
  readonly evidenceTruncated: boolean;
}

interface CandidateGroup {
  readonly first: DiagnosticCandidate;
  readonly candidates: readonly DiagnosticCandidate[];
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  info: 1,
};

const CONFIDENCE_RANK: Record<FindingConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const HARD_MAX_FINDINGS = 256;
const HARD_MAX_EVIDENCE_LINES = 16;
const HARD_MAX_EVIDENCE_LINE_LENGTH = 4096;
const HARD_MAX_CONTEXT_LINES = 4;
const HARD_MAX_MATCHES_PER_RULE = 1_024;

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function boundedPositive(value: number, fallback: number, hardMaximum = Number.MAX_SAFE_INTEGER): number {
  return Number.isFinite(value) && value >= 1 ? Math.min(Math.floor(value), hardMaximum) : fallback;
}

function boundedContext(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), HARD_MAX_CONTEXT_LINES) : 1;
}

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareCandidates(left: DiagnosticCandidate, right: DiagnosticCandidate): number {
  const confidenceDifference = CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }

  const causalDifference = causalRank(right.category) - causalRank(left.category);
  if (causalDifference !== 0) {
    return causalDifference;
  }

  const severityDifference = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severityDifference !== 0) {
    return severityDifference;
  }

  const ruleDifference = compareStrings(left.ruleId, right.ruleId);
  if (ruleDifference !== 0) {
    return ruleDifference;
  }

  const signatureDifference = compareStrings(left.signature, right.signature);
  if (signatureDifference !== 0) {
    return signatureDifference;
  }

  return left.lineIndex - right.lineIndex;
}

/** Compiler and dependency causes should precede ambiguous termination summaries. */
function causalRank(category: DiagnosticCandidate["category"]): number {
  switch (category) {
    case "typescript": return 100;
    case "dependencies": return 95;
    case "lockfile": return 92;
    case "package-script": return 90;
    case "permissions": return 86;
    case "network": return 84;
    case "native-module": return 82;
    case "tooling": return 80;
    case "memory": return 40;
    default: return 0;
  }
}

function groupCandidates(candidates: readonly DiagnosticCandidate[]): readonly CandidateGroup[] {
  const groups = new Map<string, DiagnosticCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.ruleId}|${candidate.signature}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [candidate]);
    } else {
      existing.push(candidate);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      first: [...group].sort(compareCandidates)[0],
      candidates: group,
    }))
    .sort((left, right) => compareCandidates(left.first, right.first));
}

function collectEvidence(
  group: CandidateGroup,
  input: DiagnosticEngineInput,
  contextLines: number,
  maxEvidenceLines: number,
  maxEvidenceLineLength: number,
): { readonly evidence: Finding["evidence"]; readonly truncated: boolean; readonly identityRedacted: boolean } {
  const primaryIndexes = [...new Set(group.candidates.map((candidate) => candidate.lineIndex))].sort((left, right) => left - right);
  const primarySet = new Set(primaryIndexes);
  const indexes = new Set<number>(primaryIndexes);
  const requiredContext = new Set<number>();
  for (const candidate of group.candidates) {
    for (const index of candidate.continuationLineIndexes ?? []) {
      if (index >= 0 && index < input.lines.length) {
        requiredContext.add(index);
        indexes.add(index);
      }
    }
  }
  const evidenceLines = input.evidenceLines ?? input.lines;
  const radius = boundedContext(contextLines);

  for (const primaryIndex of primaryIndexes) {
    for (let offset = 1; offset <= radius; offset += 1) {
      const before = primaryIndex - offset;
      const after = primaryIndex + offset;
      if (before >= 0 && input.lines[before]?.trim().length > 0) {
        indexes.add(before);
      }
      if (after < input.lines.length && input.lines[after]?.trim().length > 0) {
        indexes.add(after);
      }
    }
  }

  const sortedIndexes = [...indexes].sort((left, right) => {
    const leftPrimary = primarySet.has(left) ? 0 : requiredContext.has(left) ? 1 : 2;
    const rightPrimary = primarySet.has(right) ? 0 : requiredContext.has(right) ? 1 : 2;
    return leftPrimary - rightPrimary || left - right;
  });
  // Keep primary evidence first (as the UI and verification layer expect),
  // while retaining source order within the primary and context groups.
  const selectedIndexes = sortedIndexes.slice(0, boundedPositive(maxEvidenceLines, 6, HARD_MAX_EVIDENCE_LINES));

  let truncated = selectedIndexes.length < indexes.size;
  let identityRedacted = false;
  const evidence = selectedIndexes.map((lineIndex) => {
    const originalLine = input.lines[lineIndex] ?? "";
    const displayLine = evidenceLines[lineIndex] ?? originalLine;
    const safe = sanitizeEvidenceLine(
      displayLine,
      boundedPositive(maxEvidenceLineLength, 512, HARD_MAX_EVIDENCE_LINE_LENGTH),
    );
    truncated ||= safe.truncated === true || originalLine.length > maxEvidenceLineLength;
    if (primarySet.has(lineIndex) || requiredContext.has(lineIndex)) {
      identityRedacted ||= stripAnsiAndControl(displayLine) !== stripAnsiAndControl(originalLine);
    }
    return {
      lineNumber: lineIndex + 1,
      text: safe.text,
      role: primarySet.has(lineIndex) ? "primary" as const : "context" as const,
      ...(safe.redacted || displayLine !== originalLine ? { redacted: true } : {}),
    };
  });
  return { evidence, truncated, identityRedacted };
}

function createFinding(
  group: CandidateGroup,
  input: DiagnosticEngineInput,
  options: DiagnosticEngineOptions,
): { readonly finding: Finding; readonly evidenceTruncated: boolean } {
  const first = group.first;
  const seed = `${first.ruleId}|${first.signature}`;
  const id = options.createId?.("finding", seed) ?? `finding-${stableHash(seed)}`;
  const evidence = collectEvidence(group, input, options.contextLines, options.maxEvidenceLines, options.maxEvidenceLineLength);
  const finding: Finding = {
    id,
    ruleId: first.ruleId,
    signature: first.signature,
    ...(first.identityUncertain || evidence.identityRedacted || group.candidates.length > 1 ? { identityUncertain: true } : {}),
    ...(group.candidates.length > 1 ? { occurrenceCount: group.candidates.length } : {}),
    category: first.category,
    severity: first.severity,
    confidence: first.confidence,
    title: first.title,
    explanation: first.explanation,
    evidence: evidence.evidence,
    suggestedActions: first.suggestedActions,
    verificationHint: first.verificationHint,
    ruleCatalogVersion: options.ruleCatalogVersion,
  };
  return { finding, evidenceTruncated: evidence.truncated };
}

/** Runs all offline rules and reports bounded-work metadata for the analyzer boundary. */
export function analyzeDiagnosticsDetailed(
  input: DiagnosticEngineInput,
  options: Partial<DiagnosticEngineOptions> = {},
): DiagnosticAnalysis {
  const maxMatchesPerRule = boundedPositive(options.maxMatchesPerRule ?? 256, 256, HARD_MAX_MATCHES_PER_RULE);
  // Probe one extra candidate per rule so hitting a caller limit is observable
  // without allowing an unbounded detector to run.
  const probeMaxMatches = maxMatchesPerRule + 1;
  const context: DiagnosticRuleContext = {
    lines: input.lines,
    matchingLines: input.matchingLines,
    maxMatchesPerRule: probeMaxMatches,
  };
  const candidates = collectDiagnosticCandidates(context);
  const counts = new Map<string, number>();
  const cappedRules = new Set<string>();
  const boundedCandidates: DiagnosticCandidate[] = [];
  for (const candidate of candidates) {
    const count = (counts.get(candidate.ruleId) ?? 0) + 1;
    counts.set(candidate.ruleId, count);
    if (count <= maxMatchesPerRule) boundedCandidates.push(candidate);
    else cappedRules.add(candidate.ruleId);
  }
  const cappedRuleIds = [...cappedRules].sort(compareStrings);
  const groups = groupCandidates(boundedCandidates);
  const maxFindings = boundedPositive(options.maxFindings ?? 32, 32, HARD_MAX_FINDINGS);
  const normalizedOptions: DiagnosticEngineOptions = {
    ruleCatalogVersion: options.ruleCatalogVersion ?? RULE_CATALOG_VERSION,
    maxFindings,
    maxEvidenceLines: boundedPositive(options.maxEvidenceLines ?? 6, 6, HARD_MAX_EVIDENCE_LINES),
    maxEvidenceLineLength: boundedPositive(options.maxEvidenceLineLength ?? 512, 512, HARD_MAX_EVIDENCE_LINE_LENGTH),
    contextLines: boundedContext(options.contextLines ?? 1),
    maxMatchesPerRule: context.maxMatchesPerRule,
    createId: options.createId,
  };

  const created = groups.slice(0, maxFindings).map((group) => createFinding(group, input, normalizedOptions));
  const findings = created.map((entry) => entry.finding);
  const limitsReached: AnalysisLimit[] = [];
  if (cappedRuleIds.length > 0) limitsReached.push("matches-per-rule");
  if (groups.length > maxFindings) limitsReached.push("findings");
  const evidenceTruncated = created.some((entry) => entry.evidenceTruncated);
  if (evidenceTruncated) limitsReached.push("evidence");
  return {
    findings,
    limitsReached,
    ...(groups.length > maxFindings ? { omittedFindingCount: groups.length - maxFindings } : {}),
    cappedRuleIds,
    evidenceTruncated,
  };
}

/** Runs all offline rules, consolidates duplicate signatures, and ranks results. */
export function analyzeDiagnostics(
  input: DiagnosticEngineInput,
  options: Partial<DiagnosticEngineOptions> = {},
): readonly Finding[] {
  return analyzeDiagnosticsDetailed(input, options).findings;
}

export const collectFindings = analyzeDiagnostics;
