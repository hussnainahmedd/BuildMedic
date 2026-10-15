import { useEffect, useMemo, useState } from "react";

import { PublicLayout, WorkspaceShell, type Navigate } from "./components/layout";
import { Toast } from "./components/ui";
import { DEMO_ANALYSIS, DEMO_NODE_BUILD_LOG } from "./data";
import { getUtf8ByteLength } from "./lib/validation";
import {
  AboutPage,
  DocumentationPage,
  FeaturesPage,
  HomePage,
  HowItWorksPage,
  NotFoundPage,
  PrivacyPage,
  SecurityPage,
  SupportPage,
  type PublicPageProps,
} from "./pages/public";
import {
  AnalysisPage,
  HelpPage,
  HistoryPage,
  LogViewerPage,
  NewAnalysisPage,
  OverviewPage,
  ReportsPage,
  SettingsPage,
  VerificationPage,
  type WorkspacePageProps,
} from "./pages/workspace";
import type { DemoAnalysisResult, ThemeMode, UserPreferences } from "./types";
import { DEFAULT_USER_PREFERENCES } from "./types/preferences";

const PREFERENCES_STORAGE_KEY = "buildmedic.preferences.v1";

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname || "/";
}

function useCurrentPath(): [string, Navigate] {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate: Navigate = (nextPath) => {
    if (/^(https?:|mailto:)/.test(nextPath)) {
      window.open(nextPath, "_blank", "noopener,noreferrer");
      return;
    }
    const normalized = normalizePath(nextPath.split("#")[0] || "/");
    if (normalized === normalizePath(window.location.pathname)) {
      if (nextPath.includes("#")) window.location.hash = nextPath.split("#")[1] ?? "";
      setPath(normalized);
      return;
    }
    window.history.pushState({}, "", nextPath);
    setPath(normalized);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return [path, navigate];
}

function readPreferences(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      ...DEFAULT_USER_PREFERENCES,
      ...parsed,
      theme: parsed.theme === "dark" || parsed.theme === "light" || parsed.theme === "system" ? parsed.theme : DEFAULT_USER_PREFERENCES.theme,
      defaultInputMode: parsed.defaultInputMode === "file" ? "file" : "paste",
      displayDensity: parsed.displayDensity === "compact" ? "compact" : "comfortable",
      reducedMotion: Boolean(parsed.reducedMotion),
      showLineNumbers: parsed.showLineNumbers !== false,
      showEvidenceContext: parsed.showEvidenceContext !== false,
    };
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

function resolveColorScheme(theme: ThemeMode): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function makeDemoResponse(text: string, source: "paste" | "file", fileName?: string): DemoAnalysisResult {
  if (DEMO_ANALYSIS.status !== "complete") {
    return DEMO_ANALYSIS;
  }

  return {
    ...DEMO_ANALYSIS,
    id: `demo-analysis-${Date.now()}`,
    analyzedAt: new Date().toISOString(),
    input: {
      ...DEMO_ANALYSIS.input,
      source,
      fileName: fileName ?? (source === "file" ? DEMO_NODE_BUILD_LOG.fileName : undefined),
      byteCount: getUtf8ByteLength(text),
      lineCount: text.split("\n").length,
    },
    message: "Demonstration response loaded. Live analysis is planned.",
  };
}

function usePageTitle(path: string) {
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "BuildMedic — Build failures, made legible.",
      "/features": "Features — BuildMedic",
      "/how-it-works": "How it works — BuildMedic",
      "/documentation": "Documentation — BuildMedic",
      "/about": "About — BuildMedic",
      "/support": "Support — BuildMedic",
      "/privacy": "Privacy — BuildMedic",
      "/security": "Security — BuildMedic",
      "/app/overview": "Overview — BuildMedic Lab",
      "/app/new-analysis": "New analysis — BuildMedic Lab",
      "/app/analysis": "Analysis results — BuildMedic Lab",
      "/app/log-viewer": "Log viewer — BuildMedic Lab",
      "/app/verification": "Verification — BuildMedic Lab",
      "/app/history": "History — BuildMedic Lab",
      "/app/reports": "Reports — BuildMedic Lab",
      "/app/settings": "Settings — BuildMedic Lab",
      "/app/help": "Help — BuildMedic Lab",
    };
    document.title = titles[path] ?? "BuildMedic — Developer diagnostics";
  }, [path]);
}

