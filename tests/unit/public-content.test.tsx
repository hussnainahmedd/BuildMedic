import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentationPage, HomePage, SupportPage } from "../../src/pages/public";

afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });
const props = () => ({ onNavigate: vi.fn(), onNotify: vi.fn(), onOpenDemo: vi.fn() });

it("labels public examples without fabricated percentage confidence or a disconnected-engine claim", () => {
  const values = props();
  const { container } = render(<HomePage {...values} />);
  expect(container.textContent).not.toMatch(/\d+% confidence|live engine is still being built/i);
  expect(screen.getByText("Example finding")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try an example log" }));
  expect(values.onOpenDemo).toHaveBeenCalledOnce();
});

it("opens the requested documentation section and reports clipboard failures honestly", async () => {
  window.history.replaceState({}, "", "/documentation#security");
  const values = props();
  render(<DocumentationPage {...values} />);
  expect(screen.getByText(/The UI renders it as text, enforces input\/resource limits/)).toBeInTheDocument();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  fireEvent.click(screen.getByRole("button", { name: "Copy section link" }));
  await waitFor(() => expect(values.onNotify).toHaveBeenCalledWith(expect.stringContaining("Could not copy")));
  cleanup();
  render(<SupportPage {...values} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy support note" }));
  await waitFor(() => expect(values.onNotify).toHaveBeenCalledTimes(2));
  expect(values.onNotify.mock.calls.every(([message]) => String(message).startsWith("Could not copy"))).toBe(true);
});
