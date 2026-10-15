import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useEffect,
} from "react";

import { Icon, type IconName } from "./icons";

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
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-modal="true" className={`modal modal-${size}`} role="dialog" aria-labelledby="modal-title">
        <div className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <IconButton icon="x" label="Close dialog" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
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
