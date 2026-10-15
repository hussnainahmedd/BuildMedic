import {
  DEFAULT_VALIDATION_POLICY,
  getUtf8ByteLength,
  inspectLogText,
} from "../lib/validation";
import type {
  AnalysisInputSummary,
  AnalysisRequest,
  AnalysisResult,
  AnalysisSource,
  InvalidAnalysisResult,
  ValidationError,
} from "../types";
import { analyzeDiagnosticsDetailed } from "../diagnostics";
import { RULE_CATALOG_VERSION } from "../diagnostics/rules";

import {
  DEFAULT_CONTEXT_LINES,
  DEFAULT_MAX_ANALYZED_BYTES,
  DEFAULT_MAX_ANALYZED_LINE_LENGTH,
  DEFAULT_MAX_ANALYZED_LINES,
  DEFAULT_MAX_EVIDENCE_LINE_LENGTH,
  DEFAULT_MAX_EVIDENCE_LINES,
  DEFAULT_MAX_FINDINGS,
  DEFAULT_MAX_MATCHES_PER_RULE,
  HARD_MAX_ANALYZED_BYTES,
  HARD_MAX_ANALYZED_LINES,
  HARD_MAX_ANALYZED_LINE_LENGTH,
  HARD_MAX_CONTEXT_LINES,
  HARD_MAX_EVIDENCE_LINE_LENGTH,
  HARD_MAX_EVIDENCE_LINES,
  HARD_MAX_FINDINGS,
  HARD_MAX_MATCHES_PER_RULE,
  type AnalyzeOptions,
  type AnalyzeRequest,
} from "./types";
import { normalizeLogText, redactSensitiveLog, sanitizeEvidenceLine } from "./normalize";

const DETERMINISTIC_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const MAX_FILE_NAME_LENGTH = 160;
const MAX_INVALID_ID_SAMPLE_LENGTH = 2048;

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function positiveLimit(value: number | undefined, fallback: number, hardMaximum = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), hardMaximum);
}

function resolveSource(value: unknown, fallback: AnalysisSource): AnalysisSource {
  return value === "file" || value === "paste" ? value : fallback;
}

function resolveFileName(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const basename = value.split(/[\\/]/).pop() ?? value;
  const safe = sanitizeEvidenceLine(basename, MAX_FILE_NAME_LENGTH).text;
  return safe.length > 0 ? safe : undefined;
}

function createInputSummary(
  text: string,
  source: AnalysisSource,
  fileName: string | undefined,
  normalizedNewlines: boolean,
  counts: { readonly byteCount?: number; readonly lineCount?: number; readonly partial?: boolean } = {},
): AnalysisInputSummary {
  return {
    source,
    ...(fileName === undefined ? {} : { fileName }),
    byteCount: counts.byteCount ?? getUtf8ByteLength(text),
    lineCount: counts.lineCount ?? 0,
    normalizedNewlines,
    ...(counts.partial ? { countsArePartial: true } : {}),
  };
}

function createId(
  kind: "analysis" | "finding",
  seed: string,
  factory: AnalyzeOptions["idFactory"],
): string {
  const injected = factory?.(kind, seed);
  if (typeof injected === "string" && injected.length > 0) {
    return injected;
  }

  return `${kind}-${stableHash(seed)}`;
}

function createTimestamp(factory: AnalyzeOptions["timestampFactory"]): string {
  const injected = factory?.();
  return typeof injected === "string" && injected.length > 0 ? injected : DETERMINISTIC_TIMESTAMP;
}

