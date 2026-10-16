import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";
import { WorkspaceShell } from "../../src/components/layout";
import { Modal } from "../../src/components/ui";

function mediaPreferences() {
  const queries = new Map<string, { matches: boolean; listeners: Set<(event: MediaQueryListEvent) => void>; value: MediaQueryList }>();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    if (!queries.has(query)) {
      const state = { matches: false, listeners: new Set<(event: MediaQueryListEvent) => void>(), value: undefined as unknown as MediaQueryList };
      state.value = {
        get matches() { return state.matches; },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => state.listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => state.listeners.delete(listener),
        addListener: (listener: (event: MediaQueryListEvent) => void) => state.listeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) => state.listeners.delete(listener),
        dispatchEvent: () => true,
      } as MediaQueryList;
      queries.set(query, state);
    }
    return queries.get(query)!.value;
  });
  return {
    change(query: string, matches: boolean) {
      window.matchMedia(query);
      const state = queries.get(query)!;
      state.matches = matches;
      act(() => state.listeners.forEach((listener) => listener({ matches, media: query } as MediaQueryListEvent)));
    },
    listenerCount: () => [...queries.values()].reduce((count, state) => count + state.listeners.size, 0),
  };
}

function DialogExample({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)} type="button">Review report</button>
    <a href="#background">Background link</a>
    <Modal description="Review the local report before continuing." onClose={() => { onClose(); setOpen(false); }} open={open} title="Review report">
      <button type="button">Confirm report</button>
      <button disabled type="button">Unavailable action</button>
      <button type="button">Last action</button>
    </Modal>
  </>;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/app/settings");
  window.localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.motion;
  delete document.documentElement.dataset.density;
});

