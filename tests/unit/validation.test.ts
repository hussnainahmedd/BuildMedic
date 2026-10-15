import { describe, expect, it } from "vitest";

import {
  DEFAULT_VALIDATION_POLICY,
  getUtf8ByteLength,
  isTextLikeMimeType,
  validateFile,
  validateLogText,
  validateVerificationLogs,
} from "../../src/lib/validation";
import type { TextFileLike, ValidationPolicy } from "../../src/types";

const smallPolicy: ValidationPolicy = {
  ...DEFAULT_VALIDATION_POLICY,
  warningBytes: 4,
  maxBytes: 8,
};

function makeFile(overrides: Partial<TextFileLike> = {}): TextFileLike {
  return {
    name: "build.log",
    type: "text/plain",
    size: 4,
    ...overrides,
  };
}

describe("UTF-8 byte boundaries", () => {
  it("counts ASCII, multibyte Unicode, and a supplementary code point", () => {
    expect(getUtf8ByteLength("build")).toBe(5);
    expect(getUtf8ByteLength("é")).toBe(2);
    expect(getUtf8ByteLength("🙂")).toBe(4);
  });

  it("handles an unmatched surrogate without throwing", () => {
    expect(getUtf8ByteLength("\ud800")).toBe(3);
  });
});

describe("validateLogText", () => {
  it("rejects empty, whitespace-only, and null-like values with the documented required message", () => {
    for (const value of ["", " \n\t ", null, undefined]) {
      const result = validateLogText(value, smallPolicy);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe("required");
        expect(result.error.message).toBe("Paste a build log to analyze.");
      }
    }
  });

  it("rejects values that are not text", () => {
    const result = validateLogText(42, smallPolicy);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("unreadable");
      expect(result.error.message).toBe("We could not read this input as text.");
    }
  });

  it("accepts the exact byte limit and marks the warning boundary without invalidating it", () => {
    const result = validateLogText("12345678", smallPolicy);

    expect(result).toEqual({
      valid: true,
      value: {
        text: "12345678",
        byteCount: 8,
        warning: true,
      },
    });
  });

  it("rejects one byte over the limit with the documented size message", () => {
    const result = validateLogText("123456789", smallPolicy);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("too-large");
      expect(result.error.message).toBe("This log is too large. Reduce it to 8 bytes or less.");
      expect(result.error.actualBytes).toBe(9);
      expect(result.error.limitBytes).toBe(8);
    }
  });

  it("uses UTF-8 bytes rather than JavaScript string length", () => {
    const result = validateLogText("🙂🙂", smallPolicy);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.byteCount).toBe(8);
    }
  });
});

describe("text file selection", () => {
  it("accepts a text MIME type and applies the same exact size boundary", () => {
    const result = validateFile(makeFile({ size: smallPolicy.maxBytes }), smallPolicy);

    expect(result).toEqual({
      valid: true,
      value: {
        file: makeFile({ size: smallPolicy.maxBytes }),
        byteCount: smallPolicy.maxBytes,
        warning: true,
      },
    });
  });

  it("rejects an oversized file before any type-specific work", () => {
    const result = validateFile(
      makeFile({ size: smallPolicy.maxBytes + 1, type: "text/plain" }),
      smallPolicy,
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("too-large");
      expect(result.error.message).toBe("This file is too large. Choose a smaller log.");
      expect(result.error.actualBytes).toBe(9);
    }
  });

  it("does not accept a log extension when the MIME type is unknown or binary", () => {
    for (const type of ["", "application/octet-stream", "application/pdf"]) {
      const result = validateFile(makeFile({ name: "looks-like-a-log.log", type }), smallPolicy);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe("unsupported-type");
        expect(result.error.message).toBe("Choose a readable text log file.");
      }
    }
  });

  it("accepts MIME parameters and case differences", () => {
    expect(isTextLikeMimeType("TEXT/PLAIN; charset=utf-8")).toBe(true);
    expect(validateFile(makeFile({ type: "Application/JSON; charset=utf-8" }), smallPolicy).valid).toBe(
      true,
    );
  });

  it("reports missing and malformed file metadata safely", () => {
    const missing = validateFile(undefined, smallPolicy);
    const malformed = validateFile(makeFile({ size: Number.NaN }), smallPolicy);

    expect(missing).toEqual({
      valid: false,
      error: {
        code: "required",
        field: "file",
        message: "Choose a build log file to analyze.",
      },
    });
    expect(malformed).toEqual({
      valid: false,
      error: {
        code: "unreadable",
        field: "file",
        message: "We could not read this input as text.",
      },
    });
  });
});

describe("validateVerificationLogs", () => {
  it("uses the documented independent required messages", () => {
    const result = validateVerificationLogs("", "   ", smallPolicy);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.message)).toEqual([
      "Add the original build log before verifying a fix.",
      "Add the rerun build log before verifying a fix.",
    ]);
    expect(result.errors.map((error) => error.field)).toEqual(["baseline", "rerun"]);
  });

  it("accepts identical valid logs and keeps both values independently visible", () => {
    const result = validateVerificationLogs("same log", "same log", smallPolicy);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.baseline.valid).toBe(true);
    expect(result.rerun.valid).toBe(true);
  });

  it("reports unreadable verification values without throwing", () => {
    const result = validateVerificationLogs({ log: true }, "valid", smallPolicy);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: "unreadable",
      field: "baseline",
      message: "The baseline and rerun logs must be readable text.",
    });
  });
});