function createInvalidResult(
  text: string,
  source: AnalysisSource,
  fileName: string | undefined,
  error: ValidationError,
  options: AnalyzeOptions,
  counts?: { readonly byteCount?: number; readonly lineCount?: number; readonly normalizedNewlines?: boolean; readonly partial?: boolean },
): InvalidAnalysisResult {
  const boundedSample = text.length <= MAX_INVALID_ID_SAMPLE_LENGTH * 2
    ? text
    : `${text.slice(0, MAX_INVALID_ID_SAMPLE_LENGTH)}|${text.slice(-MAX_INVALID_ID_SAMPLE_LENGTH)}`;
  const seed = `${source}|invalid|${text.length}|${stableHash(boundedSample)}`;
  return {
    id: createId("analysis", seed, options.idFactory),
    analyzedAt: createTimestamp(options.timestampFactory),
    input: createInputSummary(text, source, fileName, counts?.normalizedNewlines ?? text.includes("\r"), counts),
    ruleCatalogVersion: options.ruleCatalogVersion ?? options.catalogVersion ?? RULE_CATALOG_VERSION,
    status: "invalid",
    findings: [],
    error,
  };
}

const BUILD_COMPLETION_PATTERN = /(?:\b(?:build|compile|compilation|bundle|bundling|test suite|tests?)\b[^\n]{0,120}\b(?:completed?|succeed(?:ed|s)?|passed|finished)\b|\b(?:completed?|succeed(?:ed|s)?|passed|finished)\b[^\n]{0,120}\b(?:build|compile|compilation|bundle|tests?)\b|\b(?:webpack|vite|tsc)\b[^\n]{0,120}\b(?:compiled|built)\s+successfully\b|\b(?:exit|status|code)\s*[:=]?\s*0\b)/i;

function findBuildCompletion(lines: readonly string[]): { readonly lineNumber: number; readonly text: string } | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (BUILD_COMPLETION_PATTERN.test(line)) {
      return { lineNumber: index + 1, text: sanitizeEvidenceLine(line, 512).text };
    }
  }
  return undefined;
}

