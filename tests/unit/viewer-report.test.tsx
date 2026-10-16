import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeLog } from "../../src/analyzer";
import { LocalTaskClient } from "../../src/lib/analysis-client";
import { buildAnalysisReport, NO_BUILD_DISCLAIMER, REPORT_FILE_NAME } from "../../src/lib/report";
import { LogViewerPage, NewAnalysisPage, ReportsPage, type WorkspacePageProps } from "../../src/pages/workspace";
import { DEFAULT_USER_PREFERENCES } from "../../src/types/preferences";

function props(overrides: Partial<WorkspacePageProps> = {}): WorkspacePageProps {
  return { analysis: analyzeLog(""), analysisError: null, currentLog: "", history: [], isAnalyzing: false, isVerifying: false, verification: null,
    preferences: DEFAULT_USER_PREFERENCES, theme: "system", onAnalyze: vi.fn(), onClearActive: vi.fn(), onCompareVerification: vi.fn(),
    onNavigate: vi.fn(), onNotify: vi.fn(), onOpenHistory: vi.fn(), onPatchPreferences: vi.fn(), onSetTheme: vi.fn(), ...overrides };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("sanitized bounded viewer", () => {
  it("redacts whole multiline secrets, preserves exact CRLF positions, and renders HTML as text", async () => {
    vi.stubGlobal("Worker", undefined);
    const log = ["first", "-----BEGIN RSA PRIVATE KEY-----", "PRIVATE-MULTILINE-FIXTURE", "second-private-line", "-----END RSA PRIVATE KEY-----", '<img src=x onerror="alert(1)"> error TS2322', "last"].join("\r\n");
    const request = vi.spyOn(LocalTaskClient.prototype, "request");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    render(<LogViewerPage {...props({ currentLog: log, analysis: analyzeLog(log) })} />);
    await screen.findByText('<img src=x onerror="alert(1)"> error TS2322');
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.textContent).not.toContain("PRIVATE-MULTILINE-FIXTURE");
    expect(document.body.textContent).not.toContain("second-private-line");
    expect(screen.getByText("06")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search log" }), { target: { value: "TS2322" } });
    await waitFor(() => expect(document.querySelectorAll(".log-code-line")).toHaveLength(1));
    expect(screen.getByText("06")).toBeInTheDocument();
    expect(request.mock.calls.filter(([kind]) => kind === "viewer-prepare")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Copy sanitized log" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toContain("REDACTED PRIVATE KEY");
    expect(copied.split("\n")).toHaveLength(7);
    expect(copied).not.toContain("PRIVATE-MULTILINE-FIXTURE");
  });

  it("renders at most 200 lines, honors line-number preferences, and exposes filter state", async () => {
    vi.stubGlobal("Worker", undefined);
    const log = Array.from({ length: 205 }, (_, index) => `${index === 204 ? "error " : ""}source line ${index + 1}`).join("\n");
    render(<LogViewerPage {...props({ currentLog: log, preferences: { ...DEFAULT_USER_PREFERENCES, showLineNumbers: false } })} />);
    await screen.findByText("source line 1");
    expect(document.querySelectorAll(".log-code-line")).toHaveLength(200);
    expect(document.querySelector(".log-line-number")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("source line 201");
    expect(document.querySelectorAll(".log-code-line")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Errors only" }));
    await waitFor(() => expect(document.querySelectorAll(".log-code-line")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Errors only" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("error source line 205")).toBeInTheDocument();
  });

  it("labels truncated sanitized copies and reports clipboard denial honestly", async () => {
    vi.stubGlobal("Worker", undefined);
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    const onNotify = vi.fn();
    render(<LogViewerPage {...props({ currentLog: "x".repeat(5000), onNotify })} />);
    await screen.findByText(/long lines truncated/);
    fireEvent.click(screen.getByRole("button", { name: "Copy sanitized log" }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("Could not copy the sanitized log. Check clipboard permissions and try again."));
    expect(writeText.mock.calls[0]![0]).toContain("Sanitized copy truncated");
  });
});

describe("complete safe reports", () => {
  it("includes all bounded findings, omission warnings, redaction notice, and mandatory disclaimer", () => {
    const log = "token=raw-secret\nerror TS2322: mismatch\nerror TS2339: missing property";
    const analysis = analyzeLog(log);
    expect(analysis.status).toBe("complete");
    const report = buildAnalysisReport(analysis, true);
    for (const finding of analysis.findings) expect(report).toContain(finding.title);
    expect(report).toContain(NO_BUILD_DISCLAIMER);
    expect(report).toContain("Redaction notice:");
    expect(report).not.toContain("raw-secret");
    const partial = analyzeLog(log, { maxFindings: 1 });
    expect(buildAnalysisReport(partial, true)).toContain("PARTIAL / OMISSION WARNING");
    expect(buildAnalysisReport(partial, true)).toContain("Omitted findings: 1");
  });

  it("sanitizes every log-derived report field and filename and avoids a misleading initial required error", () => {
    const analysis = analyzeLog("error TS2322");
    if (analysis.status !== "complete") throw new Error("fixture must match");
    const contaminated = { ...analysis, input: { ...analysis.input, fileName: "token=private-file.log" }, findings: analysis.findings.map((finding) => ({ ...finding,
      title: "token=private-title", explanation: "token=private-explanation", verificationHint: "token=private-guidance",
      suggestedActions: [{ id: "a", label: "token=private-label", description: "token=private-action", verificationCondition: "token=private-condition" }],
    })) };
    const text = buildAnalysisReport(contaminated, true);
    expect(text).not.toMatch(/private-(?:file|title|explanation|guidance|label|action|condition)/);
    const { rerender } = render(<ReportsPage {...props()} />);
    expect(screen.queryByText("Paste a build log to analyze.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No analysis available" })).toBeInTheDocument();
    rerender(<ReportsPage {...props({ analysis: contaminated, currentLog: "error TS2322", currentFileName: "token=private-file.log" })} />);
    expect(document.body.textContent).not.toContain("private-file");
    expect(document.body.textContent).not.toContain("private-title");
  });

  it("downloads fixed plain text and defers URL cleanup; clipboard errors do not claim success", async () => {
    const onNotify = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue("blob:report-fixture");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { expect(this.download).toBe(REPORT_FILE_NAME); });
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } }));
    render(<ReportsPage {...props({ analysis: analyzeLog("error TS2322"), currentLog: "error TS2322", onNotify })} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy report" }));
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith("Could not copy the report. Check clipboard permissions and try again."));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Download text" }));
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]![0].type).toBe("text/plain;charset=utf-8");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report-fixture");
  });
});

