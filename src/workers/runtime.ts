import { analyzeLog, redactSensitiveLog, sanitizeEvidenceLine } from "../analyzer";
import { compareAnalysisResults } from "../verification";
import { getUtf8ByteLength, inspectLogText } from "../lib/validation";
import {
  MAX_VIEWER_COPY_BYTES, VIEWER_PAGE_SIZE, compactInspection, isWorkerRequest,
  type ViewerLine, type ViewerSummary, type WorkerRequest, type WorkerResponse,
} from "./protocol";

/** One runtime per worker/client. Raw input is never retained after a request. */
export function createTaskRuntime() {
  let viewer: { lines: readonly ViewerLine[]; summary: ViewerSummary } | undefined;
  return (value: unknown): WorkerResponse => {
    if (!isWorkerRequest(value)) return { version: 1, id: 0, ok: false, code: "invalid-request" };
    const request: WorkerRequest = value;
    try {
      let result: WorkerResponse & { ok: true };
      const success = (output: (WorkerResponse & { ok: true })["result"]): WorkerResponse & { ok: true } => ({ version: 1, id: request.id, ok: true, result: output });
      switch (request.kind) {
        case "analyze":
          result = success(analyzeLog(request.input, { timestampFactory: () => new Date().toISOString() }));
          break;
        case "compare": {
          const options = { timestampFactory: () => new Date().toISOString() };
          const baseline = analyzeLog({ text: request.input.baseline, source: "paste" }, options);
          const rerun = analyzeLog({ text: request.input.rerun, source: "paste" }, options);
          result = success(compareAnalysisResults(baseline, rerun));
          break;
        }
        case "inspect":
          result = success(compactInspection(inspectLogText(request.input.text)));
          break;
        case "viewer-prepare": {
          const inspection = inspectLogText(request.input.text);
          if (!inspection.validation.valid) return { version: 1, id: request.id, ok: false, code: "invalid-request" };
          // Whole-log redaction must precede splitting: private keys span lines.
          const safeLog = redactSensitiveLog(request.input.text.replace(/\r\n?/g, "\n")).text;
          let truncated = false;
          const lines = safeLog.split("\n").map((line, index) => {
            const safe = sanitizeEvidenceLine(line, 4096).text;
            if (safe.endsWith("… [truncated]")) truncated = true;
            return { lineNumber: index + 1, text: safe };
          });
          viewer = { lines, summary: { lineCount: lines.length, inputBytes: inspection.byteCount, truncated } };
          result = success(viewer.summary);
          break;
        }
        case "viewer-page": {
          if (!viewer) return { version: 1, id: request.id, ok: false, code: "invalid-request" };
          const query = request.input.query.trim().toLowerCase();
          const matching = viewer.lines.filter((line) => (!query || line.text.toLowerCase().includes(query)) && (request.input.mode === "all" || /error|failed|TS\d+|npm error/i.test(line.text)));
          const pageCount = Math.max(1, Math.ceil(matching.length / VIEWER_PAGE_SIZE));
          const page = Math.min(request.input.page, pageCount - 1);
          result = success({ ...viewer.summary, page, pageCount, matchingCount: matching.length, lines: matching.slice(page * VIEWER_PAGE_SIZE, (page + 1) * VIEWER_PAGE_SIZE) });
          break;
        }
        case "viewer-copy": {
          if (!viewer) return { version: 1, id: request.id, ok: false, code: "invalid-request" };
          const parts: string[] = [];
          let bytes = 0;
          for (const line of viewer.lines) {
            const size = getUtf8ByteLength(line.text) + (parts.length ? 1 : 0);
            if (bytes + size > MAX_VIEWER_COPY_BYTES) break;
            parts.push(line.text);
            bytes += size;
          }
          result = success({ text: parts.join("\n"), truncated: viewer.summary.truncated || parts.length < viewer.lines.length });
          break;
        }
      }
      return result;
    } catch {
      // Error objects may contain log text. Only fixed, public codes cross back.
      return { version: 1, id: request.id, ok: false, code: "failed" };
    }
  };
}
