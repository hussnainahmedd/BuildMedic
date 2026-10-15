import { useEffect, useMemo, useRef, useState } from "react";

import { analyzeLog } from "./analyzer";
import { PublicLayout, WorkspaceShell, type Navigate } from "./components/layout";
import { Toast } from "./components/ui";
import { DEMO_NODE_BUILD_LOG } from "./data";
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
import type {
  AnalysisHistoryEntry,
  AnalysisResult,
  AnalysisSource,
  ThemeMode,
  UserPreferences,
  VerificationResult,
} from "./types";
import { DEFAULT_USER_PREFERENCES } from "./types/preferences";
import { compareAnalysisResults } from "./verification";

const PREFERENCES_STORAGE_KEY = "buildmedic.preferences.v1";
const HISTORY_STORAGE_KEY = "buildmedic.history.v1";
const MAX_HISTORY_ENTRIES = 24;

interface SessionAnalysisRecord {
  readonly log: string;
  readonly result: AnalysisResult;
  readonly fileName?: string;
}

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

function isHistoryEntry(value: unknown): value is AnalysisHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AnalysisHistoryEntry>;
  return typeof candidate.id === "string"
    && typeof candidate.analysisId === "string"
    && typeof candidate.label === "string"
    && typeof candidate.createdAt === "string"
    && !Number.isNaN(Date.parse(candidate.createdAt))
    && (candidate.source === "paste" || candidate.source === "file")
    && (candidate.status === "complete" || candidate.status === "no-match" || candidate.status === "invalid")
    && typeof candidate.inputBytes === "number"
    && Number.isFinite(candidate.inputBytes)
    && candidate.inputBytes >= 0
    && typeof candidate.findingCount === "number"
    && Number.isFinite(candidate.findingCount)
    && candidate.findingCount >= 0
    && typeof candidate.summary === "string";
}

function readHistory(): readonly AnalysisHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preferences and metadata history are optional conveniences. A blocked or
    // full browser store must never prevent local analysis from working.
  }
}

function emptyAnalysis(): AnalysisResult {
  return analyzeLog("");
}

function makeHistoryEntry(
  result: AnalysisResult,
  source: AnalysisSource,
  fileName?: string,
): AnalysisHistoryEntry {
  const findingCount = result.status === "complete" ? result.findings.length : 0;
  const label = fileName || (source === "file" ? "Uploaded build log" : "Pasted build log");
  const summary = result.status === "complete"
    ? `${findingCount} ${findingCount === 1 ? "finding" : "findings"} from local deterministic rules.`
    : result.status === "no-match"
      ? "No supported diagnostic matched this log."
      : result.error.message;
  const topFindingId = result.status === "complete" ? result.findings[0]?.id : undefined;

  return {
    id: `history-${result.id}`,
    analysisId: result.id,
    label: label.slice(0, 120),
    createdAt: result.analyzedAt,
    source,
    status: result.status,
    inputBytes: result.input.byteCount,
    findingCount,
    summary: summary.slice(0, 240),
    ...(topFindingId ? { topFindingId } : {}),
  };
}

