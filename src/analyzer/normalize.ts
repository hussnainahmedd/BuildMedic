import { getUtf8ByteLength } from "../lib/validation";

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
}

const PRIVATE_KEY_BLOCK_PATTERN = /-----BEGIN [^-\r\n]{1,80}PRIVATE KEY-----[\s\S]{0,65536}?-----END [^-\r\n]{1,80}PRIVATE KEY-----/gi;
const PRIVATE_KEY_HEADER_PATTERN = /-----BEGIN [^-\r\n]{1,80}PRIVATE KEY-----[^\r\n]*/gi;
const BEARER_PATTERN = /\bBearer\s+[-A-Za-z0-9._~+/=]{6,512}/gi;
const BASIC_AUTH_PATTERN = /\bBasic\s+[A-Za-z0-9+/=]{8,512}/gi;
const URL_CREDENTIAL_PATTERN = /(\bhttps?:\/\/)[^/\s:@]{1,128}:[^@\s]{1,512}@/gi;
const QUOTED_SECRET_PATTERN =
  /\b(?:[A-Za-z][A-Za-z0-9]*[_-])?(_?auth(?:[_-]?token)?|_?password|_?secret|_?token|api[_-]?key|access[_-]?(?:key|token)|auth(?:[_-]?(?:key|token)|orization)?|client[_-]?secret|password|passwd|private[_-]?key|secret|token)\b(\s*[:=]\s*)(["'])[^"'\r\n]{1,2048}\3/gi;
const AUTH_VALUE_PATTERN =
  /\b(?:[A-Za-z][A-Za-z0-9]*[_-])?(?:_?auth(?:[_-]?token)?|authorization|auth|auth[_-]?key|auth[_-]?token|access[_-]?key|access[_-]?token)\b\s*[:=]\s*(?:Bearer|Basic)?\s*[^\r\n]{1,2048}/gi;
const KEY_VALUE_SECRET_PATTERN =
  /\b(?:[A-Za-z][A-Za-z0-9]*[_-])?(?:_?auth(?:[_-]?token)?|_?password|_?secret|_?token|api[_-]?key|access[_-]?(?:key|token)|auth(?:[_-]?(?:key|token)|orization)?|client[_-]?secret|password|passwd|private[_-]?key|secret|token)\b(\s*[:=]\s*)(["']?)([^\s"',;]{1,2048})\2/gi;
const ENV_SECRET_PATTERN =
  /\b(?:[A-Z][A-Z0-9]*_)?(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|AUTH(?:[_-]?TOKEN)?|ACCESS[_-]?(?:KEY|TOKEN)|PRIVATE[_-]?KEY)\b(\s*=\s*)([^\s,;]{1,2048})/g;
const QUERY_SECRET_PATTERN =
  /([?&](?:access_token|api[_-]?key|auth(?:orization)?|client[_-]?secret|password|passwd|secret|token)=)[^&\s]{1,2048}/gi;
const JSON_SECRET_PATTERN =
  /(["'])(?:[A-Za-z][A-Za-z0-9]*[_-])?(?:_?auth(?:[_-]?token)?|_?password|_?secret|_?token|api[_-]?key|access[_-]?(?:key|token)|auth(?:[_-]?(?:key|token)|orization)?|client[_-]?secret|password|passwd|private[_-]?key|secret|token)\1(\s*:\s*)(["'])[^"'\r\n]{1,2048}\3/gi;
const KNOWN_TOKEN_PATTERN =
  /\b(?:gh[pousr]_[A-Za-z0-9_-]{8,256}|npm_[A-Za-z0-9]{8,256}|xox[baprs]-[A-Za-z0-9-]{8,256}|sk-[A-Za-z0-9_-]{8,256}|AIza[0-9A-Za-z_-]{20,256}|AKIA[0-9A-Z]{16})\b/g;

/**
 * Removes terminal escape/control noise without changing ordinary evidence
 * characters. Tabs are kept for display; matching separately turns them into
 * spaces and collapses whitespace.
 */
export function stripAnsiAndControl(value: string): string {
  let result = "";
  let index = 0;

  while (index < value.length) {
    const code = value.charCodeAt(index);

    if (code === 0x1b) {
      const next = value.charCodeAt(index + 1);

      // CSI sequences end at the first final byte in the 0x40–0x7e range.
      if (next === 0x5b) {
        let cursor = index + 2;
        while (cursor < value.length) {
          const cursorCode = value.charCodeAt(cursor);
          cursor += 1;
          if (cursorCode >= 0x40 && cursorCode <= 0x7e) {
            break;
          }
        }
        index = cursor;
        continue;
      }

      // OSC sequences terminate with BEL or ST (ESC followed by backslash).
      if (next === 0x5d) {
        let cursor = index + 2;
        while (cursor < value.length) {
          const cursorCode = value.charCodeAt(cursor);
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
        continue;
      }

      // Other two-byte terminal escapes are noise for diagnostics.
      index += Math.min(2, value.length - index);
      continue;
    }

    // Keep tabs for readable evidence; remove other C0/C1 controls.
    if ((code <= 0x08) || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      index += 1;
      continue;
    }

    result += value[index];
    index += 1;
  }

  return result;
}

/**
 * Redacts common credential forms from a display-only copy of a log line.
 * Matching always happens before this function and never uses the redacted
 * value, so diagnostic line identity is not changed by secrecy protection.
 */
export function redactSensitiveText(value: string): RedactedText {
  let text = value;
  let redacted = false;

  const replace = (pattern: RegExp, replacement: string | ((substring: string) => string)): void => {
    const next = typeof replacement === "string"
      ? text.replace(pattern, replacement)
      : text.replace(pattern, (substring) => replacement(substring));
    if (next !== text) {
      redacted = true;
      text = next;
    }
  };

  replace(PRIVATE_KEY_BLOCK_PATTERN, (match) => `[REDACTED PRIVATE KEY]${match.match(/\r\n|\r|\n/g)?.join("") ?? ""}`);
  replace(PRIVATE_KEY_HEADER_PATTERN, "[REDACTED PRIVATE KEY]");
  replace(URL_CREDENTIAL_PATTERN, "$1[REDACTED CREDENTIAL]@");
  replace(BEARER_PATTERN, "Bearer [REDACTED TOKEN]");
  replace(BASIC_AUTH_PATTERN, "Basic [REDACTED CREDENTIAL]");
  replace(QUOTED_SECRET_PATTERN, "$1$2[REDACTED SECRET]");
  replace(JSON_SECRET_PATTERN, "$1secret$1$2$3[REDACTED SECRET]$3");
  replace(AUTH_VALUE_PATTERN, "[REDACTED AUTH]");
  replace(KEY_VALUE_SECRET_PATTERN, "$1[REDACTED SECRET]");
  replace(ENV_SECRET_PATTERN, "$1[REDACTED SECRET]");
  replace(QUERY_SECRET_PATTERN, "$1[REDACTED SECRET]");
  replace(KNOWN_TOKEN_PATTERN, "[REDACTED TOKEN]");

  return { text, redacted };
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
  const safeLimit = Number.isFinite(maxCharacters) && maxCharacters > 0
    ? Math.min(Math.floor(maxCharacters), 4096)
    : 512;
  // Only inspect a bounded prefix. Anything beyond this point cannot be shown
  // in evidence and should not be allowed to drive unbounded redaction work.
  const inspectionLimit = safeLimit + 2048;
  const withoutControl = stripAnsiAndControl(value.slice(0, inspectionLimit));
  const redactedValue = redactSensitiveText(withoutControl);
  const truncated = redactedValue.text.length > safeLimit;
  const truncationMarker = "… [truncated]";
  const text = truncated
    ? safeLimit <= truncationMarker.length
      ? truncationMarker.slice(0, safeLimit)
      : `${redactedValue.text.slice(0, safeLimit - truncationMarker.length)}${truncationMarker}`
    : redactedValue.text;

  return {
    text,
    redacted: redactedValue.redacted || truncated,
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
