import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "./icons";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

interface FocusScope { element: HTMLElement; lastFocused?: HTMLElement }
const focusScopes: FocusScope[] = [];
const isolatedElements = new Map<HTMLElement, { inert: string | null; ariaHidden: string | null }>();
let bodyOverflow: string | undefined;

function restoreBackground() {
  for (const [element, attributes] of isolatedElements) {
    for (const [name, value] of [["inert", attributes.inert], ["aria-hidden", attributes.ariaHidden]] as const) {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
  }
  isolatedElements.clear();
}

function isolateBackground() {
  const activeScope = focusScopes.at(-1);
  if (!activeScope) {
    if (bodyOverflow !== undefined) document.body.style.overflow = bodyOverflow;
    bodyOverflow = undefined;
    return;
  }
  if (bodyOverflow === undefined) bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  // Isolate siblings along the ancestor path, never an ancestor of the dialog.
  // This also supports the mobile drawer without hiding its backdrop.
  let branch = activeScope.element;
  while (branch.parentElement) {
    const parent = branch.parentElement;
    for (const sibling of parent.children) {
      if (sibling === branch || !(sibling instanceof HTMLElement) || /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) continue;
      isolatedElements.set(sibling, { inert: sibling.getAttribute("inert"), ariaHidden: sibling.getAttribute("aria-hidden") });
      sibling.setAttribute("inert", "");
      sibling.setAttribute("aria-hidden", "true");
    }
    if (parent === document.body) break;
    branch = parent;
  }
}

function isAvailableForFocus(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest("[inert], [hidden], [aria-hidden='true']") || element.matches(":disabled")) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

function tabStops(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>("a[href], area[href], button, input, select, textarea, iframe, [contenteditable='true'], [tabindex]")]
    .filter((candidate) => candidate.tabIndex >= 0 && isAvailableForFocus(candidate))
    .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
}