function resolveColorScheme(theme: ThemeMode): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
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
  const [currentLog, setCurrentLog] = useState("");
  const [currentFileName, setCurrentFileName] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<AnalysisResult>(emptyAnalysis);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly AnalysisHistoryEntry[]>(readHistory);
  const [sessionAnalyses, setSessionAnalyses] = useState<Record<string, SessionAnalysisRecord>>({});
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const analysisTimer = useRef<number | null>(null);
  const verificationTimer = useRef<number | null>(null);
  const isWorkspace = path === "/app" || path.startsWith("/app/");
  usePageTitle(path);

  const resolvedScheme = useMemo(() => resolveColorScheme(preferences.theme), [preferences.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedScheme;
    document.documentElement.dataset.motion = preferences.reducedMotion ? "reduced" : "full";
    writeLocalStorage(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, resolvedScheme]);

  useEffect(() => {
    writeLocalStorage(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => () => {
    if (analysisTimer.current !== null) window.clearTimeout(analysisTimer.current);
    if (verificationTimer.current !== null) window.clearTimeout(verificationTimer.current);
  }, []);

  const notify = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3600);
  };

  const openDemo = () => {
    setCurrentLog(DEMO_NODE_BUILD_LOG.text);
    setCurrentFileName(DEMO_NODE_BUILD_LOG.fileName);
    setAnalysis(emptyAnalysis());
    setAnalysisError(null);
    navigate("/app/new-analysis");
  };

  const handleAnalyze = (text: string, source: "paste" | "file" = "paste", fileName?: string) => {
    if (analysisTimer.current !== null) window.clearTimeout(analysisTimer.current);
    setCurrentLog(text);
    setCurrentFileName(fileName);
    setAnalysisError(null);
    setIsAnalyzing(true);
    setVerification(null);
    setIsVerifying(false);

    analysisTimer.current = window.setTimeout(() => {
      analysisTimer.current = null;
      try {
        const result = analyzeLog({ text, source, fileName }, {
          timestampFactory: () => new Date().toISOString(),
        });
        const entry = makeHistoryEntry(result, source, fileName);
        setAnalysis(result);
        setHistory((current) => [entry, ...current.filter((item) => item.analysisId !== result.id)].slice(0, MAX_HISTORY_ENTRIES));
        setSessionAnalyses((current) => ({ ...current, [result.id]: { log: text, result, fileName } }));
        setVerification(null);
        setIsAnalyzing(false);
        notify(result.status === "complete"
          ? `Analysis complete: ${result.findings.length} ${result.findings.length === 1 ? "finding" : "findings"}.`
          : result.status === "no-match"
            ? "Analysis complete: no supported diagnostic matched this log."
            : result.error.message);
        navigate("/app/analysis");
      } catch {
        setIsAnalyzing(false);
        setAnalysisError("The local analyzer could not complete. Your input is still available; try again.");
        notify("The local analyzer could not complete. Try again.");
      }
    }, 0);
  };

  const clearActiveSession = () => {
    if (analysisTimer.current !== null) {
      window.clearTimeout(analysisTimer.current);
      analysisTimer.current = null;
    }
    if (verificationTimer.current !== null) {
      window.clearTimeout(verificationTimer.current);
      verificationTimer.current = null;
    }
    setCurrentLog("");
    setCurrentFileName(undefined);
    setAnalysis(emptyAnalysis());
    setAnalysisError(null);
    setVerification(null);
    setIsAnalyzing(false);
    setIsVerifying(false);
  };

  const handleCompareVerification = (baseline: string, rerun: string) => {
    if (verificationTimer.current !== null) window.clearTimeout(verificationTimer.current);
    setIsVerifying(true);
    setVerification(null);
    verificationTimer.current = window.setTimeout(() => {
      verificationTimer.current = null;
      try {
        const baselineResult = analyzeLog({ text: baseline, source: "paste" }, { timestampFactory: () => new Date().toISOString() });
        const rerunResult = analyzeLog({ text: rerun, source: "paste" }, { timestampFactory: () => new Date().toISOString() });
        const comparison = compareAnalysisResults(baselineResult, rerunResult);
        setVerification(comparison);
        setIsVerifying(false);
        notify(comparison.status === "compared"
          ? `Comparison ready: ${comparison.outcome}.`
          : comparison.status === "no-match"
            ? "Comparison is uncertain because one side has no supported diagnosis."
            : comparison.error.message);
      } catch {
        setIsVerifying(false);
        notify("The local comparison could not complete. Try again.");
      }
    }, 0);
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // A blocked store is already empty from the application's perspective.
    }
    notify("Local analysis history metadata cleared.");
  };

  const openHistory = (analysisId: string) => {
    const record = sessionAnalyses[analysisId];
    if (!record) {
      notify("Only metadata for this analysis is available. Re-add the original log to reopen it.");
      return;
    }
    setCurrentLog(record.log);
    setCurrentFileName(record.fileName);
    setAnalysis(record.result);
    setAnalysisError(null);
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
    analysisError,
    history,
    isAnalyzing,
    isVerifying,
    currentLog,
    currentFileName,
    onAnalyze: handleAnalyze,
    onClearActive: clearActiveSession,
    onCompareVerification: handleCompareVerification,
    onClearHistory: clearHistory,
    onOpenHistory: openHistory,
    onNavigate: navigate,
    onNotify: notify,
    onPatchPreferences: patchPreferences,
    onSetTheme: setTheme,
    preferences,
    verification,
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
