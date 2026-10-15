export const VALIDATION_ERROR_CODES = [
  "required",
  "too-large",
  "unsupported-type",
  "unreadable",
] as const;

export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];

export type ValidationField = "log" | "file" | "baseline" | "rerun";

export interface ValidationError {
  readonly code: ValidationErrorCode;
  readonly field: ValidationField;
  readonly message: string;
  readonly actualBytes?: number;
  readonly limitBytes?: number;
  readonly mimeType?: string;
}

export interface ValidationPolicy {
  /** The optional warning threshold. Inputs at this size remain valid. */
  readonly warningBytes: number;
  /** The hard byte limit shared by pasted text and selected files. */
  readonly maxBytes: number;
  /** MIME patterns accepted for a selected text file. */
  readonly acceptedMimeTypes: readonly string[];
}

/** A small structural subset of File, which keeps validation browser-independent. */
export interface TextFileLike {
  readonly name?: string;
  readonly type?: string;
  readonly size: number;
}

export interface ValidatedText {
  readonly text: string;
  readonly byteCount: number;
  readonly warning: boolean;
}

export interface ValidatedFile {
  readonly file: TextFileLike;
  readonly byteCount: number;
  readonly warning: boolean;
}

export interface ValidationSuccess<T> {
  readonly valid: true;
  readonly value: T;
}

export interface ValidationFailure {
  readonly valid: false;
  readonly error: ValidationError;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export type TextValidationResult = ValidationResult<ValidatedText>;

export type FileValidationResult = ValidationResult<ValidatedFile>;

export interface VerificationValidationResult {
  readonly valid: boolean;
  readonly baseline: TextValidationResult;
  readonly rerun: TextValidationResult;
  readonly errors: readonly ValidationError[];
}
