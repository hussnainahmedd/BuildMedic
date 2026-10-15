import type { Finding, FindingConfidence, FindingSeverity } from "../types";

import { sanitizeEvidenceLine } from "../analyzer/normalize";
import { collectDiagnosticCandidates, RULE_CATALOG_VERSION } from "./rules";
import type { DiagnosticCandidate, DiagnosticRuleContext } from "./types";

export interface DiagnosticEngineInput {
  readonly lines: readonly string[];
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
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), hardMaximum) : fallback;
}

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareCandidates(left: DiagnosticCandidate, right: DiagnosticCandidate): number {
  const severityDifference = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severityDifference !== 0) {
    return severityDifference;
  }

  const confidenceDifference = CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
  if (confidenceDifference !== 0) {
    return confidenceDifference;
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
): readonly Finding["evidence"][number][] {
  const primaryIndexes = [...new Set(group.candidates.map((candidate) => candidate.lineIndex))].sort((left, right) => left - right);
  const primarySet = new Set(primaryIndexes);
  const indexes = new Set<number>(primaryIndexes);
  const radius = boundedPositive(contextLines, 1, HARD_MAX_CONTEXT_LINES);

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
    const leftPrimary = primarySet.has(left) ? 0 : 1;
    const rightPrimary = primarySet.has(right) ? 0 : 1;
    return leftPrimary - rightPrimary || left - right;
  });
  // Keep primary evidence first (as the UI and verification layer expect),
  // while retaining source order within the primary and context groups.
  const selectedIndexes = sortedIndexes.slice(0, boundedPositive(maxEvidenceLines, 6, HARD_MAX_EVIDENCE_LINES));

  return selectedIndexes.map((lineIndex) => {
    const safe = sanitizeEvidenceLine(
      input.lines[lineIndex] ?? "",
      boundedPositive(maxEvidenceLineLength, 512, HARD_MAX_EVIDENCE_LINE_LENGTH),
    );
    return {
      lineNumber: lineIndex + 1,
      text: safe.text,
      role: primarySet.has(lineIndex) ? "primary" : "context",
      ...(safe.redacted ? { redacted: true } : {}),
    };
  });
}

function createFinding(
  group: CandidateGroup,
  input: DiagnosticEngineInput,
  options: DiagnosticEngineOptions,
): Finding {
  const first = group.first;
  const seed = `${first.ruleId}|${first.signature}`;
  const id = options.createId?.("finding", seed) ?? `finding-${stableHash(seed)}`;
  return {
    id,
    ruleId: first.ruleId,
    signature: first.signature,
    category: first.category,
    severity: first.severity,
    confidence: first.confidence,
    title: first.title,
    explanation: first.explanation,
    evidence: collectEvidence(
      group,
      input,
      options.contextLines,
      options.maxEvidenceLines,
      options.maxEvidenceLineLength,
    ),
    suggestedActions: first.suggestedActions,
    verificationHint: first.verificationHint,
    ruleCatalogVersion: options.ruleCatalogVersion,
  };
}

/** Runs all offline rules, consolidates duplicate signatures, and ranks results. */
export function analyzeDiagnostics(
  input: DiagnosticEngineInput,
  options: Partial<DiagnosticEngineOptions> = {},
): readonly Finding[] {
  const context: DiagnosticRuleContext = {
    lines: input.lines,
    matchingLines: input.matchingLines,
    maxMatchesPerRule: boundedPositive(options.maxMatchesPerRule ?? 256, 256, HARD_MAX_MATCHES_PER_RULE),
  };
  const groups = groupCandidates(collectDiagnosticCandidates(context));
  const maxFindings = boundedPositive(options.maxFindings ?? 32, 32, HARD_MAX_FINDINGS);
  const normalizedOptions: DiagnosticEngineOptions = {
    ruleCatalogVersion: options.ruleCatalogVersion ?? RULE_CATALOG_VERSION,
    maxFindings,
    maxEvidenceLines: boundedPositive(options.maxEvidenceLines ?? 6, 6, HARD_MAX_EVIDENCE_LINES),
    maxEvidenceLineLength: boundedPositive(options.maxEvidenceLineLength ?? 512, 512, HARD_MAX_EVIDENCE_LINE_LENGTH),
    contextLines: boundedPositive(options.contextLines ?? 1, 1, HARD_MAX_CONTEXT_LINES),
    maxMatchesPerRule: context.maxMatchesPerRule,
    createId: options.createId,
  };

  return groups.slice(0, maxFindings).map((group) => createFinding(group, input, normalizedOptions));
}

export const collectFindings = analyzeDiagnostics;
