import { getUtf8ByteLength } from "./validation";
import { createWorkerRequest, isTaskOutput, type TaskInputs, type TaskKind, type TaskOutputs, type WorkerRequest, type WorkerResponse } from "../workers/protocol";

export const SMALL_INPUT_FALLBACK_BYTES = 64 * 1024;
export const LOCAL_TASK_TIMEOUT_MS = 30_000;
export const MAX_LOCAL_PENDING_TASKS = 2;

const ERROR_MESSAGES = {
  aborted: "Local processing canceled. Your input is still available to edit or retry.",
  timeout: "Local processing timed out. Reduce the log and try again.",
  unavailable: "Background processing is unavailable in this browser. Reduce the input to 64 KiB or less, or use a browser with Web Worker support.",
  "invalid-request": "The local input is invalid or exceeds the supported limits. Review the input and try again.",
  busy: "Local processing is busy. Wait for the current request or cancel it before retrying.",
  failed: "Local processing could not complete. Your input is still available; try again.",
} as const;
export class LocalTaskError extends Error {
  readonly code: keyof typeof ERROR_MESSAGES;
  constructor(code: keyof typeof ERROR_MESSAGES) {
    super(ERROR_MESSAGES[code]);
    this.name = "LocalTaskError";
    this.code = code;
  }
}
export function localTaskMessage(error: unknown): string {
  return error instanceof LocalTaskError ? error.message : ERROR_MESSAGES.failed;
}
export function isLocalTaskAbort(error: unknown): boolean {
  return error instanceof LocalTaskError && error.code === "aborted";
}

interface Pending {
  readonly kind: TaskKind;
  readonly resolve: (result: TaskOutputs[TaskKind]) => void;
  readonly reject: (error: LocalTaskError) => void;
  readonly cleanup: () => void;
}
export interface LocalTaskOptions { readonly signal?: AbortSignal; readonly timeoutMs?: number }

/** Bounded, local-only module-worker RPC. Abort/timeout destroys active work. */
export class LocalTaskClient {
  private worker: Worker | undefined;
  private runtime: ((request: WorkerRequest) => WorkerResponse) | undefined;
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private disposed = false;
  private fallbackInputBytes = 0;

  request<K extends TaskKind>(kind: K, input: TaskInputs[K], options: LocalTaskOptions = {}): Promise<TaskOutputs[K]> {
    if (this.disposed || options.signal?.aborted) return Promise.reject(new LocalTaskError("aborted"));
    if (this.pending.size >= MAX_LOCAL_PENDING_TASKS) return Promise.reject(new LocalTaskError("busy"));
    let request: WorkerRequest;
    try { request = createWorkerRequest(++this.nextId, kind, input); }
    catch { return Promise.reject(new LocalTaskError("invalid-request")); }
    const timeout = options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs)
      ? Math.max(1, Math.min(LOCAL_TASK_TIMEOUT_MS, Math.floor(options.timeoutMs))) : LOCAL_TASK_TIMEOUT_MS;

    return new Promise<TaskOutputs[K]>((resolve, reject) => {
      const fallback = { timer: undefined as ReturnType<typeof setTimeout> | undefined };
      const onAbort = () => this.stop("aborted");
      const timer = setTimeout(() => this.stop("timeout"), timeout);
      const cleanup = () => {
        clearTimeout(timer);
        if (fallback.timer !== undefined) clearTimeout(fallback.timer);
        options.signal?.removeEventListener("abort", onAbort);
      };
      this.pending.set(request.id, { kind, resolve: (result) => resolve(result as TaskOutputs[K]), reject, cleanup });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (!this.worker && typeof Worker !== "undefined") {
        try {
          // Static Vite-recognized construction is required for production bundling.
          this.worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), { type: "module" });
          this.worker.onmessage = (event: MessageEvent<unknown>) => this.receive(event.data);
          this.worker.onerror = (event) => { event.preventDefault(); this.stop("failed"); };
          this.worker.onmessageerror = () => this.stop("failed");
        } catch {
          this.worker = undefined;
        }
      }
      if (this.worker) {
        try { this.worker.postMessage(request); }
        catch { this.stop("failed"); }
        return;
      }
      const texts = request.kind === "compare" ? [request.input.baseline, request.input.rerun]
        : request.kind === "analyze" || request.kind === "inspect" || request.kind === "viewer-prepare" ? [request.input.text] : [];
      if (texts.some((text) => text.length > SMALL_INPUT_FALLBACK_BYTES)
        || texts.reduce((total, text) => total + getUtf8ByteLength(text), 0) > SMALL_INPUT_FALLBACK_BYTES
        || (!texts.length && this.fallbackInputBytes > SMALL_INPUT_FALLBACK_BYTES)) {
        this.finish(request.id, new LocalTaskError("unavailable"));
        return;
      }
      if (request.kind === "viewer-prepare") this.fallbackInputBytes = getUtf8ByteLength(request.input.text);
      // Yield before the deliberately small fallback. Large inputs never run here.
      fallback.timer = setTimeout(() => {
        void import("../workers/runtime").then(({ createTaskRuntime }) => {
          if (!this.pending.has(request.id) || this.disposed) return;
          this.runtime ??= createTaskRuntime();
          this.receive(this.runtime(request));
        }).catch(() => this.stop("failed"));
      }, 0);
    });
  }

  private receive(value: unknown) {
    if (typeof value !== "object" || value === null) { this.stop("failed"); return; }
    const response = value as Partial<WorkerResponse>;
    if (response.version !== 1 || typeof response.id !== "number") { this.stop("failed"); return; }
    // A stale/canceled response can never complete a different request.
    if (!this.pending.has(response.id)) return;
    if (response.ok === true && "result" in response && isTaskOutput(this.pending.get(response.id)!.kind, response.result)) this.finish(response.id, undefined, response.result);
    else this.finish(response.id, new LocalTaskError(response.ok === false && response.code === "invalid-request" ? "invalid-request" : "failed"));
  }

  private finish(id: number, error?: LocalTaskError, result?: TaskOutputs[TaskKind]) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    pending.cleanup();
    if (error) pending.reject(error);
    else pending.resolve(result as TaskOutputs[TaskKind]);
  }

  private stop(code: "aborted" | "timeout" | "failed") {
    this.worker?.terminate();
    this.worker = undefined;
    this.runtime = undefined;
    for (const id of [...this.pending.keys()]) this.finish(id, new LocalTaskError(code));
  }

  dispose() { this.disposed = true; this.stop("aborted"); }
}