function analyzeTextInternal(text: unknown, options: AnalyzeOptions): AnalysisResult {
  const source = resolveSource(options.source, "paste");
  const fileName = resolveFileName(options.fileName);
  const maxBytes = positiveLimit(options.maxInputBytes, DEFAULT_MAX_ANALYZED_BYTES, HARD_MAX_ANALYZED_BYTES);
  const maxLines = positiveLimit(options.maxInputLines, DEFAULT_MAX_ANALYZED_LINES, HARD_MAX_ANALYZED_LINES);
  const maxLineLength = positiveLimit(options.maxInputLineLength, DEFAULT_MAX_ANALYZED_LINE_LENGTH, HARD_MAX_ANALYZED_LINE_LENGTH);
  const maxCharacters = positiveLimit(options.maxInputCharacters, HARD_MAX_ANALYZED_BYTES, HARD_MAX_ANALYZED_BYTES);
  const inspection = inspectLogText(text, {
    ...DEFAULT_VALIDATION_POLICY,
    maxBytes,
    maxLines,
    maxLineLength,
    maxCharacters,
  });
  if (!inspection.validation.valid) {
    return createInvalidResult(
      typeof text === "string" ? text : "",
      source,
      fileName,
      inspection.validation.error,
      options,
      {
        byteCount: inspection.byteCount,
        lineCount: inspection.lineCount,
        normalizedNewlines: inspection.normalizedNewlines,
        partial: !inspection.complete,
      },
    );
  }

  const validText = inspection.validation.value.text;
  const normalized = normalizeLogText(validText);
  const evidenceLines = redactSensitiveLog(normalized.text).text.split("\n");

  const ruleCatalogVersion = options.ruleCatalogVersion ?? options.catalogVersion ?? RULE_CATALOG_VERSION;
  const analysisSeed = `${source}|${normalized.text}`;
  const idFactory = (kind: "finding", seed: string): string => createId(kind, seed, options.idFactory);
  const diagnosticAnalysis = analyzeDiagnosticsDetailed({ ...normalized, evidenceLines }, {
    ruleCatalogVersion,
    maxFindings: positiveLimit(options.maxFindings, DEFAULT_MAX_FINDINGS, HARD_MAX_FINDINGS),
    maxEvidenceLines: positiveLimit(options.maxEvidenceLines, DEFAULT_MAX_EVIDENCE_LINES, HARD_MAX_EVIDENCE_LINES),
    maxEvidenceLineLength: positiveLimit(options.maxEvidenceLineLength, DEFAULT_MAX_EVIDENCE_LINE_LENGTH, HARD_MAX_EVIDENCE_LINE_LENGTH),
    contextLines: positiveLimit(options.contextLines, DEFAULT_CONTEXT_LINES, HARD_MAX_CONTEXT_LINES),
    maxMatchesPerRule: positiveLimit(options.maxMatchesPerRule, DEFAULT_MAX_MATCHES_PER_RULE, HARD_MAX_MATCHES_PER_RULE),
    createId: idFactory,
  });
  const completion = findBuildCompletion(normalized.matchingLines);
  const base = {
    id: createId("analysis", analysisSeed, options.idFactory),
    analyzedAt: createTimestamp(options.timestampFactory),
    input: createInputSummary(validText, source, fileName, normalized.normalizedNewlines, {
      byteCount: inspection.byteCount,
      lineCount: inspection.lineCount,
    }),
    ruleCatalogVersion,
  } as const;

  const findings = diagnosticAnalysis.findings;
  const limitsReached = diagnosticAnalysis.limitsReached;
  const partial = limitsReached.length > 0 || diagnosticAnalysis.evidenceTruncated;
  const metadata = {
    partial,
    limitsReached,
    ...(diagnosticAnalysis.omittedFindingCount === undefined ? {} : { omittedFindingCount: diagnosticAnalysis.omittedFindingCount }),
    ...(diagnosticAnalysis.cappedRuleIds.length === 0 ? {} : { cappedRuleIds: diagnosticAnalysis.cappedRuleIds }),
    ...(diagnosticAnalysis.evidenceTruncated ? { evidenceTruncated: true } : {}),
    ...(completion === undefined ? {} : { buildCompletion: completion }),
  } as const;
  const resultBase = { ...base, metadata };

  if (findings.length === 0) {
    return {
      ...resultBase,
      status: "no-match",
      findings: [],
      message: partial
        ? "No supported diagnostic matched within the bounded analysis; the result may be incomplete."
        : "No supported diagnostic matched this log.",
    };
  }

  return {
    ...resultBase,
    status: "complete",
    findings,
    ...(partial ? { message: "Analysis was capped by a safety limit; findings are not exhaustive." } : {}),
  };
}

/** Public browser-safe API for a text value that has passed no or partial validation. */
export function analyzeText(text: unknown, options: AnalyzeOptions = {}): AnalysisResult {
  // Accept the existing ValidatedText-shaped value as a convenience, while
  // recomputing all safety metadata instead of trusting caller-supplied bytes.
  if (typeof text === "object" && text !== null && "text" in text) {
    const candidate = text as { readonly text?: unknown };
    return analyzeTextInternal(candidate.text, options);
  }
  return analyzeTextInternal(text, options);
}

/**
 * Public request API. It accepts either a plain text value or the existing
 * AnalysisRequest-shaped object and never executes, imports, or contacts values
 * found in the log.
 */
export function analyzeLog(input: AnalyzeRequest | AnalysisRequest | unknown, options: AnalyzeOptions = {}): AnalysisResult {
  if (typeof input === "string" || input === null || input === undefined) {
    return analyzeTextInternal(input, options);
  }

  if (typeof input !== "object") {
    return analyzeTextInternal(input, options);
  }

  const request = input as { readonly text?: unknown; readonly source?: unknown; readonly fileName?: unknown };
  const requestOptions: AnalyzeOptions = {
    ...options,
    source: resolveSource(request.source, options.source ?? "paste"),
    fileName: resolveFileName(request.fileName) ?? options.fileName,
  };
  return analyzeTextInternal(request.text, requestOptions);
}

export const analyzeBuildLog = analyzeLog;
export const analyze = analyzeLog;