describe("theme and route accessibility", () => {
  it("follows live system color changes and labels the toggle using the resolved scheme", () => {
    const media = mediaPreferences();
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /System\s*Follow browser preference/ }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();

    media.change("(prefers-color-scheme: light)", true);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    media.change("(prefers-color-scheme: light)", false);
    media.change("(prefers-color-scheme: light)", true);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    fireEvent.click(screen.getByRole("button", { name: /System\s*Follow browser preference/ }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it("provides a skip target, current-page semantics and route focus without reduced-motion scrolling", () => {
    mediaPreferences();
    render(<App />);
    const main = screen.getByRole("main");
    expect(main).not.toHaveFocus();
    fireEvent.click(screen.getByRole("link", { name: "Skip to main content" }));
    expect(main).toHaveFocus();
    fireEvent.click(screen.getByRole("checkbox", { name: /Reduce motion/ }));
    const navigation = screen.getByRole("navigation", { name: "Workspace navigation" });
    fireEvent.click(within(navigation).getByRole("link", { name: /^Reports/ }));
    expect(screen.getByRole("main")).toHaveFocus();
    expect(within(navigation).getByRole("link", { name: /^Reports/ })).toHaveAttribute("aria-current", "page");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
  });

  it("honors the OS reduced-motion preference during public navigation", () => {
    const media = mediaPreferences();
    media.change("(prefers-reduced-motion: reduce)", true);
    window.history.replaceState({}, "", "/");
    render(<App />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", { name: "Product" }));
    expect(screen.getByRole("main")).toHaveFocus();
    expect(screen.getByRole("link", { name: "Product" })).toHaveAttribute("aria-current", "page");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
  });

  it("focuses the mobile public navigation on open and restores or advances focus when it closes", () => {
    const media = mediaPreferences();
    media.change("(max-width: 740px)", true);
    window.history.replaceState({}, "", "/features");
    render(<App />);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const product = within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", { name: "Product" });
    expect(product).toHaveFocus();
    fireEvent.keyDown(product, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    fireEvent.click(product);
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("link", { name: "Docs" }));
    expect(screen.getByRole("main")).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("dialog focus lifecycle", () => {
  it("enters, traps, isolates and restores focus and body scrolling on dismissal", () => {
    const onClose = vi.fn();
    const { container } = render(<DialogExample onClose={onClose} />);
    container.setAttribute("aria-hidden", "false");
    const trigger = screen.getByRole("button", { name: "Review report" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Review report" });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const last = within(dialog).getByRole("button", { name: "Last action" });
    expect(dialog).toHaveAccessibleDescription("Review the local report before continuing.");
    expect(close).toHaveFocus();
    expect(container).toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    within(container).getByText("Background link").focus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
    expect(container).not.toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "false");
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps focus on rerender and uses the latest close callback", () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const { rerender } = render(<DialogExample onClose={firstClose} />);
    const trigger = screen.getByRole("button", { name: "Review report" });
    trigger.focus();
    fireEvent.click(trigger);
    const action = screen.getByRole("button", { name: "Confirm report" });
    action.focus();
    rerender(<DialogExample onClose={latestClose} />);
    expect(action).toHaveFocus();
    fireEvent.keyDown(action, { key: "Escape" });
    expect(latestClose).toHaveBeenCalledOnce();
    expect(firstClose).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("assigns distinct names/descriptions and preserves isolation when a nested dialog closes", () => {
    function NestedDialogs() {
      const [nested, setNested] = useState(false);
      return <Modal description="Outer description" onClose={vi.fn()} open title="Outer dialog">
        <button onClick={() => setNested(true)} type="button">Open nested dialog</button>
        <Modal description="Inner description" onClose={() => setNested(false)} open={nested} title="Inner dialog"><button type="button">Nested action</button></Modal>
      </Modal>;
    }
    const { container } = render(<NestedDialogs />);
    const outer = screen.getByRole("dialog", { name: "Outer dialog" });
    const nestedTrigger = screen.getByRole("button", { name: "Open nested dialog" });
    nestedTrigger.focus();
    fireEvent.click(nestedTrigger);
    const inner = screen.getByRole("dialog", { name: "Inner dialog" });
    expect(inner.getAttribute("aria-labelledby")).not.toBe(outer.getAttribute("aria-labelledby"));
    expect(inner.getAttribute("aria-describedby")).not.toBe(outer.getAttribute("aria-describedby"));
    expect(inner).toHaveAccessibleDescription("Inner description");
    fireEvent.keyDown(within(inner).getByRole("button", { name: "Close dialog" }), { key: "Escape" });
    expect(nestedTrigger).toHaveFocus();
    expect(container).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
  });
});

describe("workspace keyboard navigation", () => {
  it("browses command options from the initial close button, wraps, and opens via Enter or number", () => {
    mediaPreferences();
    const onNavigate = vi.fn();
    render(<WorkspaceShell onNavigate={onNavigate} onOpenToast={vi.fn()} onToggleTheme={vi.fn()} path="/app/overview" theme="dark"><h1>Overview content</h1></WorkspaceShell>);
    const trigger = screen.getByRole("button", { name: "Search workspace" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("button", { name: "Close dialog" }), { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: /Start a new analysis/ })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(screen.getByRole("button", { name: /Open settings/ })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onNavigate).toHaveBeenLastCalledWith("/app/settings");
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(document, { ctrlKey: true, key: "k" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Close dialog" }), { key: "3" });
    expect(onNavigate).toHaveBeenLastCalledWith("/app/verification");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("hides the closed mobile sidebar, focuses/traps on open, and restores on Escape", () => {
    const media = mediaPreferences();
    media.change("(max-width: 960px)", true);
    const { container } = render(<WorkspaceShell onNavigate={vi.fn()} onOpenToast={vi.fn()} onToggleTheme={vi.fn()} path="/app/overview" theme="dark"><h1>Overview content</h1></WorkspaceShell>);
    const trigger = screen.getByRole("button", { name: "Open sidebar" });
    const sidebar = container.querySelector(".workspace-sidebar")!;
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", sidebar.id);
    expect(sidebar).toHaveAttribute("inert");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
    trigger.focus();
    const restoreFocus = vi.spyOn(trigger, "focus");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Workspace navigation" });
    expect(within(dialog).getByRole("button", { name: "Close sidebar" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("main", { hidden: true }).closest(".workspace-main")).toHaveAttribute("inert");
    const first = within(dialog).getByRole("link", { name: "BuildMedic" });
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("link", { name: /^Help/ })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(trigger.closest("[inert], [aria-hidden='true']")).toBeNull();
    expect(restoreFocus).toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(sidebar).toHaveAttribute("inert");
    media.change("(max-width: 960px)", false);
    expect(sidebar).not.toHaveAttribute("inert");
    expect(screen.getByRole("navigation", { name: "Workspace navigation" })).toBeInTheDocument();
  });
});

it("keeps light muted/accent text, tinted badges and primary buttons above 4.5:1", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const lightTokens = styles.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)![1]!;
  const token = (name: string) => lightTokens.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})`))![1]!;
  const rgb = (color: string) => color.match(/[a-f0-9]{2}/gi)!.map((value) => Number.parseInt(value, 16));
  const luminance = (color: number[]) => color.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  const contrast = (foreground: number[], background: number[]) => (Math.max(luminance(foreground), luminance(background)) + 0.05) / (Math.min(luminance(foreground), luminance(background)) + 0.05);
  for (const surface of ["bg", "surface", "surface-strong"]) {
    expect(contrast(rgb(token("muted")), rgb(token(surface)))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(token("accent")), rgb(token(surface)))).toBeGreaterThanOrEqual(4.5);
  }
  const badgeBackground = rgb(token("bg")).map((value, index) => value * 0.9 + rgb(token("accent"))[index]! * 0.1);
  expect(contrast(rgb(token("accent")), badgeBackground)).toBeGreaterThanOrEqual(4.5);
  // Settings nests a 10% success badge in a 5% success-tinted note.
  const successBackground = rgb(token("surface")).map((value, index) => value * 0.855 + rgb(token("green"))[index]! * 0.145);
  expect(contrast(rgb(token("green")), successBackground)).toBeGreaterThanOrEqual(4.5);
  const codeBackground = rgb(token("surface")).map((value, index) => value * 0.93 + rgb(token("amber"))[index]! * 0.07);
  expect(contrast(rgb(token("amber")), codeBackground)).toBeGreaterThanOrEqual(4.5);
  for (const background of ["accent", "accent-strong"]) expect(contrast(rgb(token("accent-ink")), rgb(token(background)))).toBeGreaterThanOrEqual(4.5);
});
