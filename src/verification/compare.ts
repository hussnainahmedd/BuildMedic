import type { AnalysisResult } from "../types/analysis";
import type { Finding } from "../types/finding";
import type {
  ComparedVerificationResult,
  FindingComparison,
  InvalidVerificationResult,
  NoMatchVerificationResult,
  VerificationOutcome,
  VerificationResult,
  VerificationSummary,
} from "../types/verification";
import type { ValidationError, ValidationErrorCode } from "../types/validation";

/**
 * The comparison engine does not copy complete findings into its result. A
 * finding can contain arbitrary evidence and explanations, so keeping only
 * bounded identity, title, state, and source ids makes the result safe to
 * serialize and pass between workers or UI boundaries.
 */
export const DEFAULT_MAX_COMPARISONS = 512;

const MAX_COMPARISONS = 2048;
const MAX_ANALYSIS_ID_LENGTH = 256;
const MAX_FINDING_ID_LENGTH = 256;
const MAX_KEY_LENGTH = 512;
const MAX_TITLE_LENGTH = 512;
const MAX_SIGNATURE_LENGTH = 1024;
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

export interface VerificationCompareOptions {
  /** Maximum number of comparison rows returned. Counts still cover all rows. */
  readonly maxComparisons?: number;
}

interface NormalizedValue {
  readonly value: string;
  readonly truncated: boolean;
}

interface Candidate {
  readonly index: number;
  readonly id?: string;
  readonly key: string;
  readonly ruleId: string;
  readonly identityReliable: boolean;
  readonly signature: string;
  readonly title: string;
  readonly sortKey: string;
}

interface ComparisonDraft {
  readonly state: FindingComparison["state"];
  readonly key: string;
  readonly ruleId: string;
  readonly title: string;
  readonly baseline?: Candidate;
  readonly rerun?: Candidate;
  readonly sortKey: string;
}

interface AnalysisInspection {
  readonly result?: AnalysisResult;
  readonly error?: ValidationError;
}

/**
 * Normalizes a diagnostic identity without using a finding's generated id.
 * Rule ids are case-insensitive at the comparison boundary and tolerate
 * harmless whitespace or slash differences introduced by log adapters.
 */
export function normalizeDiagnosticIdentity(value: unknown): string {
  return normalizeBoundedIdentity(value).value;
}

/**
 * Returns the stable key used by the comparison engine for a finding. A rule
 * id is preferred; findings without one receive a signature key and are
 * deliberately treated as uncertain by the matcher.
 */
export function getFindingKey(finding: Finding): string {
  return makeCandidate(finding, 0).key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function replaceControlCharacters(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isControl = code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || code === 0x7f;
    result += isControl ? " " : value[index];
  }

  return result;
}

