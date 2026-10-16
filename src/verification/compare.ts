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
import { redactSensitiveText } from "../analyzer/normalize";
import { diagnosticIdentity, digestIdentity, normalizeMeaningfulDiagnosticText } from "../analyzer/identity";
import { isExplicitCompletionLine } from "../analyzer/completion";
import { FINDING_CATEGORIES, FINDING_CONFIDENCES, FINDING_SEVERITIES } from "../types/finding";

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
const MAX_SIGNATURE_LENGTH = 8192;
const MAX_FINDINGS_PER_ANALYSIS = 2048;
const MAX_EVIDENCE_PER_FINDING = 16;
const MAX_EVIDENCE_TEXT_LENGTH = 4096;
const MAX_STRUCTURED_TEXT_LENGTH = 8192;
const MAX_COMPARISON_TEXT_CHARACTERS = 4 * 1024 * 1024;

export interface VerificationCompareOptions {
  /** Maximum number of comparison rows returned. Counts still cover all rows. */
  readonly maxComparisons?: number;
}

interface NormalizedValue {
  readonly value: string;
  readonly truncated: boolean;
  readonly redacted?: boolean;
  readonly uncertain?: boolean;
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
 * Returns the stable rule-plus-signature key used by the comparison engine.
 * Legacy findings without an explicit signature receive an evidence-derived
 * fallback only when that evidence is bounded and usable.
 */
export function getFindingKey(finding: Finding): string {
  return makeCandidate(finding, 0).key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeBoundedIdentity(value: unknown): NormalizedValue {
  if (typeof value !== "string") {
    return { value: "", truncated: false };
  }
  if (value.length > MAX_KEY_LENGTH) return { value: "", truncated: true };
  const safe = redactSensitiveText(value);
  const compact = safe.text.replace(/\\/g, "/").toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*([/:#._-])\s*/g, "$1");

  return {
    value: compact.slice(0, MAX_KEY_LENGTH),
    truncated: compact.length > MAX_KEY_LENGTH,
    redacted: safe.redacted || /\[REDACTED\b/i.test(compact),
  };
}

function normalizeDiagnosticText(value: unknown, limit = MAX_SIGNATURE_LENGTH): NormalizedValue {
  if (typeof value !== "string") {
    return { value: "", truncated: false };
  }

  if (value.length > MAX_STRUCTURED_TEXT_LENGTH) return { value: "", truncated: true };
  const safe = redactSensitiveText(value);
  const normalized = safe.text
    .replace(/\s+/g, " ")
    .trim();

  return {
    value: normalized.slice(0, limit),
    truncated: normalized.length > limit,
    redacted: safe.redacted || /\[REDACTED\b/i.test(normalized),
  };
}

function normalizeDisplayText(value: unknown, limit: number): string {
  return normalizeDiagnosticText(value, limit).value;
}

function normalizeSignatureText(value: unknown): NormalizedValue {
  if (typeof value !== "string") return { value: "", truncated: false };
  if (value.length > MAX_SIGNATURE_LENGTH) return { value: "", truncated: true };
  const normalized = normalizeMeaningfulDiagnosticText(value);
  return { value: normalized.text, truncated: false, redacted: normalized.redacted };
}

function readEvidenceSignature(finding: Record<string, unknown>): NormalizedValue {
  if (!Array.isArray(finding.evidence)) {
    return { value: "", truncated: false };
  }
  if (finding.evidence.length > MAX_EVIDENCE_PER_FINDING) return { value: "", truncated: true };

  const rawEvidence = finding.evidence
    .filter(isRecord)
    .map((entry) => ({
      primary: entry.role === "primary" ? 0 : 1,
      text: normalizeSignatureText(entry.text),
      redacted: entry.redacted === true,
    }))
    .filter((entry) => entry.text.value.length > 0);
  const evidence = (rawEvidence.some((entry) => entry.primary === 0) ? rawEvidence.filter((entry) => entry.primary === 0) : rawEvidence)
    .sort((left, right) => left.primary - right.primary || compareStrings(left.text.value, right.text.value));

  if (evidence.length === 0) {
    return { value: "", truncated: false };
  }

  const joined = JSON.stringify(evidence.map((entry) => entry.text.value));
  return {
    value: digestIdentity(joined),
    truncated: evidence.some((entry) => entry.text.truncated),
    redacted: evidence.some((entry) => entry.redacted || entry.text.redacted),
    uncertain: evidence.length > 1,
  };
}

function makeCandidate(value: unknown, index: number): Candidate {
  const finding = isRecord(value) ? value : undefined;
  const rawRuleId = finding?.ruleId;
  const normalizedRuleId = normalizeBoundedIdentity(rawRuleId);
  const title = normalizeDisplayText(finding?.title, MAX_TITLE_LENGTH);
  const rawSignature = finding?.signature;
  const explicitSignatureValue = normalizeSignatureText(rawSignature);
  const hasExplicitSignature = typeof rawSignature === "string" && explicitSignatureValue.value.length > 0;
  const evidenceSignature = hasExplicitSignature ? { value: "", truncated: false } : readEvidenceSignature(finding ?? {});
  const titleSignature = hasExplicitSignature || evidenceSignature.value ? { value: "", truncated: false } : normalizeSignatureText(finding?.title);
  const signature = hasExplicitSignature
    ? digestIdentity(explicitSignatureValue.value)
    : evidenceSignature.value || (titleSignature.value ? diagnosticIdentity("title", titleSignature.value).signature : "");
  const signatureWasTruncated =
    hasExplicitSignature ? explicitSignatureValue.truncated : evidenceSignature.truncated || (!evidenceSignature.value && titleSignature.truncated);
  const explicitRuleId = typeof rawRuleId === "string" && normalizedRuleId.value.length > 0;
  const legacyFallbackReliable = !hasExplicitSignature && evidenceSignature.value.length > 0 && !evidenceSignature.truncated && !evidenceSignature.redacted && !evidenceSignature.uncertain;
  const fallbackKey = signature ? `signature:${signature}` : `unknown:${String(index)}`;
  const rawKey = normalizedRuleId.value
    ? `${normalizedRuleId.value}|${hasExplicitSignature ? "sig:" : "legacy:"}${signature || fallbackKey}`
    : fallbackKey;
  const key = rawKey.slice(0, MAX_KEY_LENGTH);
  const identityReliable = explicitRuleId && !normalizedRuleId.truncated && !normalizedRuleId.redacted && !signatureWasTruncated &&
    !(hasExplicitSignature && explicitSignatureValue.redacted) && finding?.confidence !== "low" && finding?.identityUncertain !== true &&
    !(typeof finding?.occurrenceCount === "number" && finding.occurrenceCount > 1) && rawKey.length <= MAX_KEY_LENGTH && (hasExplicitSignature || legacyFallbackReliable);
  const rawId = finding?.id;
  const id = typeof rawId === "string" && rawId.length > 0 ? normalizeDisplayText(rawId, MAX_FINDING_ID_LENGTH) : undefined;
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
  forceUncertain = false,
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

  const normalizedDrafts = forceUncertain
    ? drafts.map((draft) => draft.state === "uncertain" ? draft : createDraft("uncertain", draft.baseline, draft.rerun))
    : drafts;
  return normalizedDrafts.sort((left, right) => compareStrings(left.sortKey, right.sortKey));
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
  try {
    if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > MAX_ANALYSIS_ID_LENGTH) return fallback;
    return normalizeDisplayText(value.id, MAX_ANALYSIS_ID_LENGTH) || fallback;
  } catch {
    return fallback;
  }
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

function resolveMaxComparisons(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_COMPARISONS, Math.floor(value as number)))
    : DEFAULT_MAX_COMPARISONS;
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

function boundedString(value: unknown, maximum: number, allowEmpty = true): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0);
}

function count(value: unknown, allowZero = true): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1);
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function validInput(value: unknown): boolean {
  return isRecord(value) && (value.source === "file" || value.source === "paste") && count(value.byteCount) && count(value.lineCount) &&
    typeof value.normalizedNewlines === "boolean" && optionalBoolean(value.countsArePartial) &&
    (value.fileName === undefined || boundedString(value.fileName, 1024));
}

function validMetadata(value: unknown, lineCount: number): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !optionalBoolean(value.partial) || !optionalBoolean(value.evidenceTruncated)) return false;
  if (value.limitsReached !== undefined && (!Array.isArray(value.limitsReached) || value.limitsReached.length > 16 ||
    !value.limitsReached.every((entry) => boundedString(entry, 128, false)))) return false;
  if (value.cappedRuleIds !== undefined && (!Array.isArray(value.cappedRuleIds) || value.cappedRuleIds.length > 256 ||
    !value.cappedRuleIds.every((entry) => boundedString(entry, MAX_KEY_LENGTH, false)))) return false;
  if (value.omittedFindingCount !== undefined && !count(value.omittedFindingCount)) return false;
  if (value.buildCompletion !== undefined) {
    const marker = value.buildCompletion;
    if (!isRecord(marker) || !count(marker.lineNumber, false) || marker.lineNumber > lineCount || !boundedString(marker.text, 512, false)) return false;
  }
  return true;
}

