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
  acceptedMimeTypes: DEFAULT_ACCEPTED_TEXT_MIME_TYPES,
};

export const VALIDATION_MESSAGES = {
  requiredLog: "Paste a build log to analyze.",
  tooLargeLog: (limit: string) => `This log is too large. Reduce it to ${limit} or less.`,
  unreadableInput: "We could not read this input as text.",
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
  details: Pick<ValidationError, "actualBytes" | "limitBytes" | "mimeType"> = {},
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

function isBlankText(value: string): boolean {
  return value.trim().length === 0;
}

function hasWarning(byteCount: number, policy: ValidationPolicy): boolean {
  return byteCount >= policy.warningBytes;
}

/**
 * Validates pasted text before any normalization or analysis work occurs.
 * The original string is returned unchanged so line boundaries remain the
 * responsibility of a later domain step.
 */
export function validateLogText(
  value: unknown,
  policy: ValidationPolicy = DEFAULT_VALIDATION_POLICY,
): TextValidationResult {
  if (value === null || value === undefined || (typeof value === "string" && isBlankText(value))) {
    return createFailure("log", "required", VALIDATION_MESSAGES.requiredLog);
  }

  if (typeof value !== "string") {
    return createFailure("log", "unreadable", VALIDATION_MESSAGES.unreadableInput);
  }

  const byteCount = getUtf8ByteLength(value);

  if (byteCount > policy.maxBytes) {
    return createFailure(
      "log",
      "too-large",
      VALIDATION_MESSAGES.tooLargeLog(formatByteLimit(policy.maxBytes)),
      { actualBytes: byteCount, limitBytes: policy.maxBytes },
    );
  }

  const validatedText: ValidatedText = {
    text: value,
    byteCount,
    warning: hasWarning(byteCount, policy),
  };

  return createSuccess(validatedText);
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
