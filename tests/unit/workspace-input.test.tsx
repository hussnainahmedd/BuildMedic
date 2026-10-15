import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeLog } from "../../src/analyzer";
import { compareAnalysisResults } from "../../src/verification";
import {
  AnalysisPage,
  HistoryPage,
  LogViewerPage,
  NewAnalysisPage,
  ReportsPage,
  VerificationPage,
  type WorkspacePageProps,
} from "../../src/pages/workspace";
import { DEMO_NODE_BUILD_LOG } from "../../src/data";
import { DEFAULT_USER_PREFERENCES } from "../../src/types/preferences";
import type { AnalysisHistoryEntry, AnalysisResult } from "../../src/types";

const DIAGNOSTIC_LOG = [
  "$ npm run build",
  "src/report.ts:4:9 - error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
  "4 return formatLabel(config.label);",
].join("\n");
const UNKNOWN_LOG = "custom tool emitted an unrecognized diagnostic\nno supported rules here";

function makeProps(overrides: Partial<WorkspacePageProps> = {}): WorkspacePageProps {
  return {
    analysis: analyzeLog(""),
    analysisError: null,
    currentFileName: undefined,
    currentLog: "",
    history: [],
    isAnalyzing: false,
    isVerifying: false,
    onAnalyze: vi.fn(),
    onClearActive: vi.fn(),
    onCompareVerification: vi.fn(),
    onNavigate: vi.fn(),
    onNotify: vi.fn(),
    onOpenHistory: vi.fn(),
    onPatchPreferences: vi.fn(),
    onSetTheme: vi.fn(),
    preferences: DEFAULT_USER_PREFERENCES,
    theme: DEFAULT_USER_PREFERENCES.theme,
    verification: null,
    ...overrides,
  };
}

function historyEntry(result: AnalysisResult): AnalysisHistoryEntry {
  return {
    id: `history-${result.id}`,
    analysisId: result.id,
    label: "current-build.log",
    createdAt: result.analyzedAt,
    source: "file",
    status: result.status,
    inputBytes: result.input.byteCount,
    findingCount: result.status === "complete" ? result.findings.length : 0,
    summary: result.status === "complete" ? `${result.findings.length} finding` : result.status === "no-match" ? result.message : result.error.message,
  };
}

