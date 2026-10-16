import type { AnalysisResult, AnalysisSource, VerificationResult } from "../types";
import { DEFAULT_MAX_LOG_BYTES, type TextInputInspection } from "../lib/validation";
import type { ValidationError } from "../types/validation";

export const WORKER_PROTOCOL_VERSION = 1;
export const VIEWER_PAGE_SIZE = 200;
export const MAX_VIEWER_COPY_BYTES = 2 * 1024 * 1024;

export interface ViewerLine { readonly lineNumber: number; readonly text: string }
export interface ViewerSummary {
  readonly lineCount: number;
  readonly inputBytes: number;
  readonly truncated: boolean;
}
export interface ViewerPage extends ViewerSummary {
  readonly lines: readonly ViewerLine[];
  readonly matchingCount: number;
  readonly page: number;
  readonly pageCount: number;
}
export interface ViewerCopy { readonly text: string; readonly truncated: boolean }
export interface InputInspection extends Omit<TextInputInspection, "validation"> {
  readonly validation: { readonly valid: true; readonly warning: boolean } | { readonly valid: false; readonly error: ValidationError };
}
export function compactInspection(inspection: TextInputInspection): InputInspection {
  return { ...inspection, validation: inspection.validation.valid
    ? { valid: true, warning: inspection.validation.value.warning }
    : { valid: false, error: inspection.validation.error } };
}

export interface TaskInputs {
  analyze: { readonly text: string; readonly source: AnalysisSource; readonly fileName?: string };
  compare: { readonly baseline: string; readonly rerun: string };
  inspect: { readonly text: string };
  "viewer-prepare": { readonly text: string };
  "viewer-page": { readonly query: string; readonly mode: "all" | "errors"; readonly page: number };
  "viewer-copy": Record<string, never>;
}
export interface TaskOutputs {
  analyze: AnalysisResult;
  compare: VerificationResult;
  inspect: InputInspection;
  "viewer-prepare": ViewerSummary;
  "viewer-page": ViewerPage;
  "viewer-copy": ViewerCopy;
}
export type TaskKind = keyof TaskInputs;
export type WorkerRequest = { [K in TaskKind]: {
  readonly version: typeof WORKER_PROTOCOL_VERSION;
  readonly id: number;
  readonly kind: K;
  readonly input: TaskInputs[K];
} }[TaskKind];
export type WorkerResponse = {
  readonly version: typeof WORKER_PROTOCOL_VERSION;
  readonly id: number;
  readonly ok: true;
  readonly result: TaskOutputs[TaskKind];
} | {
  readonly version: typeof WORKER_PROTOCOL_VERSION;
  readonly id: number;
  readonly ok: false;
  readonly code: "invalid-request" | "failed";
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  // An O(1) character guard precedes structured cloning, validation, or regex work.
  return typeof value === "string" && value.length <= DEFAULT_MAX_LOG_BYTES;
}

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!record(value) || value.version !== WORKER_PROTOCOL_VERSION || !Number.isSafeInteger(value.id) || Number(value.id) < 1 || !record(value.input)) return false;
  const input = value.input;
  switch (value.kind) {
    case "analyze": return text(input.text) && (input.source === "paste" || input.source === "file") && (input.fileName === undefined || (typeof input.fileName === "string" && input.fileName.length <= 255));
    case "compare": return text(input.baseline) && text(input.rerun);
    case "inspect":
    case "viewer-prepare": return text(input.text);
    case "viewer-page": return typeof input.query === "string" && input.query.length <= 256 && (input.mode === "all" || input.mode === "errors") && Number.isSafeInteger(input.page) && Number(input.page) >= 0 && Number(input.page) <= 100_000;
    case "viewer-copy": return Object.keys(input).length === 0;
    default: return false;
  }
}

/** Validate transport shape/bounds before UI code consumes a response. */
export function isTaskOutput(kind: TaskKind, value: unknown): boolean {
  if (!record(value)) return false;
  const count = (item: unknown, max = 200_001) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0 && item <= max;
  const string = (item: unknown, max = 4096) => typeof item === "string" && item.length <= max;
  const error = (item: unknown) => record(item) && string(item.message);
  const summary = () => count(value.lineCount) && count(value.inputBytes, DEFAULT_MAX_LOG_BYTES * 4) && typeof value.truncated === "boolean";
  switch (kind) {
    case "analyze": return string(value.id, 200) && string(value.analyzedAt, 80) && string(value.ruleCatalogVersion, 160)
      && record(value.input) && count(value.input.byteCount, DEFAULT_MAX_LOG_BYTES * 4) && count(value.input.lineCount)
      && Array.isArray(value.findings) && value.findings.length <= 256
      && (value.status === "invalid" ? error(value.error) : value.status === "no-match" ? string(value.message) : value.status === "complete" && value.findings.every((finding) => record(finding) && string(finding.id, 200) && string(finding.title) && Array.isArray(finding.evidence) && finding.evidence.length <= 16 && Array.isArray(finding.suggestedActions) && finding.suggestedActions.length <= 16));
    case "compare": return string(value.id, 200) && Array.isArray(value.comparisons) && value.comparisons.length <= 512
      && (value.status === "invalid" ? error(value.error) : (value.status === "compared" || value.status === "no-match") && record(value.summary)
        && ["improved", "regressed", "no-change", "changed", "uncertain"].includes(String(value.outcome))
        && count(value.summary.resolvedCount, 512) && count(value.summary.persistentCount, 512) && count(value.summary.newCount, 512));
    case "inspect": return count(value.byteCount, DEFAULT_MAX_LOG_BYTES * 4) && count(value.lineCount) && typeof value.complete === "boolean" && record(value.validation) && (value.validation.valid === true || (value.validation.valid === false && error(value.validation.error)));
    case "viewer-prepare": return summary();
    case "viewer-page": return summary() && count(value.page) && count(value.pageCount) && count(value.matchingCount) && Array.isArray(value.lines)
      && value.lines.length <= VIEWER_PAGE_SIZE && value.lines.every((line) => record(line) && count(line.lineNumber) && Number(line.lineNumber) > 0 && string(line.text));
    case "viewer-copy": return string(value.text, MAX_VIEWER_COPY_BYTES) && typeof value.truncated === "boolean";
  }
}

/** Never forward extra properties across the worker boundary. */
export function createWorkerRequest<K extends TaskKind>(id: number, kind: K, input: TaskInputs[K]): WorkerRequest {
  const request = { version: WORKER_PROTOCOL_VERSION, id, kind, input };
  if (!isWorkerRequest(request)) throw new Error("invalid-request");
  const value = request.input;
  switch (request.kind) {
    case "analyze": {
      const data = value as TaskInputs["analyze"];
      return { version: 1, id, kind: "analyze", input: { text: data.text, source: data.source, ...(data.fileName === undefined ? {} : { fileName: data.fileName }) } };
    }
    case "compare": {
      const data = value as TaskInputs["compare"];
      return { version: 1, id, kind: "compare", input: { baseline: data.baseline, rerun: data.rerun } };
    }
    case "inspect":
    case "viewer-prepare": return { version: 1, id, kind: request.kind, input: { text: (value as TaskInputs["inspect"]).text } };
    case "viewer-page": {
      const data = value as TaskInputs["viewer-page"];
      return { version: 1, id, kind: "viewer-page", input: { query: data.query, mode: data.mode, page: data.page } };
    }
    case "viewer-copy": return { version: 1, id, kind: "viewer-copy", input: {} };
  }
}
