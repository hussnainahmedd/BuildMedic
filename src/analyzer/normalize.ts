import { getUtf8ByteLength, HARD_MAX_LOG_BYTES } from "../lib/validation";

/** A normalized line retains the source line's one-based position. */
export interface NormalizedLog {
  readonly text: string;
  readonly lines: readonly string[];
  /** Control-free, whitespace-normalized lines used only by diagnostic matchers. */
  readonly matchingLines: readonly string[];
  readonly byteCount: number;
  readonly normalizedNewlines: boolean;
}

export interface RedactedText {
  readonly text: string;
  readonly redacted: boolean;
  /** Present for evidence rendering when original or displayed content was cut. */
  readonly truncated?: boolean;
}

const PRIVATE_KEY_HEADER_PATTERN = /-----BEGIN[^\r\n-]{0,100}?\bPRIVATE[ \t]+KEY(?:-----)?/gi;
const PRIVATE_KEY_FOOTER_PATTERN = /-----END[^\r\n-]{0,100}?\bPRIVATE[ \t]+KEY-----/gi;
const BEARER_PATTERN = /\bBearer[ \t]+(?:\[REDACTED TOKEN\][^\s"'<>;,]*|[^\s"'<>;,]+)/gi;
const BASIC_AUTH_PATTERN = /\bBasic[ \t]+(?:\[REDACTED CREDENTIAL\][^\s"'<>;,]*|[^\s"'<>;,]+)/gi;
const URL_CREDENTIAL_PATTERN = /(\b[A-Za-z][A-Za-z0-9+.-]{0,31}:\/\/)[^/\s@]+@/g;
const QUERY_SECRET_PATTERN = /([?&](?:access[_-]?token|api[_-]?key|auth(?:orization)?|client[_-]?secret|password|passwd|secret|token)=)(?:\[REDACTED SECRET\])?[^&\s"'<>]*/gi;
const KNOWN_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_-]{8,}|npm_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16,})/g;
const SECRET_ASSIGNMENT_PATTERN = /(?:"((?:\\.|[^"\\\r\n]){1,256})"|'((?:\\.|[^'\\\r\n]){1,256})'|(\b[A-Za-z_][A-Za-z0-9_-]{0,255}))([ \t]*[:=][ \t]*)/g;

function newlineSeparators(value: string): string {
  // Do not merge a standalone CR and a later LF into a new CRLF separator.
  return value.replace(/[^\r\n]+/g, (run: string, offset: number) =>
    value[offset - 1] === "\r" && value[offset + run.length] === "\n" ? "[REDACTED]" : "",
  );
}

function secretName(value: string): boolean {
  const compact = value.replace(/[_-]/g, "").toLowerCase();
  return /(?:password|passwd|secret|token|apikey|accesskey|privatekey|authorization|auth)$/.test(compact);
}

