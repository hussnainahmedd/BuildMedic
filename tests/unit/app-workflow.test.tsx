import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";
import { HISTORY_STORAGE_KEY } from "../../src/lib/history";
import { createTaskRuntime } from "../../src/workers/runtime";
import type { WorkerRequest } from "../../src/workers/protocol";

const LOG = "$ npm run build\nsrc/example.ts:4:9 - error TS2322: incompatible types\ntoken=workflow-private-fixture";
const RERUN = "src/example.ts:4:9 - error TS2339: property does not exist";

class PausedWorker {
  static instances: PausedWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  request: WorkerRequest | undefined;
  private run = createTaskRuntime();
  constructor() { PausedWorker.instances.push(this); }
  postMessage(request: WorkerRequest) { this.request = request; }
  finish() { if (this.request) this.onmessage?.({ data: this.run(this.request) } as MessageEvent<unknown>); }
  fail() { this.onerror?.({ preventDefault: vi.fn(), message: "token=private-error" } as unknown as ErrorEvent); }
}

function nav(name: string) {
  fireEvent.click(within(screen.getByRole("navigation", { name: "Workspace navigation" })).getByRole("link", { name: new RegExp(`^${name}`) }));
}
async function pasteAndAnalyze(log = LOG) {
  fireEvent.change(screen.getByRole("textbox", { name: "Build log" }), { target: { value: log } });
  fireEvent.click(screen.getByRole("button", { name: "Analyze log" }));
  await screen.findByRole("heading", { name: "Here is what the build is saying." });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/app/new-analysis");
  window.localStorage.clear();
  vi.stubGlobal("Worker", undefined);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); PausedWorker.instances = []; });