describe("file read lifecycle", () => {
  it("uses shared MIME policy, accepts a safe empty-MIME extension, and still validates its contents", async () => {
    render(<NewAnalysisPage {...props()} />);
    const input = screen.getByLabelText(/Choose a file/);
    fireEvent.change(input, { target: { files: [new File(["error TS2322"], "export.log", { type: "" })] } });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue("error TS2322"));
    fireEvent.change(input, { target: { files: [new File(["looks textual"], "binary.log", { type: "application/octet-stream" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a readable text log file.");
    fireEvent.change(input, { target: { files: [new File(["\u0000binary"], "bad.log", { type: "" })] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/binary or unreadable/));
  });

  it("rejects binary text after reading and exposes accessible file errors", async () => {
    render(<NewAnalysisPage {...props()} />);
    fireEvent.change(screen.getByLabelText(/Choose a file/), { target: { files: [new File(["error\u0000binary"], "build.txt", { type: "text/plain" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/binary or unreadable/);
    expect(screen.getByLabelText(/Choose a file/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue("");
  });

  it("aborts replacement/clear/unmount reads and ignores stale callbacks", () => {
    class Reader {
      static instances: Reader[] = [];
      readyState = 1;
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      abort = vi.fn(() => { this.readyState = 2; });
      readAsText = vi.fn();
      constructor() { Reader.instances.push(this); }
    }
    vi.stubGlobal("FileReader", Reader);
    const { unmount } = render(<NewAnalysisPage {...props()} />);
    const input = screen.getByLabelText(/Choose a file/);
    fireEvent.change(input, { target: { files: [new File(["old"], "old.log", { type: "text/plain" })] } });
    const old = Reader.instances[0]!;
    fireEvent.change(input, { target: { files: [new File(["new"], "new.log", { type: "text/plain" })] } });
    expect(old.abort).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(Reader.instances[1]!.abort).toHaveBeenCalledOnce();
    old.result = "error TS2322 stale secret";
    old.onload?.();
    expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue("");
    fireEvent.change(input, { target: { files: [new File(["third"], "third.log", { type: "text/plain" })] } });
    unmount();
    expect(Reader.instances[2]!.abort).toHaveBeenCalledOnce();
  });
});
