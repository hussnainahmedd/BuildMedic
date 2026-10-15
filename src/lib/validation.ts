import type {
  FileValidationResult,
  TextFileLike,
  TextValidationResult,
  ValidatedText,
  ValidationError,
  ValidationField,
  ValidationPolicy,
  ValidationResult,
  VerificationValidationResult,
} from "../types/validation";

export const DEFAULT_WARNING_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MAX_LOG_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_LOG_LINES = 100_000;
export const DEFAULT_MAX_LOG_LINE_LENGTH = 16_384;
export const HARD_MAX_LOG_BYTES = 50 * 1024 * 1024;
export const HARD_MAX_LOG_LINES = 200_000;
export const HARD_MAX_LOG_LINE_LENGTH = 65_536;

/**
 * MIME patterns are intentionally used as an input signal. A filename extension
 * such as `.log` is never sufficient on its own to pass file validation.
 */
export const DEFAULT_ACCEPTED_TEXT_MIME_TYPES = [
  "text/*",
  "application/json",
  "application/*+json",
  "application/xml",
  "application/*+xml",
  "application/javascript",
  "application/typescript",
  "application/x-ndjson",
] as const;

export const DEFAULT_VALIDATION_POLICY: ValidationPolicy = {
  warningBytes: DEFAULT_WARNING_BYTES,
  maxBytes: DEFAULT_MAX_LOG_BYTES,
  maxLines: DEFAULT_MAX_LOG_LINES,
  maxLineLength: DEFAULT_MAX_LOG_LINE_LENGTH,
  acceptedMimeTypes: DEFAULT_ACCEPTED_TEXT_MIME_TYPES,
};

export const VALIDATION_MESSAGES = {
  requiredLog: "Paste a build log to analyze.",
  tooLargeLog: (limit: string) => `This log is too large. Reduce it to ${limit} or less.`,
  unreadableInput: "We could not read this input as text.",
  binaryInput: "This input contains binary or unreadable characters. Export a UTF-8 text log and try again.",
  tooManyLines: (limit: number) => `This log has too many lines. Reduce it to ${limit.toLocaleString("en-US")} lines or less.`,
  lineTooLong: (line: number, limit: number) => `Log line ${line} is too long. Wrap or shorten it to ${limit.toLocaleString("en-US")} characters or less.`,
  unsupportedFile: "Choose a readable text log file.",
  tooLargeFile: "This file is too large. Choose a smaller log.",
  requiredFile: "Choose a build log file to analyze.",
  requiredBaseline: "Add the original build log before verifying a fix.",
  requiredRerun: "Add the rerun build log before verifying a fix.",
  unreadableVerification: "The baseline and rerun logs must be readable text.",
} as const;

/**
 * Counts UTF-8 bytes without reading files, normalizing text, or relying on a
 * browser global. Lone UTF-16 surrogates count as the three bytes used by the
 * UTF-8 replacement character, matching TextEncoder behavior.
 */
export function getUtf8ByteLength(value: string): number {
  let byteCount = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 0x7f) {
      byteCount += 1;
      continue;
    }

    if (codeUnit <= 0x7ff) {
      byteCount += 2;
      continue;
    }

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);

      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        byteCount += 4;
        index += 1;
        continue;
      }
    }

    byteCount += 3;
  }

  return byteCount;
}

export function formatByteLimit(byteCount: number): string {
  const mebibyte = 1024 * 1024;
  const kibibyte = 1024;

  if (byteCount >= mebibyte && byteCount % mebibyte === 0) {
    return `${byteCount / mebibyte} MiB`;
  }

  if (byteCount >= kibibyte && byteCount % kibibyte === 0) {
    return `${byteCount / kibibyte} KiB`;
  }

  return `${byteCount} bytes`;
}

function createFailure(
  field: ValidationField,
  code: ValidationError["code"],
  message: string,
  details: Omit<ValidationError, "field" | "code" | "message"> = {},
): { readonly valid: false; readonly error: ValidationError } {
  return {
    valid: false,
    error: {
      field,
      code,
      message,
      ...details,
    },
  };
}

function createSuccess<T>(value: T): ValidationResult<T> {
  return { valid: true, value };
}

function hasWarning(byteCount: number, policy: ValidationPolicy): boolean {
  return byteCount >= policy.warningBytes;
}

/**
 * Validates pasted text before any normalization or analysis work occurs.
 * The original string is returned unchanged so line boundaries remain the
 * responsibility of a later domain step.
 */
