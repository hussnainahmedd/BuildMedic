import {
  formatByteLimit,
  getUtf8ByteLength,
  VALIDATION_MESSAGES,
} from "../lib/validation";
import type {
  AnalysisInputSummary,
  AnalysisRequest,
  AnalysisResult,
  AnalysisSource,
  InvalidAnalysisResult,
  ValidationError,
} from "../types";
import { analyzeDiagnostics } from "../diagnostics";
import { RULE_CATALOG_VERSION } from "../diagnostics/rules";

import {
  DEFAULT_CONTEXT_LINES,
  DEFAULT_MAX_ANALYZED_BYTES,
  DEFAULT_MAX_ANALYZED_LINES,
  DEFAULT_MAX_EVIDENCE_LINE_LENGTH,
  DEFAULT_MAX_EVIDENCE_LINES,
  DEFAULT_MAX_FINDINGS,
  DEFAULT_MAX_MATCHES_PER_RULE,
  HARD_MAX_ANALYZED_BYTES,
  HARD_MAX_ANALYZED_LINES,
  HARD_MAX_CONTEXT_LINES,
  HARD_MAX_EVIDENCE_LINE_LENGTH,
  HARD_MAX_EVIDENCE_LINES,
  HARD_MAX_FINDINGS,
  HARD_MAX_MATCHES_PER_RULE,
  type AnalyzeOptions,
  type AnalyzeRequest,
} from "./types";
import { normalizeLogText } from "./normalize";

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

  return value.slice(0, MAX_FILE_NAME_LENGTH);
}

function lineCount(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  let count = 1;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x0a) {
      count += 1;
    } else if (code === 0x0d) {
      count += 1;
      if (value.charCodeAt(index + 1) === 0x0a) {
        index += 1;
      }
    }
  }
  return count;
}

function createInputSummary(
  text: string,
  source: AnalysisSource,
  fileName: string | undefined,
  normalizedNewlines: boolean,
): AnalysisInputSummary {
  return {
    source,
    ...(fileName === undefined ? {} : { fileName }),
    byteCount: getUtf8ByteLength(text),
    lineCount: lineCount(text),
    normalizedNewlines,
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
): InvalidAnalysisResult {
  const boundedSample = text.length <= MAX_INVALID_ID_SAMPLE_LENGTH * 2
    ? text
    : `${text.slice(0, MAX_INVALID_ID_SAMPLE_LENGTH)}|${text.slice(-MAX_INVALID_ID_SAMPLE_LENGTH)}`;
  const seed = `${source}|invalid|${text.length}|${stableHash(boundedSample)}`;
  return {
    id: createId("analysis", seed, options.idFactory),
    analyzedAt: createTimestamp(options.timestampFactory),
    input: createInputSummary(text, source, fileName, text.includes("\r")),
    ruleCatalogVersion: options.ruleCatalogVersion ?? options.catalogVersion ?? RULE_CATALOG_VERSION,
    status: "invalid",
    findings: [],
    error,
  };
}

function createTooLargeError(actualBytes: number, limitBytes: number): ValidationError {
  return {
    field: "log",
    code: "too-large",
    message: VALIDATION_MESSAGES.tooLargeLog(formatByteLimit(limitBytes)),
    actualBytes,
    limitBytes,
  };
}

function analyzeTextInternal(text: unknown, options: AnalyzeOptions): AnalysisResult {
  const source = resolveSource(options.source, "paste");
  const fileName = resolveFileName(options.fileName);

  if (text === null || text === undefined || (typeof text === "string" && text.trim().length === 0)) {
    return createInvalidResult(
      typeof text === "string" ? text : "",
      source,
      fileName,
      {
        field: "log",
        code: "required",
        message: VALIDATION_MESSAGES.requiredLog,
      },
      options,
    );
  }

  if (typeof text !== "string") {
    return createInvalidResult(
      "",
      source,
      fileName,
      {
        field: "log",
        code: "unreadable",
        message: VALIDATION_MESSAGES.unreadableInput,
      },
      options,
    );
  }

  const byteCount = getUtf8ByteLength(text);
  const maxBytes = positiveLimit(options.maxInputBytes, DEFAULT_MAX_ANALYZED_BYTES, HARD_MAX_ANALYZED_BYTES);
  const maxCharacters = positiveLimit(options.maxInputCharacters, Number.MAX_SAFE_INTEGER, HARD_MAX_ANALYZED_BYTES);
  if (byteCount > maxBytes || text.length > maxCharacters) {
    return createInvalidResult(text, source, fileName, createTooLargeError(byteCount, maxBytes), options);
  }

  const maxLines = positiveLimit(options.maxInputLines, DEFAULT_MAX_ANALYZED_LINES, HARD_MAX_ANALYZED_LINES);
  if (lineCount(text) > maxLines) {
    return createInvalidResult(text, source, fileName, createTooLargeError(byteCount, maxBytes), options);
  }
  const normalized = normalizeLogText(text);

  const ruleCatalogVersion = options.ruleCatalogVersion ?? options.catalogVersion ?? RULE_CATALOG_VERSION;
  const analysisSeed = `${source}|${normalized.text}`;
  const idFactory = (kind: "finding", seed: string): string => createId(kind, seed, options.idFactory);
  const findings = analyzeDiagnostics(normalized, {
    ruleCatalogVersion,
    maxFindings: positiveLimit(options.maxFindings, DEFAULT_MAX_FINDINGS, HARD_MAX_FINDINGS),
    maxEvidenceLines: positiveLimit(options.maxEvidenceLines, DEFAULT_MAX_EVIDENCE_LINES, HARD_MAX_EVIDENCE_LINES),
    maxEvidenceLineLength: positiveLimit(options.maxEvidenceLineLength, DEFAULT_MAX_EVIDENCE_LINE_LENGTH, HARD_MAX_EVIDENCE_LINE_LENGTH),
    contextLines: positiveLimit(options.contextLines, DEFAULT_CONTEXT_LINES, HARD_MAX_CONTEXT_LINES),
    maxMatchesPerRule: positiveLimit(options.maxMatchesPerRule, DEFAULT_MAX_MATCHES_PER_RULE, HARD_MAX_MATCHES_PER_RULE),
    createId: idFactory,
  });
  const base = {
    id: createId("analysis", analysisSeed, options.idFactory),
    analyzedAt: createTimestamp(options.timestampFactory),
    input: createInputSummary(text, source, fileName, normalized.normalizedNewlines),
    ruleCatalogVersion,
  } as const;

  if (findings.length === 0) {
    return {
      ...base,
      status: "no-match",
      findings: [],
      message: "No supported diagnostic matched this log.",
    };
  }

  return {
    ...base,
    status: "complete",
    findings,
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