/** Shared dialog/drawer lifecycle. Callback updates never restart focus entry. */
export function useDialogFocus(open: boolean, containerRef: RefObject<HTMLElement | null>, onClose: () => void, initialFocusSelector?: string) {
  const closeRef = useRef(onClose);
  const restoreFocusRef = useRef<{ target: HTMLElement; scope: HTMLElement } | null>(null);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);

  // Restore after React's commit-time focus preservation, including when a
  // drawer stays mounted and only becomes hidden/inert.
  useEffect(() => () => {
    const pending = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (pending && (pending.scope.contains(document.activeElement) || document.activeElement === document.body) && isAvailableForFocus(pending.target)) {
      pending.target.focus({ preventScroll: true });
    }
  }, [open]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!open || !element) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scope: FocusScope = { element };
    focusScopes.push(scope);
    restoreBackground();
    const initial = initialFocusSelector ? element.querySelector<HTMLElement>(initialFocusSelector) : null;
    (initial ?? tabStops(element)[0] ?? element).focus({ preventScroll: true });
    scope.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    isolateBackground();

    const handleFocus = (event: FocusEvent) => {
      if (focusScopes.at(-1) !== scope) return;
      if (event.target instanceof HTMLElement && element.contains(event.target)) {
        scope.lastFocused = event.target;
      } else {
        const last = scope.lastFocused;
        (last && isAvailableForFocus(last) ? last : tabStops(element)[0] ?? element).focus({ preventScroll: true });
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (focusScopes.at(-1) !== scope) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const stops = tabStops(element);
        const first = stops[0];
        const last = stops.at(-1);
        const active = document.activeElement;
        if (!first || !last) {
          event.preventDefault();
          element.focus({ preventScroll: true });
        } else if (!element.contains(active) || active === element || (event.shiftKey ? active === first : active === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener("keydown", handleKey, true);
    document.addEventListener("focusin", handleFocus);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("focusin", handleFocus);
      const shouldRestore = focusScopes.at(-1) === scope && (element.contains(document.activeElement) || document.activeElement === document.body);
      focusScopes.splice(focusScopes.indexOf(scope), 1);
      restoreBackground();
      isolateBackground();
      if (shouldRestore && returnFocus) restoreFocusRef.current = { target: returnFocus, scope: element };
    };
  }, [containerRef, initialFocusSelector, open]);
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button-${variant} button-${size}${fullWidth ? " button-full" : ""} ${className}`}
      type={type}
      {...props}
    >
      {icon && iconPosition === "left" ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      <span>{children}</span>
      {icon && iconPosition === "right" ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: ButtonVariant;
}

export function IconButton({ icon, label, size = "md", variant = "ghost", className = "", ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`icon-button icon-button-${size} icon-button-${variant} ${className}`}
      title={label}
      type="button"
      {...props}
    >
      <Icon name={icon} size={size === "sm" ? 15 : size === "lg" ? 20 : 17} />
    </button>
  );
}

interface AppLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  onNavigate?: (path: string) => void;
  external?: boolean;
}

export function AppLink({ to, onNavigate, external = false, onClick, children, ...props }: AppLinkProps) {
  const isExternal = external || /^(https?:|mailto:|#)/.test(to);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (event.defaultPrevented || isExternal || !onNavigate) {
      return;
    }

    event.preventDefault();
    onNavigate(to);
  }

  return (
    <a href={to} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "success" | "warning" | "error" | "critical" | "info" | "accent";
  size?: "sm" | "md";
  dot?: boolean;
}

export function Badge({ children, tone = "neutral", size = "sm", dot = false, className = "", ...props }: BadgeProps) {
  return (
    <span className={`badge badge-${tone} badge-${size} ${className}`} {...props}>
      {dot ? <span aria-hidden="true" className="badge-dot" /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Divider({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`divider ${className}`} />;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  leadingIcon?: IconName;
}

export function Field({ label, hint, error, id, leadingIcon, className = "", ...props }: FieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field ${className}`}>
      <label htmlFor={fieldId}>{label}</label>
      {leadingIcon ? (
        <span className="field-leading-icon">
          <Icon name={leadingIcon} size={16} />
        </span>
      ) : null}
      <input
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className={leadingIcon ? "has-leading-icon" : ""}
        id={fieldId}
        {...props}
      />
      {hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          <Icon name="circle-alert" size={14} /> {error}
        </span>
      ) : null}
    </div>
  );
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  counter?: string;
}

export function TextareaField({ label, hint, error, counter, id, className = "", ...props }: TextareaFieldProps) {
  const fieldId = id ?? `textarea-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field ${className}`}>
      <div className="field-label-row">
        <label htmlFor={fieldId}>{label}</label>
        {counter ? <span className="field-counter">{counter}</span> : null}
      </div>
      <textarea aria-describedby={describedBy} aria-invalid={Boolean(error)} id={fieldId} {...props} />
      {hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          <Icon name="circle-alert" size={14} /> {error}
        </span>
      ) : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span aria-hidden="true" className="toggle-control">
        <span />
      </span>
    </label>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={`section-heading section-heading-${align} ${className}`}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function DemoNotice({ children = "Demonstration data · no live analyzer connected" }: { children?: ReactNode }) {
  return (
    <div className="demo-notice" role="note">
      <Icon name="sparkles" size={16} />
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({
  icon = "layers",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  size = "md",
  id,
  onKeyDown,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  id?: string;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogFocus(open, dialogRef, onClose);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        event.preventDefault();
        onClose();
      }
    }} role="presentation">
      <section aria-modal="true" className={`modal modal-${size}`} role="dialog" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} id={id} onKeyDown={onKeyDown} ref={dialogRef} tabIndex={-1}>
        <div className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <IconButton icon="x" label="Close dialog" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;

  return (
    <div aria-live="polite" className="toast" role="status">
      <Icon name="check-circle" size={17} />
      <span>{message}</span>
      <IconButton icon="x" label="Dismiss notification" onClick={onClose} size="sm" />
    </div>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="inline-code">{children}</code>;
}