export interface TextInputInspection {
  readonly validation: TextValidationResult;
  readonly byteCount: number;
  readonly lineCount: number;
  readonly normalizedNewlines: boolean;
  /** False when validation stopped early; counts describe only a bounded prefix. */
  readonly complete: boolean;
}

function inputLimit(value: number | undefined, fallback: number, ceiling: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), ceiling)
    : fallback;
}

/** One bounded scan shared by validation and analysis, before normalization or regex matching. */
export function inspectLogText(
  value: unknown,
  policy: ValidationPolicy = DEFAULT_VALIDATION_POLICY,
): TextInputInspection {
  let byteCount = 0;
  let lineCount = typeof value === "string" && value.length > 0 ? 1 : 0;
  let normalizedNewlines = false;
  const finish = (validation: TextValidationResult, complete: boolean): TextInputInspection => ({
    validation, byteCount, lineCount, normalizedNewlines, complete,
  });
  if (value === null || value === undefined || value === "") {
    return finish(createFailure("log", "required", VALIDATION_MESSAGES.requiredLog), true);
  }

  if (typeof value !== "string") {
    return finish(createFailure("log", "unreadable", VALIDATION_MESSAGES.unreadableInput), true);
  }

  const maxBytes = inputLimit(policy.maxBytes, DEFAULT_MAX_LOG_BYTES, HARD_MAX_LOG_BYTES);
  const maxLines = inputLimit(policy.maxLines, DEFAULT_MAX_LOG_LINES, HARD_MAX_LOG_LINES);
  const maxLineLength = inputLimit(policy.maxLineLength, DEFAULT_MAX_LOG_LINE_LENGTH, HARD_MAX_LOG_LINE_LENGTH);
  const maxCharacters = inputLimit(policy.maxCharacters, HARD_MAX_LOG_BYTES, HARD_MAX_LOG_BYTES);
  // UTF-8 bytes are never fewer than UTF-16 code units. Reject huge strings
  // without trimming, splitting, hashing, or scanning their remaining content.
  if (value.length > maxCharacters) {
    byteCount = value.length;
    lineCount = 0;
    return finish(createFailure(
      "log",
      "too-large",
      `This log is too long. Reduce it to ${maxCharacters.toLocaleString("en-US")} characters or less.`,
      { actualBytes: byteCount, limitBytes: maxBytes, actualBytesIsLowerBound: true },
    ), false);
  }

  let column = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    let units = 1;
    if (code <= 0x7f) byteCount += 1;
    else if (code <= 0x7ff) byteCount += 2;
    else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      byteCount += 4;
      units = 2;
    } else byteCount += 3;

    if (code === 0 || (code < 0x20 && ![7, 8, 9, 10, 13, 27].includes(code)) || (code >= 0x7f && code <= 0x9f) || code === 0xfffd ||
      (code >= 0xd800 && code <= 0xdfff && units === 1)) {
      return finish(createFailure("log", "unreadable", VALIDATION_MESSAGES.binaryInput), false);
    }
    if (byteCount > maxBytes) {
      return finish(createFailure("log", "too-large", VALIDATION_MESSAGES.tooLargeLog(formatByteLimit(maxBytes)), {
        actualBytes: byteCount, limitBytes: maxBytes, actualBytesIsLowerBound: index + units < value.length,
      }), false);
    }

    if (code === 13 || code === 10) {
      if (code === 13) normalizedNewlines = true;
      if (code !== 10 || value.charCodeAt(index - 1) !== 13) lineCount += 1;
      column = 0;
      if (lineCount > maxLines) {
        return finish(createFailure("log", "too-large", VALIDATION_MESSAGES.tooManyLines(maxLines), {
          actualLines: lineCount, limitLines: maxLines,
        }), false);
      }
    } else {
      column += units;
      if (column > maxLineLength) {
        return finish(createFailure("log", "too-large", VALIDATION_MESSAGES.lineTooLong(lineCount, maxLineLength), {
          lineNumber: lineCount, actualLineLength: column, limitLineLength: maxLineLength,
        }), false);
      }
    }
    index += units - 1;
  }
  if (value.trim().length === 0) {
    return finish(createFailure("log", "required", VALIDATION_MESSAGES.requiredLog), true);
  }
  const validatedText: ValidatedText = {
    text: value,
    byteCount,
    warning: hasWarning(byteCount, policy),
  };

  return finish(createSuccess(validatedText), true);
}

export function validateLogText(
  value: unknown,
  policy: ValidationPolicy = DEFAULT_VALIDATION_POLICY,
): TextValidationResult {
  return inspectLogText(value, policy).validation;
}

