import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewAnalysisPage, VerificationPage, type WorkspacePageProps } from "../../src/pages/workspace";
import { DEMO_ANALYSIS, DEMO_NODE_BUILD_LOG } from "../../src/data";
import { DEFAULT_USER_PREFERENCES } from "../../src/types/preferences";

function renderInput(overrides: Partial<WorkspacePageProps> = {}) {
  const props: WorkspacePageProps = {
    analysis: DEMO_ANALYSIS,
    currentLog: DEMO_NODE_BUILD_LOG.text,
    onAnalyze: vi.fn(),
    onNavigate: vi.fn(),
    onNotify: vi.fn(),
    onPatchPreferences: vi.fn(),
    onSetTheme: vi.fn(),
    preferences: DEFAULT_USER_PREFERENCES,
    theme: DEFAULT_USER_PREFERENCES.theme,
    ...overrides,
  };

  return { ...render(<NewAnalysisPage {...props} />), props };
}

function renderVerification(overrides: Partial<WorkspacePageProps> = {}) {
  const props: WorkspacePageProps = {
    analysis: DEMO_ANALYSIS,
    currentLog: DEMO_NODE_BUILD_LOG.text,
    onAnalyze: vi.fn(),
    onNavigate: vi.fn(),
    onNotify: vi.fn(),
    onPatchPreferences: vi.fn(),
    onSetTheme: vi.fn(),
    preferences: DEFAULT_USER_PREFERENCES,
    theme: DEFAULT_USER_PREFERENCES.theme,
    ...overrides,
  };

  return { ...render(<VerificationPage {...props} />), props };
}

describe("new analysis frontend flow", () => {
  afterEach(() => cleanup());

  it("exposes an accessible log field and clears local input", () => {
    renderInput();
    const textarea = screen.getByRole("textbox", { name: "Build log" });

    expect(textarea).toHaveValue(DEMO_NODE_BUILD_LOG.text);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(textarea).toHaveValue("");
  });

  it("shows the documented required message without invoking demo analysis", () => {
    const onAnalyze = vi.fn();
    const onNotify = vi.fn();
    renderInput({ onAnalyze, onNotify });
    const textarea = screen.getByRole("textbox", { name: "Build log" });

    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze demo log" }));

    expect(onAnalyze).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith("Paste a build log to analyze.");
    expect(screen.getByRole("alert")).toHaveTextContent("Paste a build log to analyze.");
  });

  it("renders the simulated verification result after comparing both logs", () => {
    renderVerification();

    fireEvent.click(screen.getByRole("button", { name: "Compare demo result" }));

    expect(screen.getByText("The rerun moved in the right direction.")).toBeInTheDocument();
    expect(screen.getByText("resolved")).toBeInTheDocument();
  });
});
