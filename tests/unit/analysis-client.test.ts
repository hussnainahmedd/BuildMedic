// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalTaskClient, SMALL_INPUT_FALLBACK_BYTES } from "../../src/lib/analysis-client";
import { createTaskRuntime } from "../../src/workers/runtime";
import { createWorkerRequest, type WorkerRequest } from "../../src/workers/protocol";

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  requests: WorkerRequest[] = [];
  terminate = vi.fn();
  constructor(readonly url: URL, readonly options: WorkerOptions) { ControlledWorker.instances.push(this); }
  postMessage(request: WorkerRequest) { this.requests.push(request); }
  respond(value: unknown) { this.onmessage?.({ data: value } as MessageEvent<unknown>); }
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); ControlledWorker.instances = []; });

describe("bounded local worker transport", () => {
  it("uses a Vite module worker and the existing analyzer/compare runtime", async () => {
    vi.stubGlobal("Worker", ControlledWorker);
    const client = new LocalTaskClient();
    const pending = client.request("analyze", { text: "error TS2322: incompatible types", source: "paste" });
    const worker = ControlledWorker.instances[0]!;
    expect(worker.url.pathname).toMatch(/analysis\.worker\.ts$/);
    expect(worker.options).toEqual({ type: "module" });
    const run = createTaskRuntime();
    worker.respond(run(worker.requests[0]));
    expect((await pending).status).toBe("complete");
    const comparison = client.request("compare", { baseline: "error TS2322", rerun: "error TS2339" });
    worker.respond(run(worker.requests[1]));
    expect(await comparison).toMatchObject({ status: "compared", outcome: "changed" });
    client.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates active work on abort and ignores a late result", async () => {
    vi.stubGlobal("Worker", ControlledWorker);
    const client = new LocalTaskClient();
    const controller = new AbortController();
    const first = client.request("analyze", { text: "error TS2322", source: "paste" }, { signal: controller.signal });
    const rejection = expect(first).rejects.toMatchObject({ code: "aborted" });
    const worker = ControlledWorker.instances[0]!;
    controller.abort();
    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const second = client.request("analyze", { text: "custom unsupported text", source: "paste" });
    worker.respond(createTaskRuntime()(worker.requests[0]));
    const retryWorker = ControlledWorker.instances[1]!;
    retryWorker.respond(createTaskRuntime()(retryWorker.requests[0]));
    expect((await second).status).toBe("no-match");
    client.dispose();
  });

  it("has a finite timeout, bounded pending requests, and fixed safe failures", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", ControlledWorker);
    const client = new LocalTaskClient();
    const one = client.request("inspect", { text: "first" }, { timeoutMs: 10 });
    const two = client.request("inspect", { text: "second" });
    const oneCheck = expect(one).rejects.toMatchObject({ code: "timeout" });
    const twoCheck = expect(two).rejects.toMatchObject({ code: "timeout" });
    await expect(client.request("inspect", { text: "third" })).rejects.toMatchObject({ code: "busy" });
    await vi.advanceTimersByTimeAsync(10);
    await Promise.all([oneCheck, twoCheck]);
    expect(ControlledWorker.instances[0]!.terminate).toHaveBeenCalledOnce();
    const retry = client.request("inspect", { text: "retry" });
    ControlledWorker.instances[1]!.respond({ version: 1, id: 3, ok: false, code: "failed", message: "token=PRIVATE-ERROR" });
    await expect(retry).rejects.toMatchObject({ message: "Local processing could not complete. Your input is still available; try again." });
    client.dispose();
  });

  it("validates requests before cloning and rejects malformed responses", async () => {
    vi.stubGlobal("Worker", ControlledWorker);
    const client = new LocalTaskClient();
    await expect(client.request("analyze", { text: 123, source: "paste" } as never)).rejects.toMatchObject({ code: "invalid-request" });
    await expect(client.request("viewer-page", { query: "x", mode: "all", page: Infinity })).rejects.toMatchObject({ code: "invalid-request" });
    expect(ControlledWorker.instances).toHaveLength(0);
    const pending = client.request("analyze", { text: "error TS2322", source: "paste" });
    const worker = ControlledWorker.instances[0]!;
    worker.respond({ version: 1, id: worker.requests[0]!.id, ok: true, result: { status: "complete", findings: [] } });
    await expect(pending).rejects.toMatchObject({ code: "failed" });
    client.dispose();
    const whitelisted = createWorkerRequest(1, "analyze", { text: "safe", source: "paste", extra: "private" } as never);
    expect(whitelisted.input).not.toHaveProperty("extra");
  });

  it("supports only bounded small-input fallback, including both comparison inputs", async () => {
    vi.stubGlobal("Worker", undefined);
    const client = new LocalTaskClient();
    expect((await client.request("analyze", { text: "error TS2322", source: "paste" })).status).toBe("complete");
    expect((await client.request("compare", { baseline: "custom unsupported log", rerun: "another unsupported log" })).status).toBe("no-match");
    await expect(client.request("analyze", { text: "x".repeat(SMALL_INPUT_FALLBACK_BYTES + 1), source: "paste" })).rejects.toMatchObject({ code: "unavailable" });
    await expect(client.request("compare", { baseline: "x".repeat(40_000), rerun: "y".repeat(40_000) })).rejects.toMatchObject({ code: "unavailable" });
    client.dispose();
  });
});