/** Alias that makes the paste/input boundary explicit at call sites. */
export function validateTextInput(
  value: unknown,
  policy: ValidationPolicy = DEFAULT_VALIDATION_POLICY,
): TextValidationResult {
  return validateLogText(value, policy);
}

function matchesMimePattern(mimeType: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim().toLowerCase();

  if (normalizedPattern === mimeType) {
    return true;
  }

  if (normalizedPattern.endsWith("/*")) {
    return mimeType.startsWith(normalizedPattern.slice(0, -1));
  }

  const wildcardIndex = normalizedPattern.indexOf("*");

  if (wildcardIndex === -1) {
    return false;
  }

  const prefix = normalizedPattern.slice(0, wildcardIndex);
  const suffix = normalizedPattern.slice(wildcardIndex + 1);
  return mimeType.startsWith(prefix) && mimeType.endsWith(suffix);
}

export function isTextLikeMimeType(
  mimeType: unknown,
  acceptedMimeTypes: readonly string[] = DEFAULT_ACCEPTED_TEXT_MIME_TYPES,
): boolean {
  if (typeof mimeType !== "string") {
    return false;
  }

  const normalizedMimeType = mimeType.split(";", 1)[0].trim().toLowerCase();

  if (normalizedMimeType.length === 0) {
    return false;
  }

  return acceptedMimeTypes.some((pattern) => matchesMimePattern(normalizedMimeType, pattern));
}

/**
 * Validates file metadata available at selection time. The structural input
 * keeps this function usable in unit tests without constructing a browser File.
 */
export function validateFile(
  file: TextFileLike | null | undefined,
  policy: ValidationPolicy = DEFAULT_VALIDATION_POLICY,
): FileValidationResult {
  if (file === null || file === undefined) {
    return createFailure("file", "required", VALIDATION_MESSAGES.requiredFile);
  }

  if (!Number.isFinite(file.size) || file.size < 0) {
    return createFailure("file", "unreadable", VALIDATION_MESSAGES.unreadableInput);
  }

  if (file.size > policy.maxBytes) {
    return createFailure(
      "file",
      "too-large",
      VALIDATION_MESSAGES.tooLargeFile,
      { actualBytes: file.size, limitBytes: policy.maxBytes },
    );
  }

  if (!isTextLikeMimeType(file.type, policy.acceptedMimeTypes)) {
    return createFailure(
      "file",
      "unsupported-type",
      VALIDATION_MESSAGES.unsupportedFile,
      { mimeType: typeof file.type === "string" ? file.type : undefined },
    );
  }

  return createSuccess({
    file,
    byteCount: file.size,
    warning: hasWarning(file.size, policy),
  });
}

/** Alias that makes the file-picker boundary explicit at call sites. */
export function validateFileInput(
  file: TextFileLike | null | undefined,
  policy: ValidationPolicy = DEFAULT_VALIDATION_POLICY,
): FileValidationResult {
  return validateFile(file, policy);
}

function replaceErrorField(
  result: TextValidationResult,
  field: "baseline" | "rerun",
  message?: string,
): TextValidationResult {
  if (result.valid) {
    return result;
  }

  return {
    valid: false,
    error: {
      ...result.error,
      field,
      ...(message === undefined ? {} : { message }),
    },
  };
}

function validateVerificationLog(
  value: unknown,
  field: "baseline" | "rerun",
  requiredMessage: string,
  policy: ValidationPolicy,
): TextValidationResult {
  const result = validateLogText(value, policy);

  if (result.valid) {
    return result;
  }

  if (result.error.code === "required") {
    return replaceErrorField(result, field, requiredMessage);
  }

  if (result.error.code === "unreadable") {
    return replaceErrorField(result, field, VALIDATION_MESSAGES.unreadableVerification);
  }

  return replaceErrorField(result, field);
}

/** Validates the two independent text inputs used by the planned verification flow. */
export function validateVerificationLogs(
  baseline: unknown,
  rerun: unknown,
  policy: ValidationPolicy = DEFAULT_VALIDATION_POLICY,
): VerificationValidationResult {
  const baselineResult = validateVerificationLog(
    baseline,
    "baseline",
    VALIDATION_MESSAGES.requiredBaseline,
    policy,
  );
  const rerunResult = validateVerificationLog(
    rerun,
    "rerun",
    VALIDATION_MESSAGES.requiredRerun,
    policy,
  );
  const errors = [
    ...(!baselineResult.valid ? [baselineResult.error] : []),
    ...(!rerunResult.valid ? [rerunResult.error] : []),
  ];

  return {
    valid: errors.length === 0,
    baseline: baselineResult,
    rerun: rerunResult,
    errors,
  };
}