function redactAssignments(value: string): string {
  const pattern = new RegExp(SECRET_ASSIGNMENT_PATTERN);
  const parts: string[] = [];
  let copiedThrough = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    let key = match[1] ?? match[2] ?? match[3] ?? "";
    if (match[1]?.includes("\\")) {
      try { key = JSON.parse(`"${match[1]}"`) as string; } catch { /* An invalid JSON key is not trusted as an assignment. */ }
    }
    if (!secretName(key)) continue;

    const start = pattern.lastIndex;
    let end = start;
    const quote = value[start];
    const quoted = quote === '"' || quote === "'";
    if (quoted) {
      end += 1;
      while (end < value.length) {
        if (value[end] === "\\") {
          end = Math.min(value.length, end + 2);
        } else if (value[end++] === quote) {
          break;
        }
      }
    } else if (/(?:authorization|auth)$/i.test(key)) {
      while (end < value.length && value[end] !== "\r" && value[end] !== "\n") end += 1;
    } else {
      const scheme = /^(?:Bearer|Basic)[ \t]+/i.exec(value.slice(start, start + 32));
      if (scheme !== null) end += scheme[0].length;
      const placeholder = /^\[REDACTED (?:SECRET|TOKEN|CREDENTIAL)\]/.exec(value.slice(end, end + 32));
      if (placeholder !== null) end += placeholder[0].length;
      while (end < value.length && !/[\s"',;&<>}]/.test(value[end])) end += 1;
    }
    if (end === start) continue;
    parts.push(value.slice(copiedThrough, start), quoted ? `${quote}[REDACTED SECRET]${quote}` : "[REDACTED SECRET]", newlineSeparators(value.slice(start, end)));
    copiedThrough = end;
    pattern.lastIndex = end;
  }
  if (copiedThrough === 0) return value;
  parts.push(value.slice(copiedThrough));
  return parts.join("");
}

function redactPrivateKeys(value: string): string {
  const header = new RegExp(PRIVATE_KEY_HEADER_PATTERN);
  const footer = new RegExp(PRIVATE_KEY_FOOTER_PATTERN);
  const parts: string[] = [];
  let copiedThrough = 0;
  let match: RegExpExecArray | null;
  while ((match = header.exec(value)) !== null) {
    footer.lastIndex = header.lastIndex;
    const closed = footer.exec(value);
    const end = closed === null ? value.length : footer.lastIndex;
    parts.push(value.slice(copiedThrough, match.index), "[REDACTED PRIVATE KEY]", newlineSeparators(value.slice(match.index, end)));
    copiedThrough = end;
    header.lastIndex = end;
  }
  if (copiedThrough === 0) return value;
  parts.push(value.slice(copiedThrough));
  return parts.join("");
}

/**
 * Removes terminal escape/control noise without changing ordinary evidence
 * characters. Tabs are kept for display; matching separately turns them into
 * spaces and collapses whitespace.
 */
export function stripAnsiAndControl(value: string): string {
  // The common case must not allocate one string node per character. In the
  // slow path retain spans; repeatedly reading a growing concatenation at each
  // newline can force quadratic rope flattening on multi-megabyte logs.
  if (!/(?:(?![\t\r\n])\p{Cc}|[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff])/u.test(value)) return value;
  const parts: string[] = [];
  let spanStart = 0;
  let lastOutputCode = -1;
  let index = 0;
  const flush = (end: number) => { if (end > spanStart) parts.push(value.slice(spanStart, end)); };
  const retainNewline = (cursor: number) => {
    const code = value.charCodeAt(cursor);
    if (code === 10 && lastOutputCode === 13 && value[cursor - 1] !== "\r") parts.push("[CONTROL]");
    parts.push(value[cursor]);
    lastOutputCode = code;
  };

  while (index < value.length) {
    const code = value.charCodeAt(index);

    if (code === 0x1b) {
      flush(index);
      const next = value.charCodeAt(index + 1);

      // CSI sequences end at the first final byte in the 0x40–0x7e range.
      if (next === 0x5b) {
        let cursor = index + 2;
        while (cursor < value.length) {
          const cursorCode = value.charCodeAt(cursor);
          if (cursorCode === 10 || cursorCode === 13) break;
          cursor += 1;
          if (cursorCode >= 0x40 && cursorCode <= 0x7e) {
            break;
          }
        }
        index = cursor;
        spanStart = index;
        continue;
      }

      // OSC sequences terminate with BEL or ST (ESC followed by backslash).
      if (next === 0x5d) {
        let cursor = index + 2;
        while (cursor < value.length) {
          const cursorCode = value.charCodeAt(cursor);
          if (cursorCode === 10 || cursorCode === 13) retainNewline(cursor);
          if (cursorCode === 0x07) {
            cursor += 1;
            break;
          }
          if (cursorCode === 0x1b && value.charCodeAt(cursor + 1) === 0x5c) {
            cursor += 2;
            break;
          }
          cursor += 1;
        }
        index = cursor;
        spanStart = index;
        continue;
      }

      // Other two-byte terminal escapes are noise for diagnostics.
      index += value[index + 1] === "\n" || value[index + 1] === "\r" ? 1 : Math.min(2, value.length - index);
      spanStart = index;
      continue;
    }

    // Keep tabs for readable evidence; remove other C0/C1 controls.
    if ((code <= 0x08) || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2060 && code <= 0x206f) || code === 0xfeff) {
      flush(index);
      index += 1;
      spanStart = index;
      continue;
    }

    if (code === 10 && lastOutputCode === 13 && value[index - 1] !== "\r") {
      flush(index);
      parts.push("[CONTROL]");
      spanStart = index;
    }
    lastOutputCode = code;
    index += 1;
  }

  flush(value.length);
  return parts.join("");
}