function validFinding(value: unknown): boolean {
  if (!isRecord(value) || !boundedString(value.id, MAX_FINDING_ID_LENGTH, false) || !boundedString(value.ruleId, MAX_KEY_LENGTH, false) ||
    !boundedString(value.title, MAX_STRUCTURED_TEXT_LENGTH) || !boundedString(value.ruleCatalogVersion, 256, false) ||
    !boundedString(value.explanation, MAX_STRUCTURED_TEXT_LENGTH) || !boundedString(value.verificationHint, MAX_STRUCTURED_TEXT_LENGTH) ||
    !FINDING_CATEGORIES.some((entry) => entry === value.category) || !FINDING_SEVERITIES.some((entry) => entry === value.severity) ||
    !FINDING_CONFIDENCES.some((entry) => entry === value.confidence) || !optionalBoolean(value.identityUncertain) ||
    (value.occurrenceCount !== undefined && !count(value.occurrenceCount, false)) ||
    (value.signature !== undefined && !boundedString(value.signature, MAX_SIGNATURE_LENGTH))) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length > MAX_EVIDENCE_PER_FINDING || !value.evidence.every((entry) =>
    isRecord(entry) && count(entry.lineNumber, false) && boundedString(entry.text, MAX_EVIDENCE_TEXT_LENGTH) &&
    (entry.role === undefined || entry.role === "primary" || entry.role === "context") && optionalBoolean(entry.redacted))) return false;
  if (!Array.isArray(value.suggestedActions) || value.suggestedActions.length > 32 || !value.suggestedActions.every((entry) =>
    isRecord(entry) && boundedString(entry.id, MAX_KEY_LENGTH, false) && boundedString(entry.label, MAX_STRUCTURED_TEXT_LENGTH) &&
    boundedString(entry.description, MAX_STRUCTURED_TEXT_LENGTH) && (entry.verificationCondition === undefined || boundedString(entry.verificationCondition, MAX_STRUCTURED_TEXT_LENGTH)))) return false;
  return true;
}