export function App() {
  const [path, navigate] = useCurrentPath();
  const [preferences, setPreferences] = useState<UserPreferences>(readPreferences);
  const [currentLog, setCurrentLog] = useState(DEMO_NODE_BUILD_LOG.text);
  const [analysis, setAnalysis] = useState<DemoAnalysisResult>(DEMO_ANALYSIS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const isWorkspace = path === "/app" || path.startsWith("/app/");
  usePageTitle(path);

  const resolvedScheme = useMemo(() => resolveColorScheme(preferences.theme), [preferences.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedScheme;
    document.documentElement.dataset.motion = preferences.reducedMotion ? "reduced" : "full";
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, resolvedScheme]);

  const notify = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3600);
  };

  const openDemo = () => {
    setCurrentLog(DEMO_NODE_BUILD_LOG.text);
    navigate("/app/new-analysis");
  };

  const handleAnalyze = (text: string, source: "paste" | "file" = "paste", fileName?: string) => {
    setCurrentLog(text);
    setAnalysis(makeDemoResponse(text, source, fileName));
    notify("Demonstration result loaded. Live analysis is planned.");
    navigate("/app/analysis");
  };

  const patchPreferences = (patch: Partial<UserPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  };

  const setTheme = (theme: ThemeMode) => patchPreferences({ theme });
  const toggleTheme = () => setTheme(resolvedScheme === "dark" ? "light" : "dark");

  const publicProps: PublicPageProps = { onNavigate: navigate, onNotify: notify, onOpenDemo: openDemo };
  const workspaceProps: WorkspacePageProps = {
    analysis,
    currentLog,
    onAnalyze: handleAnalyze,
    onNavigate: navigate,
    onNotify: notify,
    onPatchPreferences: patchPreferences,
    onSetTheme: setTheme,
    preferences,
    theme: preferences.theme,
  };

  return (
    <div className="app-root">
      {isWorkspace ? (
        <WorkspaceShell onNavigate={navigate} onOpenToast={notify} onToggleTheme={toggleTheme} path={path} theme={preferences.theme}>
          {renderWorkspacePage(path, workspaceProps)}
        </WorkspaceShell>
      ) : (
        <PublicLayout onNavigate={navigate} onToggleTheme={toggleTheme} path={path} theme={preferences.theme}>
          {renderPublicPage(path, publicProps)}
        </PublicLayout>
      )}
      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}

function renderPublicPage(path: string, props: PublicPageProps) {
  switch (path) {
    case "/": return <HomePage {...props} />;
    case "/features": return <FeaturesPage {...props} />;
    case "/how-it-works": return <HowItWorksPage {...props} />;
    case "/documentation": return <DocumentationPage {...props} />;
    case "/about": return <AboutPage {...props} />;
    case "/support": return <SupportPage {...props} />;
    case "/privacy": return <PrivacyPage {...props} />;
    case "/security": return <SecurityPage {...props} />;
    default: return <NotFoundPage {...props} />;
  }
}

function renderWorkspacePage(path: string, props: WorkspacePageProps) {
  switch (path) {
    case "/app":
    case "/app/overview": return <OverviewPage {...props} />;
    case "/app/new-analysis": return <NewAnalysisPage {...props} />;
    case "/app/analysis": return <AnalysisPage {...props} />;
    case "/app/log-viewer": return <LogViewerPage {...props} />;
    case "/app/verification": return <VerificationPage {...props} />;
    case "/app/history": return <HistoryPage {...props} />;
    case "/app/reports": return <ReportsPage {...props} />;
    case "/app/settings": return <SettingsPage {...props} />;
    case "/app/help": return <HelpPage {...props} />;
    default: return <NotFoundPage {...props} onOpenDemo={() => props.onNavigate("/app/new-analysis")} />;
  }
}
