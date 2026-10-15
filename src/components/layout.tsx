import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Icon, type IconName } from "./icons";
import { AppLink, Badge, Button, Divider, IconButton, Kbd, Modal } from "./ui";
import type { ThemeMode } from "../types";

export type Navigate = (path: string) => void;

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <span aria-hidden="true" className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      {compact ? null : <span className="brand-name">BuildMedic</span>}
    </span>
  );
}

export function ThemeToggle({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return <IconButton icon={theme === "dark" ? "sun" : "moon"} label={label} onClick={onToggle} />;
}

interface PublicLayoutProps {
  children: ReactNode;
  path: string;
  onNavigate: Navigate;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

const publicLinks = [
  { label: "Product", href: "/features" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Docs", href: "/documentation" },
];

export function PublicLayout({ children, path, onNavigate, theme, onToggleTheme }: PublicLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  return (
    <div className="public-layout">
      <header className="public-header">
        <div className="container public-header-inner">
          <AppLink className="brand-link" onNavigate={onNavigate} to="/">
            <BrandMark />
          </AppLink>
          <nav aria-label="Primary navigation" className={`public-nav${mobileOpen ? " public-nav-open" : ""}`}>
            {publicLinks.map((link) => (
              <AppLink className={path === link.href ? "active" : ""} key={link.href} onNavigate={onNavigate} to={link.href}>
                {link.label}
              </AppLink>
            ))}
            <AppLink className={path === "/about" ? "active" : ""} onNavigate={onNavigate} to="/about">
              About
            </AppLink>
            <div className="public-nav-mobile-actions">
              <Button onClick={() => onNavigate("/app/overview")} size="sm" icon="arrow-right" iconPosition="right">
                Open workspace
              </Button>
            </div>
          </nav>
          <div className="public-header-actions">
            <ThemeToggle onToggle={onToggleTheme} theme={theme} />
            <Button className="public-cta" onClick={() => onNavigate("/app/overview")} size="sm" icon="arrow-right" iconPosition="right">
              Open workspace
            </Button>
            <IconButton
              className="mobile-menu-button"
              icon={mobileOpen ? "x" : "menu"}
              label={mobileOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setMobileOpen((open) => !open)}
            />
          </div>
        </div>
      </header>
      <main>{children}</main>
      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}

function PublicFooter({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <footer className="public-footer">
      <div className="container">
        <div className="footer-main">
          <div className="footer-brand-column">
            <AppLink className="brand-link" onNavigate={onNavigate} to="/">
              <BrandMark />
            </AppLink>
            <p>Turn noisy Node.js build output into a clearer next step.</p>
            <Badge tone="success" dot>
              Offline-first by design
            </Badge>
          </div>
          <div className="footer-links">
            <div>
              <span className="footer-label">Explore</span>
              <AppLink onNavigate={onNavigate} to="/features">
                Features
              </AppLink>
              <AppLink onNavigate={onNavigate} to="/how-it-works">
                How it works
              </AppLink>
              <AppLink onNavigate={onNavigate} to="/documentation">
                Documentation
              </AppLink>
            </div>
            <div>
              <span className="footer-label">Project</span>
              <AppLink onNavigate={onNavigate} to="/about">
                About
              </AppLink>
              <AppLink onNavigate={onNavigate} to="/support">
                Support
              </AppLink>
              <AppLink onNavigate={onNavigate} to="/security">
                Security
              </AppLink>
            </div>
            <div>
              <span className="footer-label">Workspace</span>
              <AppLink onNavigate={onNavigate} to="/app/new-analysis">
                New analysis
              </AppLink>
              <AppLink onNavigate={onNavigate} to="/app/history">
                History
              </AppLink>
              <AppLink onNavigate={onNavigate} to="/app/settings">
                Settings
              </AppLink>
            </div>
          </div>
        </div>
        <Divider />
        <div className="footer-bottom">
          <span>© 2026 BuildMedic contributors · MIT License</span>
          <div>
            <AppLink onNavigate={onNavigate} to="/privacy">
              Privacy
            </AppLink>
            <a href="https://github.com/hussnainahmedd/BuildMedic" rel="noreferrer" target="_blank">
              GitHub <Icon name="external-link" size={13} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

interface WorkspaceShellProps {
  children: ReactNode;
  path: string;
  onNavigate: Navigate;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenToast: (message: string) => void;
}

interface WorkspaceNavItem {
  label: string;
  description: string;
  href: string;
  icon: IconName;
}

const workspaceGroups: { label: string; items: WorkspaceNavItem[] }[] = [
  {
    label: "Workbench",
    items: [
      { label: "Overview", description: "Workspace pulse", href: "/app/overview", icon: "layout-dashboard" },
      { label: "New analysis", description: "Paste or upload", href: "/app/new-analysis", icon: "plus" },
      { label: "Log viewer", description: "Inspect evidence", href: "/app/log-viewer", icon: "file-code" },
      { label: "Verification", description: "Compare reruns", href: "/app/verification", icon: "shield-check" },
    ],
  },
  {
    label: "Library",
    items: [
      { label: "History", description: "Local demo history", href: "/app/history", icon: "history" },
      { label: "Reports", description: "Shareable preview", href: "/app/reports", icon: "file-text" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", description: "Preferences", href: "/app/settings", icon: "settings" },
      { label: "Help", description: "Guides and shortcuts", href: "/app/help", icon: "circle-help" },
    ],
  },
];

function WorkspaceNav({ path, onNavigate, onClose }: { path: string; onNavigate: Navigate; onClose: () => void }) {
  return (
    <nav aria-label="Workspace navigation" className="workspace-nav">
      {workspaceGroups.map((group) => (
        <div className="workspace-nav-group" key={group.label}>
          <span className="workspace-nav-label">{group.label}</span>
          {group.items.map((item) => {
            const active = path === item.href || (item.href === "/app/overview" && path === "/app");
            return (
              <AppLink
                className={`workspace-nav-item${active ? " active" : ""}`}
                key={item.href}
                onClick={onClose}
                onNavigate={onNavigate}
                to={item.href}
              >
                <span className="workspace-nav-icon">
                  <Icon name={item.icon} size={17} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                {active ? <span aria-hidden="true" className="workspace-nav-active-dot" /> : null}
              </AppLink>
            );
          })}
        </div>
      ))}
      <div className="workspace-nav-bottom">
        <div className="workspace-health">
          <span className="status-pulse" />
          <span>
            <strong>Local session</strong>
            <small>No network required</small>
          </span>
        </div>
        <div className="workspace-nav-version">Demo workspace · v0.1</div>
      </div>
    </nav>
  );
}

export function WorkspaceShell({ children, path, onNavigate, theme, onToggleTheme, onOpenToast }: WorkspaceShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [path]);

  const pageTitle = useMemo(() => {
    const match = workspaceGroups.flatMap((group) => group.items).find((item) => item.href === path);
    return match?.label ?? (path === "/app" ? "Overview" : "Workspace");
  }, [path]);

  const commandItems = [
    { label: "Start a new analysis", href: "/app/new-analysis", icon: "plus" as const },
    { label: "Open latest result", href: "/app/analysis", icon: "activity" as const },
    { label: "Compare a rerun", href: "/app/verification", icon: "shield-check" as const },
    { label: "Open settings", href: "/app/settings", icon: "settings" as const },
  ];

  function goFromCommand(href: string) {
    setCommandOpen(false);
    onNavigate(href);
  }

  return (
    <div className="workspace-layout">
      <aside className={`workspace-sidebar${sidebarOpen ? " is-open" : ""}`}>
        <div className="workspace-sidebar-top">
          <AppLink className="brand-link workspace-brand" onNavigate={onNavigate} to="/">
            <BrandMark />
          </AppLink>
          <IconButton className="sidebar-close" icon="x" label="Close sidebar" onClick={() => setSidebarOpen(false)} />
        </div>
        <div className="workspace-context">
          <span className="workspace-context-icon">
            <Icon name="terminal" size={18} />
          </span>
          <span>
            <strong>BuildMedic Lab</strong>
            <small>Personal workspace</small>
          </span>
          <Icon name="chevron-down" size={15} />
        </div>
        <WorkspaceNav onClose={() => setSidebarOpen(false)} onNavigate={onNavigate} path={path} />
      </aside>
      {sidebarOpen ? <button aria-label="Close navigation overlay" className="sidebar-overlay" onClick={() => setSidebarOpen(false)} type="button" /> : null}
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            <IconButton className="sidebar-open" icon="menu" label="Open sidebar" onClick={() => setSidebarOpen(true)} />
            <div className="breadcrumbs">
              <AppLink onNavigate={onNavigate} to="/app/overview">
                Workspace
              </AppLink>
              <Icon name="chevron-right" size={14} />
              <span>{pageTitle}</span>
            </div>
          </div>
          <div className="workspace-topbar-actions">
            <button className="command-trigger" onClick={() => setCommandOpen(true)} type="button">
              <Icon name="search" size={15} />
              <span>Search workspace</span>
              <Kbd>⌘ K</Kbd>
            </button>
            <Badge dot tone="accent">
              Demo mode
            </Badge>
            <ThemeToggle onToggle={onToggleTheme} theme={theme} />
            <IconButton icon="circle-help" label="Open help" onClick={() => onNavigate("/app/help")} />
            <button className="avatar-button" onClick={() => onNavigate("/app/settings")} type="button">
              <span className="avatar">BM</span>
              <span className="avatar-copy">
                <strong>BuildMedic</strong>
                <small>Local user</small>
              </span>
              <Icon name="chevron-down" size={14} />
            </button>
          </div>
        </header>
        <div className="workspace-content">{children}</div>
      </div>
      <Modal description="Jump to a workspace surface without losing your place." onClose={() => setCommandOpen(false)} open={commandOpen} title="Command center" size="sm">
        <div className="command-list">
          {commandItems.map((item, index) => (
            <button className="command-item" key={item.href} onClick={() => goFromCommand(item.href)} type="button">
              <span className="command-item-icon">
                <Icon name={item.icon} size={17} />
              </span>
              <span>{item.label}</span>
              <Kbd>{index + 1}</Kbd>
            </button>
          ))}
        </div>
        <Divider />
        <button className="command-note" onClick={() => onOpenToast("Keyboard navigation is ready for the next step.")} type="button">
          <Icon name="info" size={15} />
          <span>Use ↑ ↓ to browse · Enter to open · Esc to close</span>
        </button>
      </Modal>
    </div>
  );
}
