import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeLog } from "../../src/analyzer";
import { HomePage } from "../../src/pages/public";
import {
  HelpPage,
  HistoryPage,
  LogViewerPage,
  NewAnalysisPage,
  ReportsPage,
  SettingsPage,
  VerificationPage,
  type WorkspacePageProps,
} from "../../src/pages/workspace";
import { DEFAULT_USER_PREFERENCES } from "../../src/types/preferences";

const ORIGINAL = "src/example.ts:4:9 - error TS2322: incompatible types";
const RERUN = "src/example.ts:4:9 - error TS2339: property does not exist";

function props(overrides: Partial<WorkspacePageProps> = {}): WorkspacePageProps {
  return {
    analysis: analyzeLog(""), analysisError: null, currentLog: "", history: [],
    isAnalyzing: false, isVerifying: false, verification: null,
    preferences: DEFAULT_USER_PREFERENCES, theme: "system",
    onAnalyze: vi.fn(), onClearActive: vi.fn(), onCompareVerification: vi.fn(),
    onNavigate: vi.fn(), onNotify: vi.fn(), onOpenHistory: vi.fn(),
    onPatchPreferences: vi.fn(), onSetTheme: vi.fn(), ...overrides,
  };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("honest page control states", () => {
  it("exposes input sources as pressed buttons while retaining the textarea, upload, and metadata workflow", () => {
    const values = props({ currentLog: ORIGINAL, currentFileName: "build.log", preferences: { ...DEFAULT_USER_PREFERENCES, defaultInputMode: "file" }, onEditInput: vi.fn() });
    render(<NewAnalysisPage {...values} />);
    const sources = screen.getByRole("group", { name: "Input mode" });
    const paste = within(sources).getByRole("button", { name: "Paste text" });
    const file = within(sources).getByRole("button", { name: "Upload file" });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(file).toHaveAttribute("aria-pressed", "true");
    expect(paste).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue(ORIGINAL);
    expect(screen.getByLabelText(/Choose a file/)).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Analyze log" }));
    expect(values.onAnalyze).toHaveBeenLastCalledWith(ORIGINAL, "file", "build.log");
    fireEvent.click(paste);
    expect(paste).toHaveAttribute("aria-pressed", "true");
    expect(file).toHaveAttribute("aria-pressed", "false");
    expect(values.onEditInput).toHaveBeenLastCalledWith(ORIGINAL, "paste");
    fireEvent.click(file);
    expect(values.onEditInput).toHaveBeenLastCalledWith(ORIGINAL, "file", undefined);
    expect(screen.getByRole("textbox", { name: "Build log" })).toHaveValue(ORIGINAL);
    expect(screen.getByLabelText(/Choose a file/)).toBeVisible();
  });

  it("announces the history status filter and current default input mode", () => {
    const values = props();
    const { rerender } = render(<HistoryPage {...values} />);
    const filter = screen.getByRole("group", { name: "History status filter" });
    expect(within(filter).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["Findings", "No match", "Invalid", "All"]) {
      fireEvent.click(within(filter).getByRole("button", { name: label }));
      for (const button of within(filter).getAllByRole("button")) {
        expect(button).toHaveAttribute("aria-pressed", String(button.textContent === label));
      }
    }

    rerender(<SettingsPage {...values} />);
    const defaults = screen.getByRole("group", { name: "Default input mode" });
    expect(within(defaults).getByRole("button", { name: "Paste" })).toHaveAttribute("aria-pressed", "true");
    expect(within(defaults).getByRole("button", { name: "File" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(defaults).getByRole("button", { name: "File" }));
    expect(values.onPatchPreferences).toHaveBeenCalledWith({ defaultInputMode: "file" });
    rerender(<SettingsPage {...values} preferences={{ ...DEFAULT_USER_PREFERENCES, defaultInputMode: "file" }} />);
    expect(screen.getByRole("button", { name: "File" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Paste" })).toHaveAttribute("aria-pressed", "false");
  });

  it("connects FAQ disclosure state to stable answer IDs", () => {
    render(<HelpPage {...props()} />);
    const engine = screen.getByRole("button", { name: "What powers an analysis?" });
    const input = screen.getByRole("button", { name: "What happens to my log?" });
    const engineAnswer = document.getElementById(engine.getAttribute("aria-controls") ?? "");
    const inputAnswer = document.getElementById(input.getAttribute("aria-controls") ?? "");
    expect(engine).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(engineAnswer).toBeVisible();
    expect(inputAnswer).not.toBeVisible();
    expect(engineAnswer).toHaveTextContent("browser-local analyzer");
    expect(inputAnswer).toHaveTextContent("current browser session");
    fireEvent.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(engine).toHaveAttribute("aria-expanded", "false");
    expect(inputAnswer).toBeVisible();
    expect(engineAnswer).not.toBeVisible();
    fireEvent.click(input);
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(inputAnswer).not.toBeVisible();
  });
});

describe.each([
  { name: "homepage console", labels: ["Diagnosis", "Evidence"], renderPage: () => <HomePage onNavigate={vi.fn()} onNotify={vi.fn()} onOpenDemo={vi.fn()} /> },
  { name: "report sections", labels: ["Overview", "Evidence", "Next step"], renderPage: () => <ReportsPage {...props({ currentLog: ORIGINAL, analysis: analyzeLog(ORIGINAL) })} /> },
])("$name accessible tabs", ({ labels, renderPage }) => {
  it("has one tab stop, connected labeled panels, and wrapping Arrow/Home/End navigation", () => {
    render(renderPage());
    const tabs = screen.getAllByRole("tab");
    function assertSelected(index: number) {
      tabs.forEach((tab, position) => {
        expect(tab).toHaveAttribute("tabindex", position === index ? "0" : "-1");
        expect(tab).toHaveAttribute("aria-selected", String(position === index));
        const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
        expect(tab.id).not.toBe("");
        expect(panel).toHaveAttribute("role", "tabpanel");
        expect(panel).toHaveAttribute("aria-labelledby", tab.id);
        if (position === index) expect(panel).toBeVisible();
        else expect(panel).not.toBeVisible();
      });
      expect(screen.getByRole("tabpanel", { name: labels[index] })).toHaveAttribute("tabindex", "0");
    }
    assertSelected(0);
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" });
    expect(tabs.at(-1)).toHaveFocus();
    assertSelected(tabs.length - 1);
    fireEvent.keyDown(tabs.at(-1)!, { key: "ArrowRight" });
    expect(tabs[0]).toHaveFocus();
    assertSelected(0);
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    assertSelected(tabs.length - 1);
    expect(tabs.at(-1)).toHaveFocus();
    fireEvent.keyDown(tabs.at(-1)!, { key: "Home" });
    assertSelected(0);
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    assertSelected(1);
    expect(tabs[1]).toHaveFocus();
    fireEvent.click(tabs[0]!);
    assertSelected(0);
  });

  it("leaves modified navigation and unrelated keys available to the browser", () => {
    render(renderPage());
    const first = screen.getAllByRole("tab")[0]!;
    first.focus();
    expect(fireEvent.keyDown(first, { key: "ArrowRight", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(first, { key: "Home", metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(first, { key: "ArrowDown" })).toBe(true);
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");
  });
});

describe("viewer search shortcut", () => {
  it("focuses viewer search with / and restores focus after clearing the query", () => {
    render(<LogViewerPage {...props()} />);
    const search = screen.getByRole("textbox", { name: "Search log" });
    const viewer = screen.getByRole("region", { name: "Build log lines" });
    viewer.focus();
    expect(fireEvent.keyDown(viewer, { key: "/" })).toBe(false);
    expect(search).toHaveFocus();
    expect(search).toHaveAttribute("aria-keyshortcuts", "/");
    fireEvent.change(search, { target: { value: "needle" } });
    const clear = screen.getByRole("button", { name: "Clear search" });
    clear.focus();
    fireEvent.click(clear);
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
  });

  it.each([
    <input aria-label="Typing context" key="input" />,
    <textarea aria-label="Typing context" key="textarea" />,
    <select aria-label="Typing context" key="select"><option>Option</option></select>,
    <div aria-label="Typing context" contentEditable suppressContentEditableWarning tabIndex={0} key="editable" />,
    <div contentEditable suppressContentEditableWarning key="nested"><span aria-label="Typing context" tabIndex={0}>Editable descendant</span></div>,
    <div aria-label="Typing context" role="textbox" tabIndex={0} key="textbox" />,
  ])("does not hijack / in typing context %#", (context) => {
    render(<><LogViewerPage {...props()} />{context}</>);
    const field = screen.getByLabelText("Typing context");
    field.focus();
    expect(fireEvent.keyDown(field, { key: "/" })).toBe(true);
    expect(field).toHaveFocus();
    // A window-targeted event must also respect the active editable element.
    expect(fireEvent.keyDown(window, { key: "/" })).toBe(true);
    expect(field).toHaveFocus();
  });

  it("ignores modified/composing shortcuts and removes its listener when leaving the viewer", () => {
    const { unmount } = render(<LogViewerPage {...props()} />);
    const search = screen.getByRole("textbox", { name: "Search log" });
    const focus = vi.spyOn(search, "focus");
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
      expect(fireEvent.keyDown(window, { key: "/", ...modifiers })).toBe(true);
    }
    expect(focus).not.toHaveBeenCalled();
    unmount();
    fireEvent.keyDown(window, { key: "/" });
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("verification keyboard comparison and form recovery", () => {
  it.each(["ctrlKey", "metaKey"])("compares current inputs with %s+Enter, suppressing repeats and busy requests", (modifier) => {
    const values = props({ currentLog: ORIGINAL });
    const { rerender } = render(<VerificationPage {...values} />);
    const original = screen.getByRole("textbox", { name: "Original build log" });
    const rerun = screen.getByRole("textbox", { name: "Rerun build log" });
    fireEvent.change(original, { target: { value: `${ORIGINAL}\nlatest baseline` } });
    fireEvent.change(rerun, { target: { value: RERUN } });
    rerun.focus();
    expect(fireEvent.keyDown(rerun, { key: "Enter", [modifier]: true })).toBe(false);
    expect(values.onCompareVerification).toHaveBeenCalledExactlyOnceWith(`${ORIGINAL}\nlatest baseline`, RERUN);
    expect(rerun).toHaveAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter");
    fireEvent.keyDown(rerun, { key: "Enter", [modifier]: true, repeat: true });
    expect(values.onCompareVerification).toHaveBeenCalledTimes(1);
    rerender(<VerificationPage {...values} isVerifying />);
    fireEvent.keyDown(original, { key: "Enter", [modifier]: true });
    fireEvent.keyDown(rerun, { key: "Enter", [modifier]: true });
    expect(values.onCompareVerification).toHaveBeenCalledTimes(1);
  });

  it("focuses the first invalid verification field and preserves accessible error descriptions", () => {
    const values = props();
    render(<VerificationPage {...values} />);
    const original = screen.getByRole("textbox", { name: "Original build log" });
    const rerun = screen.getByRole("textbox", { name: "Rerun build log" });
    rerun.focus();
    fireEvent.keyDown(rerun, { key: "Enter", ctrlKey: true });
    expect(original).toHaveFocus();
    expect(original).toHaveAttribute("aria-invalid", "true");
    expect(original).toHaveAccessibleDescription("Add the original build log before verifying a fix.");
    fireEvent.change(original, { target: { value: ORIGINAL } });
    fireEvent.keyDown(original, { key: "Enter", metaKey: true });
    expect(rerun).toHaveFocus();
    expect(rerun).toHaveAccessibleDescription("Add the rerun build log before verifying a fix.");
    fireEvent.change(rerun, { target: { value: "binary\u0000input" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Compare findings" })[0]!);
    expect(rerun).toHaveFocus();
    expect(rerun).toHaveAccessibleDescription(expect.stringMatching(/binary or unreadable/));
    expect(values.onCompareVerification).not.toHaveBeenCalled();
  });

  it("does not compare outside its input context or while input inspection is pending", () => {
    vi.stubGlobal("Worker", undefined);
    const values = props({ currentLog: ORIGINAL, verificationInputs: { baseline: ORIGINAL, rerun: RERUN } });
    const { rerender } = render(<><VerificationPage {...values} /><textarea aria-label="Other editor" /></>);
    const original = screen.getByRole("textbox", { name: "Original build log" });
    for (const event of [{ key: "Enter" }, { key: "Enter", ctrlKey: true, isComposing: true }, { key: "Enter", altKey: true, ctrlKey: true }]) {
      expect(fireEvent.keyDown(original, event)).toBe(true);
    }
    expect(fireEvent.keyDown(screen.getByRole("textbox", { name: "Other editor" }), { key: "Enter", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: "Enter", metaKey: true })).toBe(true);
    expect(values.onCompareVerification).not.toHaveBeenCalled();
    rerender(<VerificationPage key="large-input" {...values} verificationInputs={{ baseline: "line\n".repeat(14_000), rerun: RERUN }} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rerun build log" }), { key: "Enter", ctrlKey: true });
    expect(screen.getAllByRole("button", { name: "Compare findings" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(values.onCompareVerification).not.toHaveBeenCalled();
  });

  it("focuses invalid analysis input after submit and file input when a file error blocks submission", () => {
    const values = props();
    render(<NewAnalysisPage {...values} />);
    fireEvent.click(screen.getByRole("button", { name: "Analyze log" }));
    const log = screen.getByRole("textbox", { name: "Build log" });
    expect(log).toHaveFocus();
    expect(log).toHaveAttribute("aria-invalid", "true");
    expect(log).toHaveAccessibleDescription(expect.stringContaining("Paste a build log to analyze."));
    fireEvent.change(log, { target: { value: ORIGINAL } });
    const file = screen.getByLabelText(/Choose a file/);
    fireEvent.change(file, { target: { files: [new File(["not a log"], "image.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze log" }));
    expect(file).toHaveFocus();
    expect(file).toHaveAttribute("aria-invalid", "true");
    expect(file).toHaveAccessibleDescription("Choose a readable text log file.");
    expect(values.onAnalyze).not.toHaveBeenCalled();
  });

  it("advertises platform-neutral comparison shortcuts in verification and Help", () => {
    const { rerender } = render(<VerificationPage {...props()} />);
    expect(screen.getByText("Ctrl/Cmd")).toBeInTheDocument();
    rerender(<HelpPage {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    const shortcuts = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(shortcuts).getByText("Compare verification inputs")).toBeInTheDocument();
    expect(within(shortcuts).getByText("Ctrl/Cmd Enter")).toBeInTheDocument();
  });
});
