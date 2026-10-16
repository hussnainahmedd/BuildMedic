import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { Icon, type IconName } from "./icons";
import { AppLink, Badge, Button, Divider, IconButton, Kbd, Modal, useDialogFocus, useMediaQuery } from "./ui";

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

export function ThemeToggle({ theme, onToggle }: { theme: "dark" | "light"; onToggle: () => void }) {
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return <IconButton className="theme-toggle" icon={theme === "dark" ? "sun" : "moon"} label={label} onClick={onToggle} />;
}

function SkipLink() {
  return <a className="skip-link" href="#main-content" onClick={(event) => {
    event.preventDefault();
    document.getElementById("main-content")?.focus();
  }}>Skip to main content</a>;
}

interface PublicLayoutProps {
  children: ReactNode;
  path: string;
  onNavigate: Navigate;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

const publicLinks = [
  { label: "Product", href: "/features" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Docs", href: "/documentation" },
];

export function PublicLayout({ children, path, onNavigate, theme, onToggleTheme }: PublicLayoutProps) {
  const [mobilePath, setMobilePath] = useState<string | null>(null);
  const isMobile = useMediaQuery("(max-width: 740px)");
  const mobileOpen = isMobile && mobilePath === path;
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMobilePath(null);
  }, [isMobile, path]);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!mobileOpen || !navigation) return;
    const trigger = document.querySelector<HTMLButtonElement>("[aria-controls='public-navigation']");
    navigation.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobilePath(null);
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (trigger && navigation.contains(document.activeElement) && getComputedStyle(trigger).display !== "none") trigger.focus({ preventScroll: true });
    };
  }, [isMobile, mobileOpen]);

  return (
    <div className="public-layout">
      <SkipLink />
      <header className="public-header">
        <div className="container public-header-inner">
          <AppLink className="brand-link" onNavigate={onNavigate} to="/">
            <BrandMark />
          </AppLink>
          <nav aria-label="Primary navigation" className={`public-nav${mobileOpen ? " public-nav-open" : ""}`} id="public-navigation" ref={navigationRef}>
            {publicLinks.map((link) => (
              <AppLink aria-current={path === link.href ? "page" : undefined} className={path === link.href ? "active" : ""} key={link.href} onClick={() => setMobilePath(null)} onNavigate={onNavigate} to={link.href}>
                {link.label}
              </AppLink>
            ))}
            <AppLink aria-current={path === "/about" ? "page" : undefined} className={path === "/about" ? "active" : ""} onClick={() => setMobilePath(null)} onNavigate={onNavigate} to="/about">
              About
            </AppLink>
            <div className="public-nav-mobile-actions">
              <Button onClick={() => { setMobilePath(null); onNavigate("/app/overview"); }} size="sm" icon="arrow-right" iconPosition="right">
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
              aria-controls="public-navigation"
              aria-expanded={mobileOpen}
              icon={mobileOpen ? "x" : "menu"}
              label={mobileOpen ? "Close navigation" : "Open navigation"}
              onClick={(event) => { event.currentTarget.focus(); setMobilePath(mobileOpen ? null : path); }}
            />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
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
  theme: "dark" | "light";
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
      { label: "History", description: "Local metadata", href: "/app/history", icon: "history" },
      { label: "Reports", description: "Sanitized text export", href: "/app/reports", icon: "file-text" },
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
                aria-current={active ? "page" : undefined}
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

export function WorkspaceShell({ children, path, onNavigate, theme, onToggleTheme }: WorkspaceShellProps) {
  const [sidebarPath, setSidebarPath] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 960px)");
  const sidebarOpen = isMobile && sidebarPath === path;
  const sidebarLayerRef = useRef<HTMLDivElement>(null);
  const closeSidebar = () => setSidebarPath(null);
  useDialogFocus(sidebarOpen, sidebarLayerRef, closeSidebar, ".sidebar-close");

  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!document.querySelector("[aria-modal='true']")) setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    setSidebarPath(null);
  }, [isMobile, path]);

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

  function handleCommandKey(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']"))) return;
    const commands = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".command-item")];
    const activeIndex = commands.indexOf(document.activeElement as HTMLButtonElement);
    const numberIndex = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : -1;
    if (numberIndex >= 0) {
      event.preventDefault();
      commands[numberIndex]?.click();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? commands.length - 1
        : event.key === "ArrowDown" ? (activeIndex + 1) % commands.length
          : activeIndex <= 0 ? commands.length - 1 : activeIndex - 1;
      commands[nextIndex]?.focus();
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      commands[activeIndex]?.click();
    }
  }

  return (
    <div className="workspace-layout">
      <SkipLink />
      <div className="workspace-sidebar-layer" ref={sidebarLayerRef} tabIndex={-1}>
        <aside
          aria-hidden={isMobile && !sidebarOpen ? true : undefined}
          aria-label={sidebarOpen ? "Workspace navigation" : undefined}
          aria-modal={sidebarOpen ? true : undefined}
          className={`workspace-sidebar${sidebarOpen ? " is-open" : ""}`}
          id="workspace-sidebar"
          inert={isMobile && !sidebarOpen}
          role={sidebarOpen ? "dialog" : undefined}
        >
          <div className="workspace-sidebar-top">
            <AppLink className="brand-link workspace-brand" onNavigate={onNavigate} to="/">
              <BrandMark />
            </AppLink>
            <IconButton className="sidebar-close" icon="x" label="Close sidebar" onClick={closeSidebar} />
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
          <WorkspaceNav onClose={closeSidebar} onNavigate={onNavigate} path={path} />
        </aside>
        {sidebarOpen ? <button aria-hidden="true" className="sidebar-overlay" onClick={closeSidebar} tabIndex={-1} type="button" /> : null}
      </div>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            <IconButton aria-controls="workspace-sidebar" aria-expanded={sidebarOpen} aria-haspopup="dialog" className="sidebar-open" icon="menu" label="Open sidebar" onClick={(event) => { event.currentTarget.focus(); setSidebarPath(path); }} />
            <div className="breadcrumbs">
              <AppLink onNavigate={onNavigate} to="/app/overview">
                Workspace
              </AppLink>
              <Icon name="chevron-right" size={14} />
              <span aria-current="page">{pageTitle}</span>
            </div>
          </div>
          <div className="workspace-topbar-actions">
            <button aria-controls="workspace-command-center" aria-expanded={commandOpen} aria-haspopup="dialog" aria-label="Search workspace" className="command-trigger" onClick={(event) => { event.currentTarget.focus(); setCommandOpen(true); }} type="button">
              <Icon name="search" size={15} />
              <span>Search workspace</span>
              <Kbd>⌘ K</Kbd>
            </button>
            <Badge dot tone="accent">
              Demo mode
            </Badge>
            <ThemeToggle onToggle={onToggleTheme} theme={theme} />
            <IconButton className="workspace-help-button" icon="circle-help" label="Open help" onClick={() => onNavigate("/app/help")} />
            <button aria-label="Open settings" className="avatar-button" onClick={() => onNavigate("/app/settings")} type="button">
              <span className="avatar">BM</span>
              <span className="avatar-copy">
                <strong>BuildMedic</strong>
                <small>Local user</small>
              </span>
              <Icon name="chevron-down" size={14} />
            </button>
          </div>
        </header>
        <main className="workspace-content" id="main-content" tabIndex={-1}>{children}</main>
      </div>
      <Modal description="Jump to a workspace surface without losing your place." id="workspace-command-center" onClose={() => setCommandOpen(false)} onKeyDown={handleCommandKey} open={commandOpen} title="Command center" size="sm">
        <div className="command-list">
          {commandItems.map((item, index) => (
            <button aria-keyshortcuts={String(index + 1)} className="command-item" key={item.href} onClick={() => goFromCommand(item.href)} type="button">
              <span className="command-item-icon">
                <Icon name={item.icon} size={17} />
              </span>
              <span>{item.label}</span>
              <Kbd>{index + 1}</Kbd>
            </button>
          ))}
        </div>
        <Divider />
        <p className="command-note">
          <Icon name="info" size={15} />
          <span>Use ↑ ↓ to browse · Enter to open · 1–4 to jump · Esc to close</span>
        </p>
      </Modal>
    </div>
  );
}
