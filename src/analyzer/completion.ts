import { sanitizeEvidenceLine, stripAnsiAndControl } from "./normalize";

function outcomeLine(value: string): string {
  return stripAnsiAndControl(value).trim()
    .replace(/^\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]?\s*/, "");
}

/** Narrow end-of-command spellings, not prose containing completion words. */
export function isExplicitCompletionLine(value: string): boolean {
  const line = outcomeLine(value);
  return /^(?:[✓✔]\s*)?(?:the\s+)?(?:build|compile|compilation|bundle|bundling|test suite|tests?)\s+(?:complete|completed|succeeded|passed|finished)(?:\s+successfully)?[.!]?$/i.test(line) ||
    /^(?:webpack(?:\s+\d[\w.+-]*)?\s+compiled|(?:vite|tsc)\s+(?:compiled|built))\s+successfully(?:\s+in\s+\d+(?:\.\d+)?\s*(?:ms|s|seconds?))?[.!]?$/i.test(line) ||
    /^[✓✔]\s+built\s+in\s+\d+(?:\.\d+)?\s*(?:ms|s|seconds?)[.!]?$/i.test(line) ||
    /^(?:(?:process|command|build)\s+)?(?:exited\s+with\s+(?:code|status)|exit\s+(?:code|status))\s*[:=]?\s*0[.!]?$/i.test(line);
}

function invalidatesCompletion(value: string): boolean {
  const line = outcomeLine(value);
  return /\b(?:build|compile|compilation|bundle|bundling|tests?|test suite)\b[^\n]{0,160}\b(?:not|never|incomplete|failed|failure|errors?|cancelled|canceled|aborted|pending|running|started|starting|watching)\b/i.test(line) ||
    /^(?:(?:npm|pnpm|yarn|gyp)\s+)?(?:error\b|ERR!|fatal\b|failed\b)/i.test(line) ||
    /^(?:FAIL|FAILED|FAILURE)\b/i.test(line) || /^\s*(?:tests?|test suites?)\s*:\s*\d+\s+failed\b/i.test(line) ||
    /\b(?:error|warning)\s+TS\d{3,5}\b/i.test(line) ||
    /^(?:(?:process|command|build)\s+)?(?:exited\s+with\s+(?:code|status)|exit\s+(?:code|status))\s*[:=]?\s*[1-9]\d*\b/i.test(line);
}

/** Prefer the final relevant outcome; markers remain log evidence, never executed checks. */
export function findBuildCompletion(lines: readonly string[]): { readonly lineNumber: number; readonly text: string } | undefined {
  let completion: { readonly lineNumber: number; readonly text: string } | undefined;
  let inLiteral = false;
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const backticks = line.match(/(?<!\\)`/g)?.length ?? 0;
    if (inLiteral || (backticks > 0 && /\b(?:const|let|var|export|return|test|it|describe)\b/.test(line))) {
      if (backticks % 2 === 1) inLiteral = !inLiteral;
      continue;
    }
    if (isExplicitCompletionLine(line)) {
      completion = { lineNumber: index + 1, text: sanitizeEvidenceLine(line, 512).text };
    } else if (invalidatesCompletion(line)) {
      completion = undefined;
    }
  }
  return completion;
}