function normalizeBoundedIdentity(value: unknown): NormalizedValue {
  if (typeof value !== "string") {
    return { value: "", truncated: false };
  }

  const normalized = value.normalize("NFKC").replace(/\\/g, "/").toLowerCase();
  const compact = replaceControlCharacters(normalized.replace(ANSI_ESCAPE_PATTERN, ""))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*([/:#._-])\s*/g, "$1");

  return {
    value: compact.slice(0, MAX_KEY_LENGTH),
    truncated: compact.length > MAX_KEY_LENGTH,
  };
}

function normalizeDiagnosticText(value: unknown, limit = MAX_SIGNATURE_LENGTH): NormalizedValue {
  if (typeof value !== "string") {
    return { value: "", truncated: false };
  }

  const normalized = replaceControlCharacters(value.normalize("NFKC").replace(ANSI_ESCAPE_PATTERN, ""))
    .replace(/\s+/g, " ")
    .trim();

  return {
    value: normalized.slice(0, limit),
    truncated: normalized.length > limit,
  };
}

function normalizeDisplayText(value: unknown, limit: number): string {
  return normalizeDiagnosticText(value, limit).value;
}

function normalizeSignatureText(value: unknown): NormalizedValue {
  const normalized = normalizeDiagnosticText(value);
  return { value: normalized.value.toLowerCase(), truncated: normalized.truncated };
}

function readEvidenceSignature(finding: Record<string, unknown>): NormalizedValue {
  if (!Array.isArray(finding.evidence)) {
    return { value: "", truncated: false };
  }

  const evidence = finding.evidence
    .filter(isRecord)
    .map((entry) => ({
      primary: entry.role === "primary" ? 0 : 1,
      text: normalizeSignatureText(entry.text),
    }))
    .filter((entry) => entry.text.value.length > 0)
    .sort((left, right) => left.primary - right.primary || compareStrings(left.text.value, right.text.value));

  if (evidence.length === 0) {
    return { value: "", truncated: false };
  }

  const joined = evidence.map((entry) => entry.text.value).join(" | ");
  return {
    value: joined.slice(0, MAX_SIGNATURE_LENGTH),
    truncated: joined.length > MAX_SIGNATURE_LENGTH || evidence.some((entry) => entry.text.truncated),
  };
}

function makeCandidate(value: unknown, index: number): Candidate {
  const finding = isRecord(value) ? value : undefined;
  const rawRuleId = finding?.ruleId;
  const normalizedRuleId = normalizeBoundedIdentity(rawRuleId);
  const title = normalizeDisplayText(finding?.title, MAX_TITLE_LENGTH);
  const evidenceSignature = readEvidenceSignature(finding ?? {});
  const titleSignature = normalizeSignatureText(finding?.title);
  const signatureValue = evidenceSignature.value || titleSignature.value;
  const signature = signatureValue.slice(0, MAX_SIGNATURE_LENGTH);
  const signatureWasTruncated =
    evidenceSignature.truncated || (!evidenceSignature.value && titleSignature.truncated) || signature.length < signatureValue.length;
  const explicitRuleId = typeof rawRuleId === "string" && normalizedRuleId.value.length > 0;
  const identityReliable = explicitRuleId && !normalizedRuleId.truncated && !signatureWasTruncated;
  const fallbackKey = signature ? `signature:${signature}` : `unknown:${String(index)}`;
  const key = (normalizedRuleId.value || fallbackKey).slice(0, MAX_KEY_LENGTH);
  const rawId = finding?.id;
  const id = typeof rawId === "string" && rawId.length > 0 ? rawId.slice(0, MAX_FINDING_ID_LENGTH) : undefined;
  const ruleId = normalizedRuleId.value || key;
  const sortKey = [key, signature, title, id ?? "", String(index).padStart(12, "0")].join("\u0000");

  return {
    index,
    ...(id === undefined ? {} : { id }),
    key,
    ruleId,
    identityReliable,
    signature: signature ? `s:${signature}` : "",
    title,
    sortKey,
  };
}

function sortCandidates(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort((left, right) => compareStrings(left.sortKey, right.sortKey));
}

function groupCandidates(candidates: readonly Candidate[], keySelector: (candidate: Candidate) => string) {
  const groups = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    const key = keySelector(candidate);
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  return groups;
}

function sortedGroupKeys(left: ReadonlyMap<string, Candidate[]>, right: ReadonlyMap<string, Candidate[]>): string[] {
  return [...new Set([...left.keys(), ...right.keys()])].sort(compareStrings);
}

function createDraft(
  state: FindingComparison["state"],
  baseline: Candidate | undefined,
  rerun: Candidate | undefined,
): ComparisonDraft {
  const key = chooseComparisonKey(baseline, rerun);
  const ruleId = chooseRuleId(baseline, rerun, key);
  const title = rerun?.title || baseline?.title || "Unidentified diagnostic";
  const sortKey = [key, state, baseline?.sortKey ?? "", rerun?.sortKey ?? ""].join("\u0000");

  return { state, key, ruleId, title, ...(baseline ? { baseline } : {}), ...(rerun ? { rerun } : {}), sortKey };
}

function chooseComparisonKey(baseline: Candidate | undefined, rerun: Candidate | undefined): string {
  if (baseline && rerun && baseline.identityReliable && rerun.identityReliable && baseline.key === rerun.key) {
    return baseline.key;
  }

  if (baseline?.identityReliable) return baseline.key;
  if (rerun?.identityReliable) return rerun.key;
  if (baseline?.key) return baseline.key;
  if (rerun?.key) return rerun.key;
  return "unknown";
}

function chooseRuleId(baseline: Candidate | undefined, rerun: Candidate | undefined, key: string): string {
  if (baseline && rerun && baseline.ruleId === rerun.ruleId) return baseline.ruleId;
  if (rerun?.identityReliable) return rerun.ruleId;
  if (baseline?.identityReliable) return baseline.ruleId;
  return key;
}

function markPair(
  drafts: ComparisonDraft[],
  baseline: Candidate | undefined,
  rerun: Candidate | undefined,
  state: FindingComparison["state"],
): void {
  drafts.push(createDraft(state, baseline, rerun));
}

function markUnmatchedGroup(
  drafts: ComparisonDraft[],
  baselineGroup: readonly Candidate[],
  rerunGroup: readonly Candidate[],
  state: FindingComparison["state"],
): void {
  const baseline = sortCandidates(baselineGroup);
  const rerun = sortCandidates(rerunGroup);
  const count = Math.max(baseline.length, rerun.length);

  for (let index = 0; index < count; index += 1) {
    markPair(drafts, baseline[index], rerun[index], state);
  }
}

function matchCandidates(
  baselineCandidates: readonly Candidate[],
  rerunCandidates: readonly Candidate[],
): ComparisonDraft[] {
  const drafts: ComparisonDraft[] = [];
  const usedBaseline = new Set<number>();
  const usedRerun = new Set<number>();
  const baselineByKey = groupCandidates(baselineCandidates, (candidate) => candidate.key);
  const rerunByKey = groupCandidates(rerunCandidates, (candidate) => candidate.key);

  for (const key of sortedGroupKeys(baselineByKey, rerunByKey)) {
    const baselineGroup = baselineByKey.get(key) ?? [];
    const rerunGroup = rerunByKey.get(key) ?? [];

    if (baselineGroup.length === 1 && rerunGroup.length === 1) {
      const baseline = baselineGroup[0];
      const rerun = rerunGroup[0];

      if (baseline && rerun) {
        usedBaseline.add(baseline.index);
        usedRerun.add(rerun.index);
        markPair(drafts, baseline, rerun, baseline.identityReliable && rerun.identityReliable ? "persistent" : "uncertain");
      }
      continue;
    }

    if (baselineGroup.length > 1 && rerunGroup.length > 1) {
      const baselineBySignature = groupCandidates(baselineGroup, (candidate) => candidate.signature);
      const rerunBySignature = groupCandidates(rerunGroup, (candidate) => candidate.signature);

      for (const signature of sortedGroupKeys(baselineBySignature, rerunBySignature)) {
        const baselineSignatureGroup = baselineBySignature.get(signature) ?? [];
        const rerunSignatureGroup = rerunBySignature.get(signature) ?? [];

        if (signature && baselineSignatureGroup.length === 1 && rerunSignatureGroup.length === 1) {
          const baseline = baselineSignatureGroup[0];
          const rerun = rerunSignatureGroup[0];

          if (baseline && rerun) {
            usedBaseline.add(baseline.index);
            usedRerun.add(rerun.index);
            markPair(drafts, baseline, rerun, "persistent");
          }
        }
      }

      const remainingBaseline = baselineGroup.filter((candidate) => !usedBaseline.has(candidate.index));
      const remainingRerun = rerunGroup.filter((candidate) => !usedRerun.has(candidate.index));
      markUnmatchedGroup(drafts, remainingBaseline, remainingRerun, "uncertain");
      for (const candidate of remainingBaseline) usedBaseline.add(candidate.index);
      for (const candidate of remainingRerun) usedRerun.add(candidate.index);
      continue;
    }

    if (baselineGroup.length > 1 || rerunGroup.length > 1) {
      markUnmatchedGroup(drafts, baselineGroup, rerunGroup, "uncertain");
      for (const candidate of baselineGroup) usedBaseline.add(candidate.index);
      for (const candidate of rerunGroup) usedRerun.add(candidate.index);
    }
    // A single candidate on only one side is held for cross-key signature
    // matching before it is called resolved or new.
  }

  const remainingBaseline = baselineCandidates.filter((candidate) => !usedBaseline.has(candidate.index));
  const remainingRerun = rerunCandidates.filter((candidate) => !usedRerun.has(candidate.index));
  const baselineBySignature = groupCandidates(
    remainingBaseline.filter((candidate) => candidate.signature.length > 0),
    (candidate) => candidate.signature,
  );
  const rerunBySignature = groupCandidates(
    remainingRerun.filter((candidate) => candidate.signature.length > 0),
    (candidate) => candidate.signature,
  );

  for (const signature of sortedGroupKeys(baselineBySignature, rerunBySignature)) {
    const baselineGroup = baselineBySignature.get(signature) ?? [];
    const rerunGroup = rerunBySignature.get(signature) ?? [];
    if (baselineGroup.length === 0 || rerunGroup.length === 0) continue;

    markUnmatchedGroup(drafts, baselineGroup, rerunGroup, "uncertain");
    for (const candidate of baselineGroup) usedBaseline.add(candidate.index);
    for (const candidate of rerunGroup) usedRerun.add(candidate.index);
  }

  for (const candidate of baselineCandidates) {
    if (usedBaseline.has(candidate.index)) continue;
    markPair(drafts, candidate, undefined, candidate.identityReliable ? "resolved" : "uncertain");
  }

  for (const candidate of rerunCandidates) {
    if (usedRerun.has(candidate.index)) continue;
    markPair(drafts, undefined, candidate, candidate.identityReliable ? "new" : "uncertain");
  }

  return drafts.sort((left, right) => compareStrings(left.sortKey, right.sortKey));
}

function emptySummary(): VerificationSummary {
  return { resolvedCount: 0, persistentCount: 0, newCount: 0, uncertainCount: 0 };
}

function summarize(drafts: readonly ComparisonDraft[]): VerificationSummary {
  return drafts.reduce<VerificationSummary>(
    (summary, draft) => ({
      resolvedCount: summary.resolvedCount + (draft.state === "resolved" ? 1 : 0),
      persistentCount: summary.persistentCount + (draft.state === "persistent" ? 1 : 0),
      newCount: summary.newCount + (draft.state === "new" ? 1 : 0),
      uncertainCount: (summary.uncertainCount ?? 0) + (draft.state === "uncertain" ? 1 : 0),
    }),
    emptySummary(),
  );
}

function makeStableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function getAnalysisId(value: unknown, fallback: string): string {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) return fallback;
  return value.id.slice(0, MAX_ANALYSIS_ID_LENGTH);
}

function getResultBase(baseline: unknown, rerun: unknown) {
  const baselineAnalysisId = getAnalysisId(baseline, "unknown-baseline");
  const rerunAnalysisId = getAnalysisId(rerun, "unknown-rerun");

  return {
    id: `verification-${makeStableHash(`${baselineAnalysisId}\u0000${rerunAnalysisId}`)}`,
    baselineAnalysisId,
    rerunAnalysisId,
  };
}

function isValidationErrorCode(value: unknown): value is ValidationErrorCode {
  return value === "required" || value === "too-large" || value === "unsupported-type" || value === "unreadable";
}

function createStructuralError(field: "baseline" | "rerun", message: string): ValidationError {
  return { code: "unreadable", field, message };
}

function normalizeAnalysisError(value: unknown, field: "baseline" | "rerun"): ValidationError {
  if (!isRecord(value)) {
    return createStructuralError(field, "The analysis result is missing a structured validation error.");
  }

  const message = normalizeDisplayText(value.message, MAX_TITLE_LENGTH);
  return {
    code: isValidationErrorCode(value.code) ? value.code : "unreadable",
    field,
    message: message || "The analysis result could not be used for verification.",
    ...(typeof value.actualBytes === "number" && Number.isFinite(value.actualBytes)
      ? { actualBytes: value.actualBytes }
      : {}),
    ...(typeof value.limitBytes === "number" && Number.isFinite(value.limitBytes) ? { limitBytes: value.limitBytes } : {}),
    ...(typeof value.mimeType === "string" && value.mimeType.length > 0
      ? { mimeType: value.mimeType.slice(0, MAX_TITLE_LENGTH) }
      : {}),
  };
}

function inspectAnalysis(value: unknown, field: "baseline" | "rerun"): AnalysisInspection {
  if (!isRecord(value)) {
    return { error: createStructuralError(field, "The baseline and rerun analyses must be structured results.") };
  }

  if (typeof value.id !== "string" || value.id.length === 0) {
    return { error: createStructuralError(field, "The analysis result is missing its id.") };
  }

  if (value.status === "invalid") {
    return { error: normalizeAnalysisError(value.error, field) };
  }

  if (value.status === "complete") {
    if (!Array.isArray(value.findings)) {
      return { error: createStructuralError(field, "The complete analysis result is missing its findings.") };
    }
    return { result: value as unknown as AnalysisResult };
  }

  if (value.status === "no-match") {
    if (!Array.isArray(value.findings) || value.findings.length > 0) {
      return { error: createStructuralError(field, "The no-match analysis result must not contain findings.") };
    }
    return { result: value as unknown as AnalysisResult };
  }

  return { error: createStructuralError(field, "The baseline and rerun analyses must use a supported status.") };
}

function makeInvalidResult(
  baseline: unknown,
  rerun: unknown,
  error: ValidationError,
): InvalidVerificationResult {
  return {
    ...getResultBase(baseline, rerun),
    status: "invalid",
    comparisons: [],
    error,
  };
}

function makeNoMatchResult(baseline: unknown, rerun: unknown): NoMatchVerificationResult {
  const baselineStatus = isRecord(baseline) && baseline.status === "no-match";
  const rerunStatus = isRecord(rerun) && rerun.status === "no-match";
  const side = baselineStatus && rerunStatus ? "both analyses" : baselineStatus ? "the baseline analysis" : "the rerun analysis";

  return {
    ...getResultBase(baseline, rerun),
    status: "no-match",
    outcome: "no-change",
    comparisons: [],
    summary: emptySummary(),
    message: `Comparison is uncertain because ${side} had no supported diagnostic match; no transition labels were produced.`,
  };
}

function outcomeFor(summary: VerificationSummary): VerificationOutcome {
  if ((summary.uncertainCount ?? 0) > 0) return "uncertain";
  if (summary.resolvedCount > 0 && summary.newCount === 0) return "improved";
  if (summary.newCount > 0 && summary.resolvedCount === 0) return "regressed";
  if (summary.resolvedCount > 0 && summary.newCount > 0) return "changed";
  return "no-change";
}

function messageFor(summary: VerificationSummary, outcome: VerificationOutcome, truncated: boolean): string {
  let message: string;

  if (outcome === "uncertain") {
    message = "Comparison is uncertain; one or more diagnostics could not be matched confidently.";
  } else if (summary.resolvedCount === 0 && summary.newCount === 0 && summary.persistentCount === 0) {
    message = "Neither analysis reported a finding; no build or test outcome was inferred.";
  } else if (outcome === "improved") {
    message = "The rerun no longer contains one or more baseline diagnostics.";
  } else if (outcome === "regressed") {
    message = "The rerun contains diagnostics that were not present in the baseline.";
  } else if (outcome === "changed") {
    message = "The rerun resolved some diagnostics and introduced or retained others.";
  } else {
    message = "The same diagnostics remain; no change was detected.";
  }

  return truncated ? `${message} Some comparison rows were omitted from the bounded result.` : message;
}

function makeComparison(
  draft: ComparisonDraft,
  baselineAnalysisId: string,
  rerunAnalysisId: string,
  ordinal: number,
): FindingComparison {
  const baselineFindingId = draft.baseline?.id;
  const rerunFindingId = draft.rerun?.id;
  const comparisonKey = [
    baselineAnalysisId,
    rerunAnalysisId,
    draft.key,
    draft.state,
    baselineFindingId ?? "",
    rerunFindingId ?? "",
    String(ordinal),
  ].join("\u0000");

  return {
    id: `comparison-${makeStableHash(comparisonKey)}`,
    findingKey: draft.key,
    ruleId: draft.ruleId,
    title: draft.title,
    state: draft.state,
    ...(baselineFindingId === undefined ? {} : { baselineFindingId }),
    ...(rerunFindingId === undefined ? {} : { rerunFindingId }),
  };
}

/**
 * Compares analyzer output, never raw logs. Stable rule identity is preferred
 * over generated finding ids or array position; duplicate or incomplete
 * identity is surfaced as `uncertain` rather than guessed.
 */
export function compareAnalysisResults(
  baseline: AnalysisResult,
  rerun: AnalysisResult,
  options: VerificationCompareOptions = {},
): VerificationResult {
  const baselineInspection = inspectAnalysis(baseline, "baseline");
  const rerunInspection = inspectAnalysis(rerun, "rerun");

  if (baselineInspection.error) return makeInvalidResult(baseline, rerun, baselineInspection.error);
  if (rerunInspection.error) return makeInvalidResult(baseline, rerun, rerunInspection.error);

  const baselineResult = baselineInspection.result;
  const rerunResult = rerunInspection.result;

  if (!baselineResult || !rerunResult) {
    return makeInvalidResult(
      baseline,
      rerun,
      createStructuralError("baseline", "The baseline and rerun analyses could not be inspected."),
    );
  }

  if (baselineResult.status === "no-match" || rerunResult.status === "no-match") {
    return makeNoMatchResult(baselineResult, rerunResult);
  }

  const baselineCandidates = baselineResult.findings.map((finding, index) => makeCandidate(finding, index));
  const rerunCandidates = rerunResult.findings.map((finding, index) => makeCandidate(finding, index));
  const drafts = matchCandidates(baselineCandidates, rerunCandidates);
  const summary = summarize(drafts);
  const base = getResultBase(baselineResult, rerunResult);
  const requestedLimit = options.maxComparisons ?? DEFAULT_MAX_COMPARISONS;
  const maxComparisons = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.min(MAX_COMPARISONS, Math.floor(requestedLimit)))
    : DEFAULT_MAX_COMPARISONS;
  const truncated = drafts.length > maxComparisons;
  const comparisons = drafts.slice(0, maxComparisons).map((draft, index) => makeComparison(draft, base.baselineAnalysisId, base.rerunAnalysisId, index));
  const outcome = outcomeFor(summary);

  const result: ComparedVerificationResult = {
    ...base,
    status: "compared",
    outcome,
    comparisons,
    summary,
    message: messageFor(summary, outcome, truncated),
  };

  return result;
}

/** Alias matching the conceptual analyzer → verification API. */
export const verify = compareAnalysisResults;

/** Alias for callers that already use comparison terminology. */
export const compareResults = compareAnalysisResults;