describe("live workspace frontend flow", () => {
  afterEach(() => cleanup());

  it("starts blank, honors the default input mode, and labels an explicitly loaded example", () => {
    render(<NewAnalysisPage {...makeProps({ preferences: { ...DEFAULT_USER_PREFERENCES, defaultInputMode: "file" } })} />);

    expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue("");
    expect(screen.getByRole("tab", { name: "Upload file" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Load example input" }));

    expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue(DEMO_NODE_BUILD_LOG.text);
    expect(screen.getByText("Example input")).toBeInTheDocument();
  });

  it("shows inline validation and does not submit blank input", () => {
    const onAnalyze = vi.fn();
    const onNotify = vi.fn();
    render(<NewAnalysisPage {...makeProps({ onAnalyze, onNotify })} />);

    fireEvent.click(screen.getByRole("button", { name: "Analyze log" }));

    expect(onAnalyze).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Paste a build log to analyze.");
    expect(onNotify).toHaveBeenCalledWith("Paste a build log to analyze.");
  });

  it("reads a validated dropped file into the real input", async () => {
    const file = new File([DIAGNOSTIC_LOG], "build.log", { type: "text/plain" });
    render(<NewAnalysisPage {...makeProps()} />);
    const fileInput = screen.getByLabelText(/Choose a file/);
    const dropZone = fileInput.closest(".drop-zone");

    expect(dropZone).not.toBeNull();
    fireEvent.drop(dropZone as HTMLElement, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue(DIAGNOSTIC_LOG));
    expect(screen.getByText("build.log")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload file" })).toHaveAttribute("aria-selected", "true");
  });

  it("renders actual complete findings, version, confidence, search, severity, and evidence controls", () => {
    const result = analyzeLog(DIAGNOSTIC_LOG);
    expect(result.status).toBe("complete");
    render(<AnalysisPage {...makeProps({ analysis: result, currentLog: DIAGNOSTIC_LOG })} />);

    expect(screen.getByText(/typescript\/compiler-diagnostic/i)).toBeInTheDocument();
    expect(screen.getByText("buildmedic-rules-1")).toBeInTheDocument();
    expect(screen.getAllByText(/confidence/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TS2322/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("textbox", { name: "Search findings" }), { target: { value: "does-not-exist" } });
    expect(screen.getByText("Nothing in this filter")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search findings" }), { target: { value: "TS2322" } });
    expect(screen.getAllByText(/TS2322/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Hide evidence" }));
    expect(screen.getAllByRole("button", { name: "Show evidence" }).length).toBeGreaterThan(0);
  });

  it("shows initial and unknown-log states from actual analysis results", () => {
    const { rerender } = render(<AnalysisPage {...makeProps()} />);
    expect(screen.getByText("No analysis yet")).toBeInTheDocument();

    const noMatch = analyzeLog(UNKNOWN_LOG);
    rerender(<AnalysisPage {...makeProps({ analysis: noMatch, currentLog: UNKNOWN_LOG })} />);
    expect(screen.getByText("No supported diagnostic matched")).toBeInTheDocument();
    expect(screen.getByText(noMatch.message)).toBeInTheDocument();
  });

  it("validates both verification inputs, calls the comparison seam, and renders supplied states", () => {
    const onCompareVerification = vi.fn();
    const { rerender } = render(<VerificationPage {...makeProps({ currentLog: DIAGNOSTIC_LOG, onCompareVerification })} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Compare findings" })[1]!);
    expect(onCompareVerification).not.toHaveBeenCalled();
    expect(screen.getByText("Add the rerun build log before verifying a fix.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Rerun build log" }), { target: { value: DIAGNOSTIC_LOG } });
    fireEvent.click(screen.getAllByRole("button", { name: "Compare findings" })[1]!);
    expect(onCompareVerification).toHaveBeenCalledWith(DIAGNOSTIC_LOG, DIAGNOSTIC_LOG);

    const baseline = analyzeLog(DIAGNOSTIC_LOG);
    const rerun = analyzeLog(DIAGNOSTIC_LOG.replace("TS2322", "TS2339"));
    const comparison = compareAnalysisResults(baseline, rerun);
    rerender(<VerificationPage {...makeProps({ currentLog: DIAGNOSTIC_LOG, verification: comparison })} />);
    if (comparison.status === "compared") {
      expect(screen.getByText(comparison.outcome)).toBeInTheDocument();
      expect(screen.getByText("resolved")).toBeInTheDocument();
      expect(screen.getByText("new")).toBeInTheDocument();
      expect(screen.getByText(/Analyzer findings only · no commands executed/i)).toBeInTheDocument();
    }

    rerender(<VerificationPage {...makeProps({ currentLog: DIAGNOSTIC_LOG, isVerifying: true })} />);
    expect(screen.getByText("Analyzing baseline and rerun locally…")).toBeInTheDocument();
  });

  it("renders no-match verification without inventing a build result", () => {
    const noMatch = analyzeLog(UNKNOWN_LOG);
    const comparison = compareAnalysisResults(noMatch, noMatch);
    render(<VerificationPage {...makeProps({ currentLog: UNKNOWN_LOG, verification: comparison })} />);

    expect(screen.getByText("No supported diagnostic to compare")).toBeInTheDocument();
    expect(screen.getByText(/no executed build outcome was inferred/i)).toBeInTheDocument();
  });

  it("sanitizes the active log and keeps line numbers one-based", () => {
    const log = "token=fixture-secret\nerror TS2322\nthird line";
    render(<LogViewerPage {...makeProps({ analysis: analyzeLog(log), currentLog: log, currentFileName: "secret.log" })} />);

    expect(screen.queryByText(/fixture-secret/)).not.toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("error TS2322")).toBeInTheDocument();
    expect(document.querySelector(".is-evidence")).not.toBeNull();
  });

  it("opens real history metadata and builds a report from the live result", () => {
    const result = analyzeLog(DIAGNOSTIC_LOG);
    const onOpenHistory = vi.fn();
    const entry = historyEntry(result);
    const props = makeProps({ analysis: result, currentLog: DIAGNOSTIC_LOG, history: [entry], onOpenHistory });
    render(<HistoryPage {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /current-build\.log/i }));
    expect(onOpenHistory).toHaveBeenCalledWith(result.id);
    expect(screen.getByText(/Raw logs are not persisted/)).toBeInTheDocument();

    cleanup();
    render(<ReportsPage {...props} />);
    expect(screen.getByText(result.status === "complete" ? result.findings[0]!.title : "Complete")).toBeInTheDocument();
    expect(screen.getByText(/Rule catalog buildmedic-rules-1/)).toBeInTheDocument();
  });
});