/**
 * Best-effort redaction of common credentials from a display-only copy.
 * This is not a guarantee that arbitrary secrets can be detected. Regex work
 * is bounded by the shared input ceiling; over-limit content is withheld.
 * Matching always happens before this function and never uses the redacted
 * value, so diagnostic line identity is not changed by secrecy protection.
 */
export function redactSensitiveText(value: string): RedactedText {
  if (value.length > HARD_MAX_LOG_BYTES) {
    return { text: `[REDACTED: INPUT LIMIT]${newlineSeparators(value)}`, redacted: true };
  }
  // Remove display noise first, including escapes inserted inside credentials.
  let text = redactPrivateKeys(stripAnsiAndControl(value));
  // Parse quoted assignments before replacing their contents: a Bearer/URL
  // replacement must not consume a JSON escape and orphan a value's suffix.
  text = redactAssignments(text);
  text = text
    .replace(URL_CREDENTIAL_PATTERN, "$1[REDACTED CREDENTIAL]@")
    .replace(BEARER_PATTERN, "Bearer [REDACTED TOKEN]")
    .replace(BASIC_AUTH_PATTERN, "Basic [REDACTED CREDENTIAL]");
  // Recognize assignments before token prefixes: e.g. npm_token is a key,
  // and replacing that key first would orphan its secret value.
  text = text.replace(KNOWN_TOKEN_PATTERN, "[REDACTED TOKEN]");
  text = text.replace(QUERY_SECRET_PATTERN, (_match, prefix: string) => `${prefix}[REDACTED SECRET]`);
  return { text, redacted: text !== value };
}

export const redactText = redactSensitiveText;

/**
 * Redacts an entire log in one bounded pass while retaining every newline
 * separator. This is intended for reports/copy actions; matching continues to
 * use the original normalized text and never this display-safe value.
 */
export function redactSensitiveLog(value: string): RedactedText {
  return redactSensitiveText(value);
}

export const redactWholeLog = redactSensitiveLog;

/** Returns a display-safe line, bounded for evidence rendering. */
export function sanitizeEvidenceLine(value: string, maxCharacters = 512): RedactedText {
  const safeLimit = Number.isFinite(maxCharacters) && maxCharacters >= 1
    ? Math.min(Math.floor(maxCharacters), 4096)
    : 512;
  // Never cut before redaction: that could expose a token suffix or a quoted
  // value cut off before its closing quote. The redactor has its own hard cap.
  const redactedValue = redactSensitiveText(value);
  const truncated = value.length > safeLimit || redactedValue.text.length > safeLimit;
  const truncationMarker = "… [truncated]";
  const text = truncated
    ? safeLimit <= truncationMarker.length
      ? truncationMarker.slice(0, safeLimit)
      : `${redactedValue.text.slice(0, safeLimit - truncationMarker.length)}${truncationMarker}`
    : redactedValue.text;

  return {
    text,
    redacted: redactedValue.redacted || truncated,
    truncated,
  };
}

/**
 * Normalizes all three common newline encodings. Splitting after normalization
 * preserves the source line order and gives every matcher a stable line index.
 */
export function normalizeLogText(value: string): NormalizedLog {
  const text = value.replace(/\r\n?/g, "\n");
  const lines = text.length === 0 ? [] : text.split("\n");
  const matchingLines = lines.map((line) =>
    stripAnsiAndControl(line).replace(/\t/g, " ").replace(/\s+/g, " ").trim(),
  );

  return {
    text,
    lines,
    matchingLines,
    byteCount: getUtf8ByteLength(value),
    normalizedNewlines: text !== value,
  };
}

/** Alias retained for callers that describe this boundary as build-log normalization. */
export const normalizeBuildLog = normalizeLogText;
export const normalizeLog = normalizeLogText;