describe("actual application workflows", () => {
  it("pastes, analyzes, compares, exports a real report, reopens history, and clears all session input", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    render(<App />);
    await pasteAndAnalyze();
    expect(screen.getAllByText(/TS2322/).length).toBeGreaterThan(0);
    nav("Verification");
    expect(screen.getByRole("textbox", { name: "Original build log" })).toHaveValue(LOG);
    fireEvent.change(screen.getByRole("textbox", { name: "Rerun build log" }), { target: { value: RERUN } });
    fireEvent.click(screen.getAllByRole("button", { name: "Compare findings" })[0]!);
    await screen.findByText("The diagnostic set changed between runs.");
    expect(screen.getByText("resolved")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Rerun build log" }), { target: { value: "changed unrecognized input" } });
    expect(screen.queryByText("The diagnostic set changed between runs.")).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for a rerun")).toBeInTheDocument();
    nav("Reports");
    fireEvent.click(screen.getByRole("button", { name: "Copy report" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]![0]).toContain("No build was executed.");
    expect(writeText.mock.calls[0]![0]).toContain("TS2322");
    expect(writeText.mock.calls[0]![0]).not.toContain("workflow-private-fixture");
    expect(window.localStorage.getItem(HISTORY_STORAGE_KEY)).not.toContain("workflow-private-fixture");
    nav("History");
    fireEvent.click(screen.getByRole("button", { name: /^Pasted build log/ }));
    await screen.findByRole("heading", { name: "Here is what the build is saying." });
    nav("History");
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
    nav("New analysis");
    expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue("");
    nav("Verification");
    expect(screen.getByRole("textbox", { name: "Original build log" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Rerun build log" })).toHaveValue("");
  });

  it("cancels a running worker, keeps input editable, ignores late completion, and retries", async () => {
    vi.stubGlobal("Worker", PausedWorker);
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Build log" }), { target: { value: LOG } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze log" }));
    const first = PausedWorker.instances[0]!;
    expect(first.request?.kind).toBe("analyze");
    expect(screen.getByRole("textbox", { name: "Build log" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(first.terminate).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Build log" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue(LOG);
    expect(screen.getByRole("alert")).toHaveTextContent("Analysis canceled");
    await act(async () => first.finish());
    expect(window.location.pathname).toBe("/app/new-analysis");
    expect(window.localStorage.getItem(HISTORY_STORAGE_KEY)).toBe("[]");
    fireEvent.click(screen.getByRole("button", { name: "Analyze log" }));
    await act(async () => PausedWorker.instances[1]!.finish());
    await screen.findByRole("heading", { name: "Here is what the build is saying." });
    expect(screen.getAllByText(/TS2322/).length).toBeGreaterThan(0);
  });

  it("shows safe visible comparison failures and cancel/retry without losing either input", async () => {
    render(<App />);
    await pasteAndAnalyze();
    nav("Verification");
    vi.stubGlobal("Worker", PausedWorker);
    fireEvent.change(screen.getByRole("textbox", { name: "Rerun build log" }), { target: { value: RERUN } });
    fireEvent.click(screen.getAllByRole("button", { name: "Compare findings" })[0]!);
    await act(async () => PausedWorker.instances[0]!.fail());
    expect(screen.getByRole("alert")).toHaveTextContent("Local processing could not complete");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private-error");
    fireEvent.click(screen.getAllByRole("button", { name: "Compare findings" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Cancel comparison" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Comparison canceled");
    expect(screen.getByRole("textbox", { name: "Original build log" })).toHaveValue(LOG);
    expect(screen.getByRole("textbox", { name: "Rerun build log" })).toHaveValue(RERUN);
    expect(screen.getByRole("textbox", { name: "Rerun build log" })).toBeEnabled();
    await act(async () => PausedWorker.instances[1]!.finish());
    expect(screen.queryByText("The diagnostic set changed between runs.")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Compare findings" })[0]!);
    await act(async () => PausedWorker.instances[2]!.finish());
    expect(await screen.findByText("The diagnostic set changed between runs.")).toBeInTheDocument();
  });

  it("clearing active input evicts raw reopen records while retaining only safe history metadata", async () => {
    render(<App />);
    await pasteAndAnalyze();
    nav("New analysis");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    nav("History");
    fireEvent.click(screen.getByRole("button", { name: /^Pasted build log/ }));
    expect(window.location.pathname).toBe("/app/history");
    expect(screen.getByText(/Only metadata for this analysis is available/)).toBeInTheDocument();
  });

  it("invalidates edited results and applies accessible density/line/context preferences", async () => {
    render(<App />);
    await pasteAndAnalyze();
    nav("Settings");
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(screen.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.density).toBe("compact");
    fireEvent.click(screen.getByRole("checkbox", { name: /Show line numbers/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Show evidence context/ }));
    nav("Log viewer");
    await screen.findByText(/src\/example.ts:4:9/);
    expect(document.querySelector(".log-line-number")).toBeNull();
    nav("New analysis");
    fireEvent.change(screen.getByRole("textbox", { name: "Build log" }), { target: { value: "a changed draft that has not been analyzed" } });
    nav("Reports");
    expect(screen.getByRole("heading", { name: "No analysis available" })).toBeInTheDocument();
    expect(screen.queryByText("Paste a build log to analyze.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /TS2322/ })).not.toBeInTheDocument();
  });

  it("asks to reduce large input when background workers are unavailable", async () => {
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Build log" }), { target: { value: `${"a".repeat(1000)}\n`.repeat(70) } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Reduce the input to 64 KiB or less");
    expect(screen.getByRole("textbox", { name: "Build log" })).toBeEnabled();
    expect(window.location.pathname).toBe("/app/new-analysis");
  });

  it("handles no-match analysis/comparison and blocked storage in the running app", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
    render(<App />);
    await pasteAndAnalyze("custom unrecognized diagnostic");
    expect(screen.getByText("No supported diagnostic matched")).toBeInTheDocument();
    nav("Verification");
    fireEvent.change(screen.getByRole("textbox", { name: "Rerun build log" }), { target: { value: "custom rerun without supported diagnostic" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Compare findings" })[0]!);
    expect(await screen.findByText("No supported diagnostic to compare")).toBeInTheDocument();
    expect(screen.getByText(/No build outcome inferred/)).toBeInTheDocument();
  });
});