function inspectAnalysis(value: unknown, field: "baseline" | "rerun"): AnalysisInspection {
  if (!isRecord(value)) {
    return { error: createStructuralError(field, "The baseline and rerun analyses must be structured results.") };
  }

  if (!boundedString(value.id, MAX_ANALYSIS_ID_LENGTH, false)) {
    return { error: createStructuralError(field, "The analysis result is missing its id.") };
  }

  if (value.status === "invalid") {
    return { error: normalizeAnalysisError(value.error, field) };
  }

  if (!validInput(value.input) || !boundedString(value.analyzedAt, 128, false) || !boundedString(value.ruleCatalogVersion, 256, false)) {
    return { error: createStructuralError(field, "The analysis result has missing or malformed input or catalog metadata.") };
  }
  if (!validMetadata(value.metadata, (value.input as Record<string, unknown>).lineCount as number)) {
    return { error: createStructuralError(field, "The analysis result has malformed or excessive analysis metadata.") };
  }
  if (value.message !== undefined && !boundedString(value.message, MAX_STRUCTURED_TEXT_LENGTH)) {
    return { error: createStructuralError(field, "The analysis result has an excessive or malformed message.") };
  }

  if (value.status === "complete") {
    if (!Array.isArray(value.findings) || value.findings.length > MAX_FINDINGS_PER_ANALYSIS || !value.findings.every(validFinding)) {
      return { error: createStructuralError(field, "The complete analysis result has missing, malformed, or excessive findings.") };
    }
    let characters = 0;
    for (const finding of value.findings as readonly Finding[]) {
      characters += finding.id.length + finding.ruleId.length + finding.title.length + (finding.signature?.length ?? 0);
      for (const evidence of finding.evidence) characters += evidence.text.length;
      if (characters > MAX_COMPARISON_TEXT_CHARACTERS) {
        return { error: createStructuralError(field, "The analysis findings exceed the bounded comparison text budget.") };
      }
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

function hasCompletionMarker(value: AnalysisResult): boolean {
  const marker = value.metadata?.buildCompletion;
  return marker !== undefined && Number.isInteger(marker.lineNumber) && marker.lineNumber > 0 && marker.lineNumber <= value.input.lineCount &&
    typeof marker.text === "string" && marker.text.length <= 512 && isExplicitCompletionLine(marker.text);
}

function makeNoMatchResult(
  baseline: unknown,
  rerun: unknown,
  reason: string,
  maxComparisons = DEFAULT_MAX_COMPARISONS,
): NoMatchVerificationResult {
  const baselineStatus = isRecord(baseline) && baseline.status === "no-match";
  const rerunStatus = isRecord(rerun) && rerun.status === "no-match";
  const side = baselineStatus && rerunStatus ? "both analyses" : baselineStatus ? "the baseline analysis" : "the rerun analysis";
  const baselineCandidates = isRecord(baseline) && baseline.status === "complete" && Array.isArray(baseline.findings)
    ? baseline.findings.map((finding, index) => makeCandidate(finding, index))
    : [];
  const rerunCandidates = isRecord(rerun) && rerun.status === "complete" && Array.isArray(rerun.findings)
    ? rerun.findings.map((finding, index) => makeCandidate(finding, index))
    : [];
  const drafts = matchCandidates(baselineCandidates, rerunCandidates, true);
  const summary = drafts.length === 0
    ? { ...emptySummary(), uncertainCount: 1 }
    : summarize(drafts);
  const baselineAnalysisId = getAnalysisId(baseline, "unknown-baseline");
  const rerunAnalysisId = getAnalysisId(rerun, "unknown-rerun");
  const truncated = drafts.length > maxComparisons;

  return {
    ...getResultBase(baseline, rerun),
    status: "no-match",
    outcome: "uncertain",
    comparisons: drafts.slice(0, maxComparisons).map((draft, index) => makeComparison(draft, baselineAnalysisId, rerunAnalysisId, index)),
    summary,
    message: `Comparison is uncertain because ${side} had no supported diagnostic match. ${reason} No executed build outcome was inferred.${truncated ? " Some comparison rows were omitted from the bounded result." : ""}`,
  };
}

function outcomeFor(summary: VerificationSummary, forceUncertain = false): VerificationOutcome {
  if (forceUncertain) return "uncertain";
  if ((summary.uncertainCount ?? 0) > 0) return "uncertain";
  if (summary.resolvedCount > 0 && summary.newCount === 0) return "improved";
  if (summary.newCount > 0 && summary.resolvedCount === 0) return "regressed";
  if (summary.resolvedCount > 0 && summary.newCount > 0) return "changed";
  return "no-change";
}

function messageFor(summary: VerificationSummary, outcome: VerificationOutcome, truncated: boolean, reason?: string): string {
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

  if (reason) message = `${message} ${reason}`;
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

function comparisonQuality(baseline: AnalysisResult, rerun: AnalysisResult): { readonly uncertain: boolean; readonly reason?: string } {
  const reasons: string[] = [];
  if (baseline.ruleCatalogVersion !== rerun.ruleCatalogVersion) {
    reasons.push("The baseline and rerun use different rule-catalog versions.");
  }
  if (baseline.ruleCatalogVersion === "buildmedic-rules-1" || rerun.ruleCatalogVersion === "buildmedic-rules-1") {
    reasons.push("A legacy catalog used lossy diagnostic identities.");
  }
  const baselineFindingCatalogMismatch = baseline.status === "complete" && baseline.findings.some((finding) => finding.ruleCatalogVersion !== baseline.ruleCatalogVersion);
  const rerunFindingCatalogMismatch = rerun.status === "complete" && rerun.findings.some((finding) => finding.ruleCatalogVersion !== rerun.ruleCatalogVersion);
  if (baselineFindingCatalogMismatch || rerunFindingCatalogMismatch) {
    reasons.push("One or more findings use a different rule-catalog version than their analysis.");
  }
  if (baseline.metadata?.partial || rerun.metadata?.partial || (baseline.metadata?.limitsReached?.length ?? 0) > 0 || (rerun.metadata?.limitsReached?.length ?? 0) > 0 ||
    (baseline.metadata?.omittedFindingCount ?? 0) > 0 || (rerun.metadata?.omittedFindingCount ?? 0) > 0 || (baseline.metadata?.cappedRuleIds?.length ?? 0) > 0 ||
    (rerun.metadata?.cappedRuleIds?.length ?? 0) > 0 || baseline.metadata?.evidenceTruncated || rerun.metadata?.evidenceTruncated || baseline.input.countsArePartial || rerun.input.countsArePartial) {
    reasons.push("One analysis was capped or otherwise partial, so absence of a finding is not exhaustive.");
  }
  return { uncertain: reasons.length > 0, ...(reasons.length > 0 ? { reason: reasons.join(" ") } : {}) };
}

/**
 * Compares analyzer output, never raw logs. Stable rule identity is preferred
 * over generated finding ids or array position; duplicate or incomplete
 * identity is surfaced as `uncertain` rather than guessed.
 */
function compareInspectedResults(
  baseline: unknown,
  rerun: unknown,
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

  const quality = comparisonQuality(baselineResult, rerunResult);

  if (baselineResult.status === "no-match" || rerunResult.status === "no-match") {
    const baselineNoMatchIsBounded = baselineResult.status !== "no-match" || hasCompletionMarker(baselineResult);
    const rerunNoMatchIsBounded = rerunResult.status !== "no-match" || hasCompletionMarker(rerunResult);
    if (!baselineNoMatchIsBounded || !rerunNoMatchIsBounded) {
      return makeNoMatchResult(
        baselineResult,
        rerunResult,
        quality.reason ?? "An explicit build-completion marker was not present, so the rerun may be arbitrary or incomplete.",
        resolveMaxComparisons(options.maxComparisons),
      );
    }

    const baselineCandidates = baselineResult.status === "complete"
      ? baselineResult.findings.map((finding, index) => makeCandidate(finding, index))
      : [];
    const rerunCandidates = rerunResult.status === "complete"
      ? rerunResult.findings.map((finding, index) => makeCandidate(finding, index))
      : [];
    const drafts = matchCandidates(baselineCandidates, rerunCandidates, quality.uncertain);
    const summary = quality.uncertain && drafts.length === 0
      ? { ...emptySummary(), uncertainCount: 1 }
      : summarize(drafts);
    const base = getResultBase(baselineResult, rerunResult);
    const outcome = outcomeFor(summary, quality.uncertain);
    const maxComparisons = resolveMaxComparisons(options.maxComparisons);
    const truncated = drafts.length > maxComparisons;
    const markerReason = "An explicit build-completion marker supports this diagnostic comparison; it does not prove that the command executed to completion.";
    return {
      ...base,
      status: "compared",
      outcome,
      comparisons: drafts.slice(0, maxComparisons).map((draft, index) => makeComparison(draft, base.baselineAnalysisId, base.rerunAnalysisId, index)),
      summary,
      message: messageFor(summary, outcome, truncated, [quality.reason, markerReason].filter(Boolean).join(" ")),
    };
  }

  const baselineCandidates = baselineResult.findings.map((finding, index) => makeCandidate(finding, index));
  const rerunCandidates = rerunResult.findings.map((finding, index) => makeCandidate(finding, index));
  const drafts = matchCandidates(baselineCandidates, rerunCandidates, quality.uncertain);
  const summary = quality.uncertain && drafts.length === 0
    ? { ...emptySummary(), uncertainCount: 1 }
    : summarize(drafts);
  const base = getResultBase(baselineResult, rerunResult);
  const maxComparisons = resolveMaxComparisons(options.maxComparisons);
  const truncated = drafts.length > maxComparisons;
  const comparisons = drafts.slice(0, maxComparisons).map((draft, index) => makeComparison(draft, base.baselineAnalysisId, base.rerunAnalysisId, index));
  const outcome = outcomeFor(summary, quality.uncertain);

  const result: ComparedVerificationResult = {
    ...base,
    status: "compared",
    outcome,
    comparisons,
    summary,
    message: messageFor(summary, outcome, truncated, quality.reason),
  };

  return result;
}

export function compareAnalysisResults(
  baseline: unknown,
  rerun: unknown,
  options: VerificationCompareOptions = {},
): VerificationResult {
  try {
    return compareInspectedResults(baseline, rerun, isRecord(options) ? options : {});
  } catch {
    // Structured-clone/JSON inputs are expected. Exotic objects (including
    // throwing accessors) are also rejected without escaping this boundary.
    return makeInvalidResult(baseline, rerun, createStructuralError("baseline", "The analysis results could not be read as bounded structured data."));
  }
}

/** Alias matching the conceptual analyzer → verification API. */
export const verify = compareAnalysisResults;

/** Alias for callers that already use comparison terminology. */
export const compareResults = compareAnalysisResults;
